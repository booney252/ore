"""Daily top-10 tracking: each advertiser's 10 most-shown active ads, and the new ones that break in.

Meta's Ad Library lists a page's ads most impressions first. Brands leave old ads running for
months, so a full pull is mostly legacy ads. Instead, every day we read just the top 10 active
ads per advertiser (1 credit each) and look for movement:

- **Breakout**: a new ad (live 30 days or less) that enters an advertiser's top 10 for the first
  time. To get there it has to out-spend that brand's long-runners fast, so it's the clearest
  sign of a new winner. The first day an advertiser is tracked is its baseline: nothing flags.
- **Back in the top 10**: an older ad entering for the first time (a brand pushing spend into it again).

On each ad in ads.json: top10_rank (today's spot, or None), top10_since, top10_days, top10_last,
and breakout (the date it broke in). Daily snapshots go to tracking/<date>.json, and
tracking/state.json keeps every ad each advertiser has had in its top 10.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone

from . import ads as adslib
from . import brand as brandlib
from .score import days_running, regrade_paid

log = logging.getLogger("cse")

TOP_N = 10
NEW_DAYS = 30  # a breakout is an ad this young or younger when it breaks in


def top_ads(source, page_id: str, today: date, n: int = TOP_N) -> list[dict]:
    """The page's n most-shown active creatives, in order (versions of one creative count once)."""
    pulled = source.fetch_ads(page_id, max_pages=1, status="ACTIVE")
    return adslib.dedupe_creatives(pulled, today)[:n]


def compare(top: list[dict], seen: set[str] | None, today: date) -> list[dict]:
    """What's new in today's top 10 vs every ad that's been in it before. `seen` None means the
    advertiser has no history yet (baseline day): nothing is new."""
    if seen is None:
        return []
    out = []
    for rank, ad in enumerate(top, start=1):
        if ad["ad_id"] in seen:
            continue
        age = days_running(ad, today)
        out.append({"ad_id": ad["ad_id"], "rank": rank, "days_running": age,
                    "kind": "breakout" if age <= NEW_DAYS else "back"})
    return out


def _targets(storage, slug: str) -> list[dict]:
    doc = json.loads(storage.read_text(brandlib.brand_key(slug, "competitors.json")))
    targets = [c for c in doc["competitors"] if c.get("status") != "removed"]
    brand_key = brandlib.brand_key(slug)
    if storage.exists(brand_key):
        own = adslib._own_entry(brandlib.parse(storage.read_text(brand_key))[0])
        if own:
            targets.append(own)
    return targets


def run(storage, slug: str, source=None, session=None, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    now = today.isoformat()
    if source is None:
        from .adsource import ScrapeCreatorsSource

        source = ScrapeCreatorsSource()
    if session is None:
        import requests

        session = requests.Session()

    state_key = brandlib.brand_key(slug, "tracking/state.json")
    state = json.loads(storage.read_text(state_key)) if storage.exists(state_key) else {"advertisers": {}}
    ads_key = brandlib.brand_key(slug, "ads.json")
    existing = json.loads(storage.read_text(ads_key))["ads"] if storage.exists(ads_key) else {}

    snapshot, moves, skipped = {}, [], []
    for comp in _targets(storage, slug):
        name, page_id = comp["name"], comp.get("fb_page_id")
        if not page_id or page_id == "none":
            skipped.append(name)
            continue
        try:
            top = top_ads(source, page_id, today)
        except Exception as e:  # noqa: BLE001 - one advertiser failing shouldn't stop the rest
            log.warning("  %-22s failed: %s", name, str(e)[:200])
            skipped.append(name)
            continue
        hist = state["advertisers"].get(name)
        found = compare(top, set(hist["seen"]) if hist else None, today)
        new_ids = adslib.merge_ads(existing, top, comp, today)
        for ad_id in new_ids:
            adslib.download_media(storage, slug, existing[ad_id], session)

        for rank, ad in enumerate(top, start=1):
            e = existing[ad["ad_id"]]
            if e.get("top10_last") != now:
                e["top10_days"] = (e.get("top10_days") or 0) + 1
            e["top10_rank"], e["top10_last"] = rank, now
            e.setdefault("top10_since", now)
        for f in found:
            existing[f["ad_id"]]["breakout" if f["kind"] == "breakout" else "top10_back"] = now
            moves.append({**f, "brand": name})

        ids = [a["ad_id"] for a in top]
        state["advertisers"][name] = {
            "since": hist["since"] if hist else now,
            "seen": sorted(set(hist["seen"] if hist else []) | set(ids)),
            "last": ids,
        }
        snapshot[name] = ids
        log.info("  %-22s top %d%s", name, len(ids),
                 "".join(f"  {'BREAKOUT' if f['kind'] == 'breakout' else 'back'} #{f['rank']}"
                         for f in found) or ("  (baseline)" if not hist else ""))

    # Ads that dropped out of every top 10 today lose their rank, so "top 10 now" stays true.
    tracked = set(snapshot)
    for e in existing.values():
        if e.get("top10_rank") and e.get("brand") in tracked and e.get("top10_last") != now:
            e["top10_rank"] = None

    regrade_paid(existing.values(), today)
    storage.write_text(ads_key, json.dumps({
        "brand": slug, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ads": existing}, indent=2) + "\n")
    storage.write_text(state_key, json.dumps(state, indent=2) + "\n")
    snap_key = brandlib.brand_key(slug, f"tracking/{now}.json")
    storage.write_text(snap_key, json.dumps(
        {"date": now, "top10": snapshot, "moves": moves}, indent=2) + "\n")

    summary = {"advertisers": len(snapshot), "skipped": len(skipped),
               "breakouts": sum(m["kind"] == "breakout" for m in moves),
               "back": sum(m["kind"] == "back" for m in moves),
               "credits_used": getattr(source, "credits_used", None),
               "new_ids": [m["ad_id"] for m in moves], "key": snap_key}
    log.info("track: %(advertisers)d advertisers, %(breakouts)d breakouts, %(back)d back in the "
             "top 10, %(credits_used)s credits used", summary)
    return summary
