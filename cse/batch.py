"""Batch API runs for the scheduled jobs: half price, answers within hours instead of minutes.

Inside `collect()`, llm.ask() queues its request instead of calling Claude and raises
BatchQueued (a HandoffPending, so callers treat it like a waiting step). When the block ends,
everything queued goes to the Batch API. When the batch has ended, `fetch()` saves each answer
next to its normal answer file as <step>.batch.md; the next llm.ask() for that step reads it
instead of calling Claude. A request the batch couldn't answer gets <step>.batch.err, and that
step then runs live.

Only scheduled work (the weekly run) uses this. Anything a person starts on the site runs live.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from contextlib import contextmanager
from types import SimpleNamespace

from . import usage

log = logging.getLogger("cse")

CHUNK = 20  # requests per batch: ad breakdowns carry video frames, so keep each batch small
POLL_SECONDS = 60

_lock = threading.Lock()
_queue: list[dict] | None = None


class Pending(Exception):
    """A scheduled job sent work to the Batch API; resume it at `resume` once `ids` have ended."""

    def __init__(self, ids: list[str], resume: str):
        super().__init__(f"waiting on batch {', '.join(ids)}")
        self.ids, self.resume = ids, resume


def active() -> bool:
    return _queue is not None


def add(slug: str, step: str, answer_key: str, params: dict) -> None:
    with _lock:
        if _queue is None:
            raise RuntimeError("batch.add outside batch.collect")
        _queue.append({"slug": slug, "step": step, "key": answer_key, "params": params})


@contextmanager
def collect(storage, client=None):
    """Queue every llm.ask() inside the block; submit them when it ends (`.ids` has the batches)."""
    global _queue
    with _lock:
        _queue = []
    holder = SimpleNamespace(ids=[])
    try:
        yield holder
    finally:
        with _lock:
            items, _queue = _queue or [], None
        if items:
            holder.ids.extend(submit(storage, items, client))


def submit(storage, items: list[dict], client=None) -> list[str]:
    from . import llm

    client = client or llm.make_client()
    ids = []
    for start in range(0, len(items), CHUNK):
        chunk = items[start:start + CHUNK]
        reqs = [{"custom_id": f"r{i}", "params": it["params"]} for i, it in enumerate(chunk)]
        b = client.messages.batches.create(requests=reqs)
        storage.write_text(f"jobs/batches/{b.id}.json", json.dumps({
            "id": b.id, "requests": {f"r{i}": {k: it[k] for k in ("slug", "step", "key")}
                                     for i, it in enumerate(chunk)}}, indent=2))
        ids.append(b.id)
        log.info("batch: sent %d requests as %s", len(chunk), b.id)
    return ids


def ended(batch_id: str, client=None) -> bool:
    from . import llm

    client = client or llm.make_client()
    return client.messages.batches.retrieve(batch_id).processing_status == "ended"


def fetch(storage, batch_id: str, client=None) -> dict:
    """Save an ended batch's answers (and usage) for the steps that asked. Returns counts."""
    from . import llm

    client = client or llm.make_client()
    rec_key = f"jobs/batches/{batch_id}.json"
    if not storage.exists(rec_key):
        return {"done": 0, "failed": 0}
    reqs = json.loads(storage.read_text(rec_key))["requests"]
    done = failed = 0
    for entry in client.messages.batches.results(batch_id):
        req = reqs.get(entry.custom_id)
        if not req:
            continue
        base = req["key"].removesuffix(".answer.md")
        result = entry.result
        msg = getattr(result, "message", None)
        if result.type == "succeeded" and msg is not None and msg.stop_reason != "refusal":
            storage.write_text(f"{base}.batch.md", llm._text(msg))
            usage.record(storage, req["slug"], req["step"], msg.usage, msg.model, batch=True)
            done += 1
        else:  # errored, expired, cancelled or declined: this step runs live next time
            storage.write_text(f"{base}.batch.err", result.type)
            failed += 1
    storage.delete(rec_key)
    log.info("batch: %s ended, %d answers saved, %d will run live", batch_id, done, failed)
    return {"done": done, "failed": failed}


def wait(storage, ids: list[str], client=None) -> None:
    """Block until every batch has ended and its answers are saved (command-line runs)."""
    left = list(ids)
    while left:
        for bid in list(left):
            if ended(bid, client):
                fetch(storage, bid, client)
                left.remove(bid)
        if left:
            log.info("batch: %d still running, checking again in %ds", len(left), POLL_SECONDS)
            time.sleep(POLL_SECONDS)
