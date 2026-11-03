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
import threading
from datetime import date, datetime, timezone

from . import brand as brandlib
from .score import days_running, regrade_paid, winner_score

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


def _site_root(url: str) -> str:
    """'https://www.tryatria.com/x' -> 'tryatria' (the part that shows up in links and handles)."""
    from urllib.parse import urlparse
    host = urlparse(url if "//" in (url or "") else f"//{url or ''}").netloc.lower().split(":")[0]
    parts = [p for p in host.split(".") if p and p != "www"]
    return parts[-2] if len(parts) >= 2 else (parts[0] if parts else "")


def _mentions(ads: list[dict], root: str) -> bool:
    """Do any of these ads link to (or name) the competitor's own site?"""
    if len(root) < 3:
        return False
    for a in ads:
        text = " ".join(str(a.get(k) or "") for k in ("link", "body", "headline", "cta")).lower()
        if root in text.replace(" ", ""):
            return True
    return False


VERIFY_TOP = 3  # same-name pages to check before picking one (1 credit each)


def find_page(source, name: str, website: str = "", search: str | None = None) -> tuple[dict | None, list[dict], str]:
    """The right Ad Library page for a competitor, checked against its website.

    Same-name pages are common ("Atria", "Motion"), so name and likes aren't enough. Look at the
    top few same-name pages, pull one page of each one's ads, and keep the page whose ads link to the
    competitor's own site ("verified"). With no site to check, keep the first page that has ads ("auto").
    If none verify, fall back to the best name match ("unverified") so a person can check it.
    Returns (page, its ads, how it was matched); the ads are reused so the check costs nothing extra."""
    target, words = _norm(search or name), _words(search or name)
    root = _site_root(website)
    candidates = list(source.find_pages(search or name))
    # a brand's page is often named after its site ("Trendtrack.io", "tryatria"): search that too
    if root and _norm(root) != target:
        seen = {c["page_id"] for c in candidates}
        candidates += [c for c in source.find_pages(root) if c["page_id"] not in seen]
    by_site = lambda c: bool(root) and len(root) >= 3 and (root in _norm(c.get("ig_username") or "") or root in _norm(c["name"]))
    exact = lambda c: _norm(c["name"]) == target
    pool = [c for c in candidates if exact(c) or by_site(c) or (words and set(words) <= set(_words(c["name"])))]
    if not pool:
        return None, [], ""
    pool.sort(key=lambda c: (not by_site(c), not exact(c), -(c.get("likes") or 0)))
    first_with_ads = None
    for c in pool[:VERIFY_TOP]:
        ads = source.fetch_ads(c["page_id"], max_pages=1)
        if root and _mentions(ads, root):
            return c, ads, "verified"
        if ads and first_with_ads is None and (not root or exact(c) or by_site(c)):
            first_with_ads = (c, ads)
    if first_with_ads:
        return first_with_ads[0], first_with_ads[1], "unverified" if root else "auto"
    # with a site to check, never settle for a page whose name only roughly matches
    fallback = next((c for c in pool if exact(c) or by_site(c)), None) if root else pool[0]
    return (fallback, [], "unverified" if root else "auto") if fallback else (None, [], "")


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
            "fb_page_id": str(fields.get("facebook_page_id") or ""),
            "website": fields.get("website") or "", "app_store_url": fields.get("app_store_url") or ""}


def run(storage, slug: str, source=None, session=None, max_pages: int = 1,
        today: date | None = None, only: list[str] | None = None, creators: bool = True) -> dict:
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
    via = 0
    for comp in targets:
        name = comp["name"]
        if creators:  # the brand's ads running from creators' pages (whitelisting)
            from . import whitelist
            try:
                wl = whitelist.find(source, comp, today)
            except Exception as e:  # noqa: BLE001 - a failed search shouldn't stop the page pull
                log.warning("  %-22s creator search failed: %s", name, str(e)[:200])
                wl = []
            if wl:
                whitelist.remember(comp, wl, today)
                new_wl = merge_ads(existing, wl, comp, today)
                all_new.extend(new_wl)
                via += len(wl)
                log.info("  %-22s %3d creatives from creator pages (%d new): %s", name, len(wl),
                         len(new_wl), ", ".join(sorted({a["via_page_name"] for a in wl}))[:200])
        if comp.get("fb_page_id") == "none":
            counts[name] = 0
            continue
        first = None
        if not comp.get("fb_page_id"):
            page, first, how = find_page(source, name, comp.get("website") or "", comp.get("fb_search_name"))
            if not page:
                log.info("  %-22s no Ad Library page found", name)
                counts[name] = 0
                continue
            comp["fb_page_id"], comp["fb_page_name"] = page["page_id"], page["name"]
            comp["fb_page_match"] = how  # verified = its ads link to the competitor's site
        raw = first if first and max_pages <= 1 else source.fetch_ads(comp["fb_page_id"], max_pages=max_pages)
        pulled = dedupe_creatives(raw, today)
        new_ids = merge_ads(existing, pulled, comp, today)
        all_new.extend(new_ids)
        counts[name] = len(pulled)
        log.info("  %-22s %3d creatives (%d new)  page: %s%s", name, len(pulled), len(new_ids),
                 comp.get("fb_page_name") or comp["fb_page_id"],
                 f" ({comp['fb_page_match']})" if comp.get("fb_page_match") in ("verified", "unverified") else "")

    for ad_id in all_new:
        download_media(storage, slug, existing[ad_id], session)

    _save_pages(storage, comp_key, targets)
    regrade_paid(existing.values(), today)
    storage.write_text(ads_key, json.dumps({
        "brand": slug,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ads": existing,
    }, indent=2) + "\n")

    downloaded = sum(1 for i in all_new if existing[i].get("media_key"))
    failed = sum(1 for i in all_new if existing[i].get("media_error"))
    summary = {"brands": len(targets), "creatives": sum(counts.values()), "via_creators": via,
               "new": len(all_new),
               "media_downloaded": downloaded, "media_failed": failed,
               "credits_used": getattr(source, "credits_used", None)}
    log.info("ads: %(brands)d brands, %(creatives)d creatives, %(new)d new, "
             "%(media_downloaded)d media downloaded, %(media_failed)d failed, "
             "%(credits_used)s credits used", summary)
    return summary


PAGE_FIELDS = ("fb_page_id", "fb_page_name", "fb_page_match", "creator_pages")


def _save_pages(storage, comp_key: str, pulled: list[dict]) -> None:
    """Write back only the Ad Library page fields this run found, onto a fresh copy of
    competitors.json, so a competitor added on the site during the pull isn't lost."""
    doc = json.loads(storage.read_text(comp_key))
    found = {c["name"]: c for c in pulled}
    for c in doc["competitors"]:
        if c["name"] in found:
            c.update({f: found[c["name"]][f] for f in PAGE_FIELDS if f in found[c["name"]]})
    storage.write_text(comp_key, json.dumps(doc, indent=2) + "\n")


_save_lock = threading.Lock()


def save_fields(storage, slug: str, ad_id: str, fields: dict, drop: tuple = ()) -> None:
    """Re-read ads.json and change only this ad. Long runs (creative, breakdown) save this way,
    so they never write back an old copy over ads that another run added in the meantime.
    The lock keeps parallel workers in the same run from overwriting each other."""
    key = brandlib.brand_key(slug, "ads.json")
    with _save_lock:
        doc = json.loads(storage.read_text(key))
        ad = doc["ads"].get(ad_id)
        if ad is None:
            return
        ad.update(fields)
        for f in drop:
            ad.pop(f, None)
        storage.write_text(key, json.dumps(doc, indent=2) + "\n")


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
        if not ad or ad.get("removed_from_library") or ad.get("source") == "organic":
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
    regrade_paid(doc["ads"].values(), today)
    storage.write_text(ads_key, json.dumps(doc, indent=2) + "\n")
    log.info("verify: %d checked, %d removed, %d changed status, %s credits used",
             len(ad_ids), removed, changed, getattr(source, "credits_used", None))
    return {"removed": removed, "changed": changed}


def rematch_pages(storage, slug: str, only_empty: bool = True) -> list[str]:
    """Forget auto-matched pages (by default only the ones that gave no ads) so the next `ads` run
    finds them again with the website check. Pages a person set by hand are left alone."""
    comp_key = brandlib.brand_key(slug, "competitors.json")
    ads_key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(comp_key))
    have = set()
    if storage.exists(ads_key):
        have = {a.get("brand") for a in json.loads(storage.read_text(ads_key))["ads"].values()}
    cleared = []
    for c in doc["competitors"]:
        if c.get("fb_page_match") not in ("auto", "unverified") or c.get("fb_page_id") in (None, "", "none"):
            continue
        if only_empty and c["name"] in have:
            continue
        for f in PAGE_FIELDS:
            c.pop(f, None)
        cleared.append(c["name"])
    storage.write_text(comp_key, json.dumps(doc, indent=2) + "\n")
    return cleared
