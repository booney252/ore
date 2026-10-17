"""Runs requests the website drops into storage.

The site writes jobs/pending/<id>.json; the worker moves each job to jobs/running/, runs it,
then to jobs/done/ (with the result key), jobs/failed/ (with the error) or jobs/waiting/
(a Claude step is waiting on a handoff answer; needs an API key to run unattended).

Job types:
  report  {brand, idea_count}         full weekly run: ads -> creative -> breakdown -> verify -> report
  scripts {brand, ideas, report}      scripts for chosen ideas
  briefs  {brand, ideas, report}      creative briefs for chosen ideas
  setup   {brand}                     new brand: profile, competitors, VOC, ads, research brief
  research {brand}                    refresh: re-pull customer quotes, re-run the 4 research prompts
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone

from . import ads, breakdown, creative, llm, research, setup, stages, voc
from . import brand as brandlib

log = logging.getLogger("cse")


def run_weekly(storage, slug: str, idea_count: int, pages: int = 1) -> str | None:
    name = stages.brand_context(storage, slug)["brand_name"]
    ads.run(storage, slug, max_pages=pages)
    creative.run(storage, slug, per_brand=5)
    if breakdown.run(storage, slug, name, per_brand=5)["waiting"]:
        raise llm.HandoffPending(f"brands/{slug}/handoff/breakdown-*", "(breakdown answers)")
    ads.verify(storage, slug, stages.report_candidates(stages.load_ads(storage, slug)))
    return stages.run_report(storage, slug, idea_count)


def _move(storage, job: dict, src: str, dst: str, **extra) -> dict:
    job = {**job, **extra, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    storage.write_text(f"jobs/{dst}/{job['id']}.json", json.dumps(job, indent=2))
    storage.delete(f"jobs/{src}/{job['id']}.json")
    return job


def run_job(storage, job: dict) -> str | None:
    slug = brandlib.validate_slug(job["brand"])
    if job["type"] == "report":
        return run_weekly(storage, slug, int(job.get("idea_count") or 10))
    if job["type"] in ("scripts", "briefs"):
        report_key = (brandlib.brand_key(slug, f"reports/{job['report']}.md")
                      if job.get("report") else None)
        return stages.run_followup(storage, slug, job["type"],
                                   [int(n) for n in job["ideas"]], report_key)
    if job["type"] == "setup":
        if not os.environ.get("ANTHROPIC_API_KEY"):  # web research has no handoff mode
            raise llm.HandoffPending("", "")
        return setup.run(storage, slug)
    if job["type"] == "research":
        voc.run(storage, slug)
        return research.run(storage, slug)
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
        if result is None:  # a Claude step wrote a handoff prompt instead of an answer
            raise llm.HandoffPending("", "")
        _move(storage, job, "running", "done", result=result)
    except llm.HandoffPending:
        _move(storage, job, "running", "waiting",
              error="waiting on a Claude step: add ANTHROPIC_API_KEY to run unattended")
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
