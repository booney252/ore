"""Module 2: pull Meta ads for competitors + own brand, score them, download media.

ads.json holds one entry per creative (ads that share Meta's collation_id are versions of
the same creative; we keep one representative and record the version count). Entries are
never deleted: each run updates active/end date/versions/score and marks new ones, so the
weekly run only breaks down creatives it hasn't seen before.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone

from . import brand as brandlib
from .score import days_running, winner_score

log = logging.getLogger("cse")

MAX_MEDIA_BYTES = 200 * 1024 * 1024
# Fields refreshed on every pull; everything else (breakdown, transcript, media) is kept.
LIVE_FIELDS = ("is_active", "end_date", "versions", "platforms", "media_url", "thumbnail_url")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", (s or "").lower())


def pick_page(name: str, candidates: list[dict]) -> dict | None:
    """Best Ad Library page for a brand name: exact name match first, then most likes."""
    if not candidates:
        return None
    target = _norm(name)
    words = _words(name)
    exact = [c for c in candidates if _norm(c["name"]) == target]
    # Close match = every word of the search name appears as a whole word in the page name
    # ("Shotsy" -> "Shotsy App"), so "Ro" never matches "Cristiano Ronaldo".
    close = [c for c in candidates if words and set(words) <= set(_words(c["name"]))]
    pool = exact or close
    # No name match: better to skip than to pull a stranger's ads.
    return max(pool, key=lambda c: c.get("likes") or 0) if pool else None


def dedupe_creatives(ads: list[dict], today: date) -> list[dict]:
    """One ad per collation group: prefer active, then longest running."""
    groups: dict[str, dict] = {}
    for ad in ads:
        key = ad.get("collation_id") or ad["ad_id"]
        best = groups.get(key)
        rank = (ad["is_active"], days_running(ad, today))
        if best is None or rank > (best["is_active"], days_running(best, today)):
            groups[key] = ad
    return list(groups.values())


def merge_ads(existing: dict, pulled: list[dict], competitor: dict, today: date) -> list[str]:
    """Update `existing` (ad_id -> entry) in place. Returns ids of new creatives."""
    new_ids = []
    now = today.isoformat()
    for ad in pulled:
        entry = existing.get(ad["ad_id"])
        if entry is None:
            entry = {**ad, "brand": competitor["name"], "ring": competitor.get("ring", ""),
                     "is_own": competitor.get("ring") == "own", "first_seen": now}
            existing[ad["ad_id"]] = entry
            new_ids.append(ad["ad_id"])
        else:
            for f in LIVE_FIELDS:
                entry[f] = ad[f]
        entry["last_seen"] = now
        entry["days_running"] = days_running(entry, today)
        entry["score"], entry["score_why"] = winner_score(entry, today)
    return new_ids


def download_media(storage, slug: str, ad: dict, session) -> None:
    if ad.get("media_key") or not ad.get("media_url"):
        return
    ext = "mp4" if ad["media_type"] == "video" else "jpg"
    key = brandlib.brand_key(slug, f"media/{ad['ad_id']}.{ext}")
    if storage.exists(key):
        ad["media_key"] = key
        return
    try:
        resp = session.get(ad["media_url"], timeout=120)
        resp.raise_for_status()
        if len(resp.content) > MAX_MEDIA_BYTES:
            raise ValueError(f"file too large ({len(resp.content)} bytes)")
        storage.write_bytes(key, resp.content,
                            content_type="video/mp4" if ext == "mp4" else "image/jpeg")
        ad["media_key"] = key
        ad.pop("media_error", None)
    except Exception as e:  # noqa: BLE001 - log every failure, keep going
        ad["media_error"] = str(e)[:200]
        log.warning("  media failed for %s: %s", ad["ad_id"], ad["media_error"])


def _own_entry(fields: dict) -> dict | None:
    """The brand's own ads, only when its Ad Library page id is set: searching by name could
    pull a different company with the same name (there are four other apps called Solis)."""
    name = fields.get("name")
    if not name or not fields.get("facebook_page_id"):
        return None
    return {"name": name, "ring": "own", "status": "approved",
            "fb_page_id": str(fields.get("facebook_page_id") or "")}


def run(storage, slug: str, source=None, session=None, max_pages: int = 1,
        today: date | None = None, only: list[str] | None = None) -> dict:
    """Pull ads for every competitor (or just the names in `only`) plus the brand's own page.
    A competitor whose fb_page_id is "none" was checked and has no Ad Library page: skipped."""
    today = today or datetime.now(timezone.utc).date()
    if source is None:
        from .adsource import ScrapeCreatorsSource

        source = ScrapeCreatorsSource()
    if session is None:
        import requests

        session = requests.Session()

    comp_key = brandlib.brand_key(slug, "competitors.json")
    comp_doc = json.loads(storage.read_text(comp_key))
    targets = [c for c in comp_doc["competitors"] if c.get("status") != "removed"
               and (only is None or c["name"].lower() in {n.lower() for n in only})]

    brand_key = brandlib.brand_key(slug)
    if storage.exists(brand_key):
        own = _own_entry(brandlib.parse(storage.read_text(brand_key))[0])
        if own:
            targets.append(own)

    ads_key = brandlib.brand_key(slug, "ads.json")
    existing = (json.loads(storage.read_text(ads_key))["ads"] if storage.exists(ads_key) else {})

    counts = {}
    all_new = []
    for comp in targets:
        name = comp["name"]
        if comp.get("fb_page_id") == "none":
            counts[name] = 0
            continue
        if not comp.get("fb_page_id"):
            search = comp.get("fb_search_name") or name
            page = pick_page(search, source.find_pages(search))
            if not page:
                log.info("  %-22s no Ad Library page found", name)
                counts[name] = 0
                continue
            comp["fb_page_id"], comp["fb_page_name"] = page["page_id"], page["name"]
            comp["fb_page_match"] = "auto"  # check this matched the right brand
        pulled = dedupe_creatives(source.fetch_ads(comp["fb_page_id"], max_pages=max_pages), today)
        new_ids = merge_ads(existing, pulled, comp, today)
        all_new.extend(new_ids)
        counts[name] = len(pulled)
        log.info("  %-22s %3d creatives (%d new)  page: %s", name, len(pulled), len(new_ids),
                 comp.get("fb_page_name") or comp["fb_page_id"])

    for ad_id in all_new:
        download_media(storage, slug, existing[ad_id], session)

    storage.write_text(comp_key, json.dumps(comp_doc, indent=2) + "\n")
    storage.write_text(ads_key, json.dumps({
        "brand": slug,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ads": existing,
    }, indent=2) + "\n")

    downloaded = sum(1 for i in all_new if existing[i].get("media_key"))
    failed = sum(1 for i in all_new if existing[i].get("media_error"))
    summary = {"brands": len(targets), "creatives": sum(counts.values()), "new": len(all_new),
               "media_downloaded": downloaded, "media_failed": failed,
               "credits_used": getattr(source, "credits_used", None)}
    log.info("ads: %(brands)d brands, %(creatives)d creatives, %(new)d new, "
             "%(media_downloaded)d media downloaded, %(media_failed)d failed, "
             "%(credits_used)s credits used", summary)
    return summary


def verify(storage, slug: str, ad_ids: list[str], source=None, today: date | None = None) -> dict:
    """Re-check ads in the Ad Library before they're cited. Marks removed ones and rescores."""
    today = today or datetime.now(timezone.utc).date()
    if source is None:
        from .adsource import ScrapeCreatorsSource

        source = ScrapeCreatorsSource()
    ads_key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(ads_key))
    removed = changed = 0
    for ad_id in ad_ids:
        ad = doc["ads"].get(ad_id)
        if not ad or ad.get("removed_from_library"):
            continue
        live = source.get_ad(ad_id)
        if live is None:
            ad["removed_from_library"] = today.isoformat()
            if ad.get("is_active"):
                ad["is_active"], ad["end_date"] = False, today.isoformat()
            removed += 1
            log.info("  %s %s: removed from the Ad Library", ad_id, ad.get("brand"))
        elif live["is_active"] != ad.get("is_active"):
            ad["is_active"] = live["is_active"]
            if not live["is_active"]:
                ad["end_date"] = live["end_date"] or today.isoformat()
            changed += 1
            log.info("  %s %s: now %s", ad_id, ad.get("brand"),
                     "active" if live["is_active"] else "inactive")
        ad["days_running"] = days_running(ad, today)
        ad["score"], ad["score_why"] = winner_score(ad, today)
    storage.write_text(ads_key, json.dumps(doc, indent=2) + "\n")
    log.info("verify: %d checked, %d removed, %d changed status, %s credits used",
             len(ad_ids), removed, changed, getattr(source, "credits_used", None))
    return {"removed": removed, "changed": changed}
