"""What each Claude call costs: one small record per call in storage, and a monthly summary.

Records: usage/<YYYY-MM>/<brand>/<time>-<step>-<id>.json, so a month (or one brand's month)
is one folder to add up. Logging never breaks a job: a failed write is only a warning.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from collections import defaultdict
from datetime import datetime, timezone

log = logging.getLogger("cse")

# $ per million tokens: (input, output, cache read). Cache writes cost 1.25x input.
# Batch API calls cost half. Web search: $10 per 1,000 searches.
PRICES = {
    "claude-opus-5-5": (4.0, 20.0, 0.20),
    "claude-opus-5": (5.0, 25.0, 0.50),
    "claude-opus-4-8": (5.0, 25.0, 0.50),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20),
    "claude-sonnet-5": (2.0, 10.0, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}
DEFAULT_PRICE = PRICES["claude-opus-5-5"]
SEARCH_PRICE = 0.01


def _get(obj, name: str) -> int:
    v = obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)
    return int(v or 0)


def tokens(usage) -> dict:
    """The counts we keep from an API usage object (or dict)."""
    tools = (usage.get("server_tool_use") if isinstance(usage, dict)
             else getattr(usage, "server_tool_use", None))
    return {"input": _get(usage, "input_tokens"), "output": _get(usage, "output_tokens"),
            "cache_write": _get(usage, "cache_creation_input_tokens"),
            "cache_read": _get(usage, "cache_read_input_tokens"),
            "searches": _get(tools, "web_search_requests") if tools else 0}


def cost(model: str, t: dict, batch: bool = False) -> float:
    """Dollars for one call's token counts."""
    inp, out, read = PRICES.get(model or "", DEFAULT_PRICE)
    dollars = (t["input"] * inp + t["cache_write"] * inp * 1.25 + t["cache_read"] * read
               + t["output"] * out) / 1_000_000
    if batch:
        dollars /= 2
    return round(dollars + t.get("searches", 0) * SEARCH_PRICE, 5)


def kind(step: str) -> str:
    """'version-apology-r2-jon' -> 'version', 'breakdown-123' -> 'breakdown'."""
    return re.split(r"[-.]", step, maxsplit=1)[0] or step


def record(storage, slug: str, step: str, usage, model: str, batch: bool = False) -> dict | None:
    """Save one call's usage and cost. Returns the record (None if it couldn't be saved)."""
    try:
        t = tokens(usage)
        now = datetime.now(timezone.utc)
        rec = {"brand": slug, "step": step, "kind": kind(step), "model": model, "batch": batch,
               "at": now.isoformat(timespec="seconds"), **t, "cost": cost(model, t, batch)}
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", step)[:60]
        storage.write_text(f"usage/{now:%Y-%m}/{slug}/{now:%Y%m%dT%H%M%S}-{safe}-{secrets.token_hex(2)}.json",
                           json.dumps(rec))
        return rec
    except Exception as e:  # noqa: BLE001 - never fail a job over bookkeeping
        log.warning("usage: couldn't record %s for %s: %s", step, slug, e)
        return None


def summary(storage, month: str, slug: str | None = None) -> dict:
    """Totals for a month: per brand and per kind of job ({cost, calls, input, output})."""
    prefix = f"usage/{month}/{slug + '/' if slug else ''}"
    by_brand: dict = defaultdict(lambda: defaultdict(lambda: {"cost": 0.0, "calls": 0, "input": 0, "output": 0}))
    for key in storage.list(prefix):
        if not key.endswith(".json"):
            continue
        r = json.loads(storage.read_text(key))
        row = by_brand[r["brand"]][r["kind"]]
        row["cost"] += r["cost"]
        row["calls"] += 1
        row["input"] += r["input"] + r["cache_write"] + r["cache_read"]
        row["output"] += r["output"]
    return {b: dict(kinds) for b, kinds in by_brand.items()}


def format_summary(month: str, data: dict) -> str:
    if not data:
        return f"No Claude usage recorded for {month}."
    lines = [f"Claude usage, {month}"]
    grand = 0.0
    for brand, kinds in sorted(data.items()):
        total = sum(k["cost"] for k in kinds.values())
        grand += total
        lines.append(f"\n{brand}: ${total:.2f}")
        for name, k in sorted(kinds.items(), key=lambda kv: -kv[1]["cost"]):
            each = k["cost"] / k["calls"] if k["calls"] else 0
            lines.append(f"  {name:12} {k['calls']:4} calls  ${k['cost']:8.2f}  (${each:.3f} each)")
    lines.append(f"\nAll brands: ${grand:.2f}")
    return "\n".join(lines)
