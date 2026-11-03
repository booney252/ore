"""Runs requests the website drops into storage.

The site writes jobs/pending/<id>.json; the worker moves each job to jobs/running/, runs it,
then to jobs/done/ (with the result key), jobs/failed/ (with the error) or jobs/waiting/
(a Claude step is waiting on a handoff answer; needs an API key to run unattended).

Cancelling: the site deletes a pending or waiting job itself. For a running job it writes
jobs/cancel/<id>.json; the worker checks for it between steps and moves the job to
jobs/cancelled/. If the marker says remove_brand (a new brand's setup), the brand's files go too.

Job types:
  report      {brand}                          weekly run: ads -> creative -> breakdown -> verify -> report
  lessons     {brand, feedback}                  copy feedback -> brand and craft lessons
  iterations  {brand, report, ads, format, per_ad, idea}  winners #ads of a report, and/or
                                               your own idea -> iterations
                                               (format: ugc, broll, static)
  briefs      {brand, picks: [{iterations, number}]}  iterations from any files -> one
                                               creative brief doc (or {iterations, numbers})
  track   {brand}                     daily: each advertiser's top 10; break down the new ones breaking in
  setup   {brand}                     new brand: profile, competitors, VOC, ads, research brief
  research {brand}                    refresh: re-pull customer quotes, re-run the 4 research prompts
  breakdown {brand, ad}               one ad, on demand: transcribe it if needed, then take it apart

A report job with batch: true (the scheduled weekly run) sends its breakdowns and the report to
the Batch API (half price). It waits in jobs/batching/ until the batch ends, then goes back to
jobs/pending/ with resume set, and picks up where it stopped without pulling ads again.
"""

from __future__ import annotations

import json
import logging
import os
import time
from contextlib import nullcontext
from datetime import datetime, timezone

from . import ads, batch, breakdown, creative, lessons, masters, organic, ingredients, llm, mechanisms, research, setup, stages, studio, tracking, voc
from . import brand as brandlib

log = logging.getLogger("cse")


class Cancelled(Exception):
    pass


WEEKLY_ORGANIC_PAGES = 2  # newest ~24 posts per account: what's new since last week (1 credit a page)


def run_weekly(storage, slug: str, pages: int = 1, check=lambda: None, batch_api: bool = False,
               resume: str | None = None) -> str | None:
    """ads -> creative -> breakdown -> verify -> report. With batch_api, the breakdowns and the
    report go through the Batch API: raises batch.Pending after sending each, and `resume`
    ("breakdown" or "report") continues from there once the answers are in."""
    name = stages.brand_context(storage, slug)["brand_name"]
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    batching = batch_api and llm.mode() == "api"
    if resume is None:
        if storage.exists(brandlib.brand_key(slug, "competitors.json")):
            ads.run(storage, slug, max_pages=pages)
            check()
        if organic.accounts(fields):  # organic brands (e.g. an affiliate campaign): Reels, TikToks, Shorts
            organic.pull(storage, slug, max_pages=WEEKLY_ORGANIC_PAGES)
            organic.check_topics(storage, slug)  # winners that aren't about the niche drop out
            check()
        # Each advertiser's top 5, plus the best of every report lane (proven, rising, UGC, statics,
        # LFS, B-roll), so each section of the report has broken-down winners to pick from.
        lanes = stages.lane_candidates(stages.load_ads(storage, slug), formats=stages.report_formats(fields))
        creative.run(storage, slug, per_brand=5, ids=lanes)
        check()
    if resume in (None, "breakdown"):
        lanes = stages.lane_candidates(stages.load_ads(storage, slug), formats=stages.report_formats(fields))
        with (batch.collect(storage) if batching else nullcontext()) as b:
            waiting = breakdown.run(storage, slug, name, per_brand=5, ids=lanes)["waiting"]
        if b is not None and b.ids:
            raise batch.Pending(b.ids, "breakdown")
        if waiting:
            raise llm.HandoffPending(f"brands/{slug}/handoff/breakdown-*", "(breakdown answers)")
        check()
        ads.verify(storage, slug, stages.report_candidates(stages.load_ads(storage, slug)))
    with (batch.collect(storage) if batching else nullcontext()) as b:
        key = stages.run_report(storage, slug)
    if b is not None and b.ids:
        raise batch.Pending(b.ids, "report")
    return key


def run_breakdown(storage, slug: str, ad_id: str, check=lambda: None) -> str | None:
    """One ad on demand (someone opened it on the site): transcribe it if it hasn't been, then
    take it apart. Returns the ads file key, or None if the ad couldn't be broken down."""
    creative.run(storage, slug, limit=0, ids=[ad_id])
    check()
    name = stages.brand_context(storage, slug)["brand_name"]
    out = breakdown.run(storage, slug, name, limit=0, ids=[ad_id])
    if out["waiting"]:
        raise llm.HandoffPending(f"brands/{slug}/handoff/breakdown-{ad_id}", "(breakdown answer)")
    if not out["done"]:
        raise llm.LLMError("Ore couldn't take this ad apart (its video may have expired)")
    return brandlib.brand_key(slug, "ads.json")


def run_first_report(storage, slug: str, check=lambda: None) -> str | None:
    """A new brand's first report. There's no history yet, so no breakouts: today's top 10 for
    every competitor (the baseline) shows which young ads are already getting money, next to the
    long-runners they keep paying for. Daily tracking flags real breakouts from tomorrow on."""
    name = stages.brand_context(storage, slug)["brand_name"]
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    tracking.run(storage, slug)
    check()
    lanes = stages.lane_candidates(stages.load_ads(storage, slug), formats=stages.report_formats(fields))
    creative.run(storage, slug, per_brand=5, ids=lanes)
    check()
    lanes = stages.lane_candidates(stages.load_ads(storage, slug), formats=stages.report_formats(fields))
    if breakdown.run(storage, slug, name, per_brand=5, ids=lanes)["waiting"]:
        raise llm.HandoffPending(f"brands/{slug}/handoff/breakdown-*", "(breakdown answers)")
    check()
    return stages.run_report(storage, slug)


def run_track(storage, slug: str, check=lambda: None) -> str:
    """Daily top-10 tracking, then transcribe and break down whatever broke into a top 10, so a
    breakout is ready to read (and to iterate on) the day it shows up."""
    out = tracking.run(storage, slug)
    if out["new_ids"]:
        check()
        creative.run(storage, slug, limit=0, ids=out["new_ids"])
        check()
        name = stages.brand_context(storage, slug)["brand_name"]
        if breakdown.run(storage, slug, name, limit=0, ids=out["new_ids"])["waiting"]:
            raise llm.HandoffPending(f"brands/{slug}/handoff/breakdown-*", "(breakdown answers)")
    return out["key"]


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
        return run_weekly(storage, slug, check=check, batch_api=bool(job.get("batch")),
                          resume=job.get("resume"))
    if job["type"] == "breakdown":
        return run_breakdown(storage, slug, str(job["ad"]), check=check)
    if job["type"] == "iterations":
        report_key = (brandlib.brand_key(slug, f"reports/{job['report']}.md")
                      if job.get("report") else None)
        return stages.run_iterations(storage, slug, report_key,
                                     [int(n) for n in job.get("ads") or []],
                                     fmt=job.get("format") or "ugc",
                                     per_ad=int(job.get("per_ad") or 1), idea=job.get("idea"),
                                     creator=job.get("creator"), segment=job.get("segment"))
    if job["type"] == "briefs":
        picks = job.get("picks") or [{"iterations": job["iterations"], "number": n}
                                     for n in job["numbers"]]
        return stages.run_brief_picks(storage, slug, [
            (brandlib.brand_key(slug, f"iterations/{p['iterations']}.md"), int(p["number"]))
            for p in picks], creator=job.get("creator"), segment=job.get("segment"))
    if job["type"] == "track":
        return run_track(storage, slug, check=check)
    if job["type"] == "setup":
        if not llm.api_key():  # web research has no handoff mode
            raise llm.HandoffPending("", "")
        out = setup.run(storage, slug, check=check)
        try:  # the first report, so a new brand lands on what's working, not an empty page
            run_first_report(storage, slug, check=check)
        except Cancelled:
            raise
        except Exception:  # noqa: BLE001 - the research is done; a failed report shouldn't undo it
            log.exception("setup: first report failed for %s", slug)
        return out
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
    if job["type"] == "angles":
        return studio.run_angles(storage, job["session"])
    if job["type"] == "scripts":
        return studio.run_scripts(storage, job["session"])
    if job["type"] == "tweak":
        return studio.run_tweak(storage, job["session"], str(job["script"]), job["action"])
    if job["type"] == "rank_mechanisms":
        return mechanisms.rank(storage, slug)
    if job["type"] == "master":  # a new master script from an idea, then Ore's rules check
        return masters.create(storage, slug, job["idea"], report=job.get("report"),
                              ads=[int(a) for a in job.get("ads") or []],
                              creators=job.get("creators") or [])
    if job["type"] == "revise":
        return masters.revise(storage, slug, job["master"], feedback=job.get("note") or "")
    if job["type"] == "versions":
        return masters.make_versions(storage, slug, job["master"], only=job.get("creators") or None)
    if job["type"] == "assign":
        return masters.suggest(storage, slug, only=job.get("master"))
    if job["type"] == "lessons":  # fold one piece of copy feedback into the brand + craft lessons
        return lessons.learn(storage, slug, job["feedback"])
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
    except batch.Pending as p:
        _move(storage, job, "running", "batching", batch_ids=p.ids, resume=p.resume)
        log.info("worker: %s waiting on the Batch API (%s)", job["id"], ", ".join(p.ids))
    except llm.HandoffPending:
        _move(storage, job, "running", "waiting",
              error="waiting on a Claude step: add ORE_ANTHROPIC_API_KEY to run unattended")
    except Exception as e:  # noqa: BLE001 - record any failure on the job
        log.exception("worker: job %s failed", job["id"])
        _move(storage, job, "running", "failed", error=str(e)[:300])
    return True


def check_batches(storage, client=None) -> int:
    """Jobs waiting on the Batch API: once all their batches have ended, save the answers and
    put the job back in pending to resume. Returns how many jobs went back."""
    moved = 0
    for key in sorted(k for k in storage.list("jobs/batching/") if k.endswith(".json")):
        job = json.loads(storage.read_text(key))
        try:
            if not all(batch.ended(b, client) for b in job.get("batch_ids") or []):
                continue
            for b in job.get("batch_ids") or []:
                batch.fetch(storage, b, client)
        except Exception as e:  # noqa: BLE001 - a lookup failure: try again next round
            log.warning("worker: couldn't check batch for %s: %s", job["id"], e)
            continue
        _move(storage, {k: v for k, v in job.items() if k != "batch_ids"}, "batching", "pending")
        moved += 1
        log.info("worker: %s batch done, resuming at %s", job["id"], job.get("resume"))
    return moved


def loop(storage, once: bool = False, every: int = 30) -> None:
    log.info("worker: watching jobs/pending/ in %s", storage.describe())
    while True:
        check_batches(storage)
        did = process_one(storage)
        if once and not did:
            return
        if not did:
            time.sleep(every)
