"""Runs requests the website drops into storage.

The site writes jobs/pending/<id>.json; the worker moves each job to jobs/running/, runs it,
then to jobs/done/ (with the result key), jobs/failed/ (with the error) or jobs/waiting/
(a Claude step is waiting on a handoff answer; needs an API key to run unattended).

Cancelling: the site deletes a pending or waiting job itself. For a running job it writes
jobs/cancel/<id>.json; the worker checks for it between steps and moves the job to
jobs/cancelled/. If the marker says remove_brand (a new brand's setup), the brand's files go too.

Job types:
  report      {brand}                          weekly run: ads -> creative -> breakdown -> verify -> report
  iterations  {brand, report, ads, format, per_ad, idea}  winners #ads of a report, and/or
                                               your own idea -> iterations
                                               (format: ugc, broll, static)
  briefs      {brand, picks: [{iterations, number}]}  iterations from any files -> one
                                               creative brief doc (or {iterations, numbers})
  setup   {brand}                     new brand: profile, competitors, VOC, ads, research brief
  research {brand}                    refresh: re-pull customer quotes, re-run the 4 research prompts
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone

from . import ads, breakdown, creative, ingredients, llm, mechanisms, research, setup, stages, voc
from . import brand as brandlib

log = logging.getLogger("cse")


class Cancelled(Exception):
    pass


def run_weekly(storage, slug: str, pages: int = 1, check=lambda: None) -> str | None:
    name = stages.brand_context(storage, slug)["brand_name"]
    ads.run(storage, slug, max_pages=pages)
    check()
    creative.run(storage, slug, per_brand=5)
    check()
    if breakdown.run(storage, slug, name, per_brand=5)["waiting"]:
        raise llm.HandoffPending(f"brands/{slug}/handoff/breakdown-*", "(breakdown answers)")
    check()
    ads.verify(storage, slug, stages.report_candidates(stages.load_ads(storage, slug)))
    return stages.run_report(storage, slug)


def _move(storage, job: dict, src: str, dst: str, **extra) -> dict:
    job = {**job, **extra, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    storage.write_text(f"jobs/{dst}/{job['id']}.json", json.dumps(job, indent=2))
    storage.delete(f"jobs/{src}/{job['id']}.json")
    return job


def cancel_marker(job: dict) -> str:
    return f"jobs/cancel/{job['id']}.json"


def run_job(storage, job: dict) -> str | None:
    slug = brandlib.validate_slug(job["brand"])

    def check():
        if storage.exists(cancel_marker(job)):
            raise Cancelled()

    check()
    if job["type"] == "report":
        return run_weekly(storage, slug, check=check)
    if job["type"] == "iterations":
        report_key = (brandlib.brand_key(slug, f"reports/{job['report']}.md")
                      if job.get("report") else None)
        return stages.run_iterations(storage, slug, report_key,
                                     [int(n) for n in job.get("ads") or []],
                                     fmt=job.get("format") or "ugc",
                                     per_ad=int(job.get("per_ad") or 1), idea=job.get("idea"),
                                     creator=job.get("creator"))
    if job["type"] == "briefs":
        picks = job.get("picks") or [{"iterations": job["iterations"], "number": n}
                                     for n in job["numbers"]]
        return stages.run_brief_picks(storage, slug, [
            (brandlib.brand_key(slug, f"iterations/{p['iterations']}.md"), int(p["number"]))
            for p in picks], creator=job.get("creator"))
    if job["type"] == "setup":
        if not llm.api_key():  # web research has no handoff mode
            raise llm.HandoffPending("", "")
        return setup.run(storage, slug, check=check)
    if job["type"] == "research":
        voc.run(storage, slug)
        check()
        out = research.run(storage, slug)
        check()
        if out:
            mechanisms.run(storage, slug)
        return out
    if job["type"] == "mechanisms":
        return mechanisms.run(storage, slug)
    if job["type"] == "rank_mechanisms":
        return mechanisms.rank(storage, slug)
    if job["type"] == "ingredients":
        if not llm.api_key():  # the claims need web search, which has no handoff mode here
            raise llm.HandoffPending("", "")
        return ingredients.run(storage, slug)
    raise ValueError(f"unknown job type {job['type']!r}")


def process_one(storage) -> bool:
    """Run the oldest pending job. Returns False when there was nothing to do."""
    pending = sorted(k for k in storage.list("jobs/pending/") if k.endswith(".json"))
    if not pending:
        return False
    job = json.loads(storage.read_text(pending[0]))
    job = _move(storage, job, "pending", "running")
    log.info("worker: %s %s for %s", job["id"], job["type"], job["brand"])
    try:
        result = run_job(storage, job)
        if storage.exists(cancel_marker(job)):  # cancelled during the last step
            raise Cancelled()
        if result is None:  # a Claude step wrote a handoff prompt instead of an answer
            raise llm.HandoffPending("", "")
        _move(storage, job, "running", "done", result=result)
    except Cancelled:
        marker = json.loads(storage.read_text(cancel_marker(job)))
        if marker.get("remove_brand"):
            for key in storage.list(f"brands/{brandlib.validate_slug(job['brand'])}/"):
                storage.delete(key)
        storage.delete(cancel_marker(job))
        _move(storage, job, "running", "cancelled")
        log.info("worker: %s cancelled", job["id"])
    except llm.HandoffPending:
        _move(storage, job, "running", "waiting",
              error="waiting on a Claude step: add ORE_ANTHROPIC_API_KEY to run unattended")
    except Exception as e:  # noqa: BLE001 - record any failure on the job
        log.exception("worker: job %s failed", job["id"])
        _move(storage, job, "running", "failed", error=str(e)[:300])
    return True


def loop(storage, once: bool = False, every: int = 30) -> None:
    log.info("worker: watching jobs/pending/ in %s", storage.describe())
    while True:
        did = process_one(storage)
        if once and not did:
            return
        if not did:
            time.sleep(every)
