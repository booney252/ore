"""Organic winners: posts (Reels, TikToks, Shorts) graded on views against the account's usual.

Paid ads prove themselves by running for months; an organic post proves itself by beating the
account's normal views. So an organic post's grade is its views divided by the median views of
that account's recent posts:
  A 5x+ the usual, B 2x+, C 1x+ (about normal), D below the usual.
Under 1,000 views is too few to call: the grade stops at C.

Organic posts live in the same ads.json as paid ads (`source: "organic"`), so reports,
iterations, briefs and the Creator Studio use them the same way. `import_posts` merges a batch
of posts (from a CSV/TSV export, a paste, or a data provider) and regrades every account.
"""

from __future__ import annotations

import json
import logging
import statistics
from datetime import date, datetime, timezone

from . import brand as brandlib

log = logging.getLogger("cse")

GRADES = "ABCDF"
MIN_VIEWS = 1000
PLATFORMS = {"instagram": "INSTAGRAM", "tiktok": "TIKTOK", "youtube": "YOUTUBE"}


def grade_ratio(ratio: float) -> str:
    return "A" if ratio >= 5 else "B" if ratio >= 2 else "C" if ratio >= 1 else "D"


def organic_score(post: dict) -> tuple[float, str]:
    views, usual = int(post.get("views") or 0), int(post.get("usual_views") or 0)
    ratio = views / usual if usual else 1.0
    grade = grade_ratio(ratio)
    capped = views < MIN_VIEWS and grade in "AB"
    if capped:
        grade = "C"
    why = (f"Grade {grade}: {views:,} views, {ratio:.1f}x @{post.get('handle')}'s usual "
           f"{usual:,} ({grade_ratio(ratio)})")
    why += ", under 1,000 views so too few to call (capped at C)." if capped else "."
    return (4 - GRADES.index(grade)) * 25, why


def post_id(platform: str, code: str) -> str:
    return f"{platform[:2]}-{code}"


def url_for(platform: str, handle: str, code: str) -> str:
    if platform == "instagram":
        return f"https://www.instagram.com/reel/{code}/"
    if platform == "tiktok":
        return f"https://www.tiktok.com/@{handle}/video/{code}"
    return f"https://www.youtube.com/shorts/{code}"


def to_entry(post: dict, brand_name: str, today: date) -> dict:
    """One post in ads.json's shape. `post` needs handle, code, views; the rest is optional."""
    platform = (post.get("platform") or "instagram").lower()
    handle = str(post["handle"]).lstrip("@")
    own = str(post.get("own", "")).lower() in ("1", "true", "yes")
    posted = post.get("posted_at") or post.get("date") or ""
    caption = (post.get("caption") or "").strip()
    cover = (post.get("cover_text") or "").strip()
    entry = {
        "ad_id": post_id(platform, post["code"]),
        "source": "organic",
        "platform": platform,
        "handle": handle,
        "url": post.get("url") or url_for(platform, handle, post["code"]),
        "brand": f"@{handle}",
        "ring": "own" if own else "niche",
        "is_own": own,
        "start_date": posted or None,
        "is_active": True,
        "platforms": [PLATFORMS.get(platform, platform.upper())],
        "body": caption,
        "headline": cover,
        "cta": "",
        "media_type": "video",
        "views": int(post.get("views") or 0),
        "likes": int(post.get("likes") or 0),
        "comments": int(post.get("comments") or 0),
        "first_seen": today.isoformat(),
        "last_seen": today.isoformat(),
        "days_running": (today - date.fromisoformat(posted)).days if posted else 0,
    }
    if post.get("secs"):
        entry["analysis"] = {"length_s": float(post["secs"])}
    if own:
        entry["promotes"] = brand_name
    return entry


def import_posts(storage, slug: str, posts: list[dict], today: date | None = None) -> dict:
    """Merge posts into ads.json (keeping any breakdown/analysis already there) and regrade."""
    today = today or datetime.now(timezone.utc).date()
    key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(key)) if storage.exists(key) else {"brand": slug, "ads": {}}
    name = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0].get("name") or slug
    added = updated = 0
    for post in posts:
        entry = to_entry(post, name, today)
        old = doc["ads"].get(entry["ad_id"])
        if old:
            for k in ("breakdown", "media_key"):
                if k in old:
                    entry[k] = old[k]
            entry["analysis"] = {**(old.get("analysis") or {}), **(entry.get("analysis") or {})}
            entry["first_seen"] = old.get("first_seen", entry["first_seen"])
            updated += 1
        else:
            added += 1
        doc["ads"][entry["ad_id"]] = {**(old or {}), **entry}
    regrade(doc["ads"].values())
    storage.write_text(key, json.dumps(doc, indent=2) + "\n")
    log.info("organic: %s: %d new, %d updated posts", slug, added, updated)
    return {"added": added, "updated": updated}


def regrade(ads) -> None:
    """Set each organic post's usual views (its account's median) and its grade."""
    ads = [a for a in ads if a.get("source") == "organic"]
    by_handle: dict[str, list[int]] = {}
    for a in ads:
        by_handle.setdefault(a["handle"], []).append(int(a.get("views") or 0))
    for a in ads:
        a["usual_views"] = int(statistics.median(by_handle[a["handle"]]))
        a["score"], a["score_why"] = organic_score(a)


def read_table(text: str) -> list[dict]:
    """Posts from a TSV/CSV with a header row (handle, code, views, ... as in to_entry)."""
    import csv
    import io
    dialect = "excel-tab" if "\t" in text.splitlines()[0] else "excel"
    return [dict(r) for r in csv.DictReader(io.StringIO(text), dialect=dialect)]
