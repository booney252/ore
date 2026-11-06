"""Daily top-50 tracking: each advertiser's 50 most-shown active ads, and how each one moves.

Meta's Ad Library lists a page's ads most impressions first. Brands leave old ads running for
months, so a full pull is mostly legacy ads. Instead, every day we read just the top 10 active
ads per advertiser (1 credit each) and look for movement:

- **Breakout**: a new ad (live 30 days or less) that enters an advertiser's top 10 for the first
  time. To get there it has to out-spend that brand's long-runners fast, so it's the clearest
  sign of a new winner. The first day an advertiser is tracked is its baseline: nothing flags.
- **Back in the top 10**: an older ad entering for the first time (a brand pushing spend into it again).

Since 2026-11-06 we read the top 50 (3 credits a page-heavy advertiser, 1 for small ones) and
judge movement over days, never one day: a brand's fresh launch always lands high for a day.

- **Entered**: a new ad's first day in the top 10. Not a winner yet ("just launched, watching").
- **Breakout** now needs HOLD_DAYS days in the top 10.
- **Climbing**: up CLIMB_SPOTS+ spots within CLIMB_WINDOW days, still at or above yesterday's spot.
- **Stopped**: was in the top 50 yesterday and isn't running today (only when we saw every live ad).
- **Survivor** (shown on the site): 30+ days in the top 50.
Each ad keeps rank_history {date: rank} for the last HISTORY_DAYS days, plus top50_rank/days.

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
from . import whitelist
from .score import days_running, regrade_paid

log = logging.getLogger("cse")

TOP_N = 10
DEPTH = 50   # how deep we read each advertiser's list
PAGES = 3    # 30 ads a page, about 19 creatives once versions merge
NEW_DAYS = 30  # a breakout is an ad this young or younger when it breaks in
HOLD_DAYS = 3  # days in the top 10 before a new ad counts as a breakout
CLIMB_SPOTS = 15
CLIMB_WINDOW = 3
HISTORY_DAYS = 30


def top_ads(source, page_id: str, today: date, n: int = TOP_N, pages: int = 1) -> list[dict]:
    """The page's n most-shown active creatives, in order (versions of one creative count once)."""
    pulled = source.fetch_ads(page_id, max_pages=pages, status="ACTIVE")
    return adslib.dedupe_creatives(pulled, today)[:n]


def climb(history: dict, today: date) -> dict | None:
    """{from, to, days} when an ad rose CLIMB_SPOTS+ spots within CLIMB_WINDOW days and is still
    at or above yesterday's spot. Needs at least one earlier day of its own, so a launch-day
    entry high on the list never counts."""
    now = today.isoformat()
    if now not in history:
        return None
    rank = history[now]
    earlier = sorted(d for d in history if d < now and (today - date.fromisoformat(d)).days <= CLIMB_WINDOW)
    if not earlier:
        return None
    start = history[earlier[0]]
    if history[earlier[-1]] < rank or start - rank < CLIMB_SPOTS:
        return None
    return {"from": start, "to": rank, "days": (today - date.fromisoformat(earlier[0])).days}


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
                    "kind": "entered" if age <= NEW_DAYS else "back"})
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
    tracked_brands = set()

    def track_one(key: str, comp: dict, top: list[dict], full: bool = False) -> None:
        """Record one advertiser's list (its own page, or a creator page's ads for it). `full`: we
        read the page deep enough that an ad missing today has stopped running."""
        hist = state["advertisers"].get(key)
        top10 = top[:TOP_N]
        found = compare(top10, set(hist["seen"]) if hist else None, today)
        new_ids = adslib.merge_ads(existing, top, comp, today)
        for ad_id in new_ids:
            adslib.download_media(storage, slug, existing[ad_id], session)
        for rank, ad in enumerate(top, start=1):
            e = existing[ad["ad_id"]]
            if e.get("top50_last") != now:
                e["top50_days"] = (e.get("top50_days") or 0) + 1
            e["top50_rank"], e["top50_last"] = rank, now
            e.setdefault("top50_since", now)
            rh = {d: r for d, r in (e.get("rank_history") or {}).items()
                  if (today - date.fromisoformat(d)).days < HISTORY_DAYS}
            rh[now] = rank
            e["rank_history"] = rh
            c = climb(rh, today)
            if c:
                if not e.get("climbing") or (today - date.fromisoformat(e["climbing"])).days > 1:
                    moves.append({"ad_id": ad["ad_id"], "rank": rank, "kind": "climbing", **{f"climb_{k}": v for k, v in c.items()},
                                  "days_running": days_running(ad, today), "brand": comp["name"], "advertiser": key})
                e["climbing"], e["climb"] = now, c
            if rank > TOP_N:
                continue
            if e.get("top10_last") != now:
                e["top10_days"] = (e.get("top10_days") or 0) + 1
            e["top10_rank"], e["top10_last"] = rank, now
            e.setdefault("top10_since", now)
            # a new ad becomes a breakout once it has held a top-10 spot HOLD_DAYS days
            if e.get("top10_entered") and not e.get("breakout") and e["top10_days"] >= HOLD_DAYS:
                e["breakout"] = now
                moves.append({"ad_id": ad["ad_id"], "rank": rank, "kind": "breakout",
                              "days_running": days_running(ad, today), "brand": comp["name"], "advertiser": key})
        for f in found:
            existing[f["ad_id"]]["top10_entered" if f["kind"] == "entered" else "top10_back"] = now
            moves.append({**f, "brand": comp["name"], "advertiser": key})
        ids = [a["ad_id"] for a in top]
        if full and hist and len(top) < DEPTH:  # we saw every live ad: anything missing stopped
            for gone in set(hist.get("last50") or []) - set(ids):
                if gone in existing:
                    existing[gone]["top50_out"] = now
                    moves.append({"ad_id": gone, "rank": None, "kind": "stopped",
                                  "brand": comp["name"], "advertiser": key})
        state["advertisers"][key] = {
            "since": hist["since"] if hist else now,
            "seen": sorted(set(hist["seen"] if hist else []) | set(ids[:TOP_N])),
            "last": ids[:TOP_N],
            "last50": ids,
        }
        snapshot[key] = ids
        tracked_brands.add(comp["name"])
        log.info("  %-22s top %d%s", key[:40], len(ids),
                 "".join(f"  {m['kind'].upper()} #{m['rank']}" for m in moves if m["advertiser"] == key)
                 or ("  (baseline)" if not hist else ""))

    for comp in _targets(storage, slug):
        name, page_id = comp["name"], comp.get("fb_page_id")
        if page_id and page_id != "none":
            try:
                track_one(name, comp, top_ads(source, page_id, today, n=DEPTH, pages=PAGES), full=True)
            except Exception as e:  # noqa: BLE001 - one advertiser failing shouldn't stop the rest
                log.warning("  %-22s failed: %s", name, str(e)[:200])
                skipped.append(name)
        else:
            skipped.append(name)
        # the brand's ads on the creator pages it whitelists through (newest pages first)
        for page in (comp.get("creator_pages") or [])[:whitelist.MAX_CREATOR_PAGES]:
            try:
                top = whitelist.top_on_page(source, comp, page, today, n=TOP_N)
            except Exception as e:  # noqa: BLE001
                log.warning("  %-22s via %s failed: %s", name, page.get("name"), str(e)[:200])
                continue
            if top:
                track_one(f"{name} via {page.get('name') or page['page_id']}", comp, top)

    # Ads that dropped out today lose their rank, so "top 10 now" / "top 50 now" stay true.
    for e in existing.values():
        if e.get("brand") not in tracked_brands:
            continue
        if e.get("top10_rank") and e.get("top10_last") != now:
            e["top10_rank"] = None
        if e.get("top50_rank") and e.get("top50_last") != now:
            e["top50_rank"] = None

    regrade_paid(existing.values(), today)
    storage.write_text(ads_key, json.dumps({
        "brand": slug, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ads": existing}, indent=2) + "\n")
    storage.write_text(state_key, json.dumps(state, indent=2) + "\n")
    snap_key = brandlib.brand_key(slug, f"tracking/{now}.json")
    storage.write_text(snap_key, json.dumps(
        {"date": now, "top50": snapshot, "top10": {k: v[:TOP_N] for k, v in snapshot.items()},
         "moves": moves}, indent=2) + "\n")

    summary = {"advertisers": len(snapshot), "skipped": len(skipped),
               "breakouts": sum(m["kind"] == "breakout" for m in moves),
               "back": sum(m["kind"] == "back" for m in moves),
               "climbing": sum(m["kind"] == "climbing" for m in moves),
               "entered": sum(m["kind"] == "entered" for m in moves),
               "stopped": sum(m["kind"] == "stopped" for m in moves),
               "credits_used": getattr(source, "credits_used", None),
               # worth taking apart: confirmed breakouts, climbers, old ads pushed back up
               "new_ids": list(dict.fromkeys(m["ad_id"] for m in moves if m["kind"] in ("breakout", "climbing", "back"))),
               "key": snap_key}
    log.info("track: %(advertisers)d advertisers, %(breakouts)d breakouts, %(climbing)d climbing, "
             "%(entered)d just entered, %(back)d back in the top 10, %(stopped)d stopped, "
             "%(credits_used)s credits used", summary)
    return summary
