"""Organic winners: posts (Reels, TikToks, Shorts) graded on views against the account's usual.

Paid ads prove themselves by running for months; an organic post proves itself by beating the
account's normal views. So an organic post's grade starts from its views divided by the median
views of that account's posts (the outlier):
  A 5x+ the usual, B 2x+, C 1x+ (about normal), D below the usual.
Then engagement moves it, comments per view against the account's usual comment rate (comments
are what a comment-keyword CTA runs on, and like counts are often hidden):
  2x+ the usual comment rate: up one grade; half or less: down one (a D drops to F).
  Only with 10+ comments, so a handful of comments can't swing it.
Under 1,000 views is too few to call: the grade stops at C.
brand.md `organic_since` (e.g. 2026-04-01) drops older posts, so an account's old content from
before it changed direction doesn't set its "usual".

Organic posts live in the same ads.json as paid ads (`source: "organic"`), so reports,
iterations, briefs and the Creator Studio use them the same way. `import_posts` merges a batch
of posts (from a CSV/TSV export, a paste, or a data provider) and regrades every account.

`pull` fetches the accounts listed in brand.md `organic_accounts` ("platform:handle", with
":own" for the brand's own affiliates or creators) from a source (organic_source), grades them,
and downloads the winners' videos right away (the links expire) so `creative` can transcribe
them. YouTube Shorts have no video link: their transcripts come from the source instead.
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


MIN_COMMENTS = 10


def comment_rate(post: dict) -> float:
    views = int(post.get("views") or 0)
    return int(post.get("comments") or 0) / views if views else 0.0


def engagement_move(post: dict) -> int:
    """-1 (up one grade), +1 (down one) or 0, from comments per view vs the account's usual."""
    usual = float(post.get("usual_comment_rate") or 0)
    if int(post.get("comments") or 0) < MIN_COMMENTS or not usual:
        return 0
    rate = comment_rate(post)
    return -1 if rate >= 2 * usual else 1 if rate <= usual / 2 else 0


def organic_score(post: dict) -> tuple[float, str]:
    views, usual = int(post.get("views") or 0), int(post.get("usual_views") or 0)
    ratio = views / usual if usual else 1.0
    base = grade_ratio(ratio)
    move = engagement_move(post)
    grade = GRADES[max(0, min(4, GRADES.index(base) + move))]
    capped = views < MIN_VIEWS and grade in "AB"
    if capped:
        grade = "C"
    why = (f"Grade {grade}: {views:,} views, {ratio:.1f}x @{post.get('handle')}'s usual "
           f"{usual:,} ({base})")
    if post.get("usual_comment_rate"):
        why += (f", comments {comment_rate(post):.2%} of views vs usual "
                f"{float(post['usual_comment_rate']):.2%}"
                + (" (up one)" if move < 0 else " (down one)" if move > 0 else ""))
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
        entry["secs"] = float(post["secs"])
    if post.get("media_url"):
        entry["media_url"] = post["media_url"]
    if post.get("cover_url"):
        entry["thumbnail_url"] = post["cover_url"]
    if own:
        entry["promotes"] = brand_name
    return entry


def import_posts(storage, slug: str, posts: list[dict], today: date | None = None) -> dict:
    """Merge posts into ads.json (keeping any breakdown/analysis already there) and regrade.
    Posts from before brand.md `organic_since` are left out, and dropped if already there."""
    today = today or datetime.now(timezone.utc).date()
    key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(key)) if storage.exists(key) else {"brand": slug, "ads": {}}
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    name = fields.get("name") or slug
    since = str(fields.get("organic_since") or "")
    added = updated = 0
    for post in posts:
        if since and str(post.get("posted_at") or post.get("date") or "9999") < since:
            continue
        entry = to_entry(post, name, today)
        old = doc["ads"].get(entry["ad_id"])
        if old:
            entry["first_seen"] = old.get("first_seen", entry["first_seen"])
            updated += 1
        else:
            added += 1
        doc["ads"][entry["ad_id"]] = {**(old or {}), **entry}
    if since:
        for ad_id in [k for k, a in doc["ads"].items()
                      if a.get("source") == "organic" and str(a.get("start_date") or "") < since]:
            del doc["ads"][ad_id]
    regrade(doc["ads"].values())
    storage.write_text(key, json.dumps(doc, indent=2) + "\n")
    log.info("organic: %s: %d new, %d updated posts", slug, added, updated)
    return {"added": added, "updated": updated}


def regrade(ads) -> None:
    """Set each organic post's usual views and comment rate (its account's medians) and grade."""
    ads = [a for a in ads if a.get("source") == "organic"]
    views: dict[str, list[int]] = {}
    rates: dict[str, list[float]] = {}
    for a in ads:
        account = f"{a.get('platform')}:{a['handle']}"
        views.setdefault(account, []).append(int(a.get("views") or 0))
        if a.get("views"):
            rates.setdefault(account, []).append(comment_rate(a))
    for a in ads:
        account = f"{a.get('platform')}:{a['handle']}"
        a["usual_views"] = int(statistics.median(views[account]))
        a["usual_comment_rate"] = round(statistics.median(rates[account]), 6) if rates.get(account) else 0
        a["score"], a["score_why"] = organic_score(a)


def read_table(text: str) -> list[dict]:
    """Posts from a TSV/CSV with a header row (handle, code, views, ... as in to_entry)."""
    import csv
    import io
    dialect = "excel-tab" if "\t" in text.splitlines()[0] else "excel"
    return [dict(r) for r in csv.DictReader(io.StringIO(text), dialect=dialect)]


# --- pulling accounts from a data source ----------------------------------------------

WINNERS_PER_ACCOUNT = 6


def accounts(fields: dict) -> list[dict]:
    """brand.md `organic_accounts`: ["instagram:reedo.io:own", "tiktok:dizzsells:own", ...]."""
    out = []
    for raw in fields.get("organic_accounts") or []:
        parts = str(raw).split(":")
        if len(parts) >= 2:
            out.append({"platform": parts[0].strip().lower(), "handle": parts[1].strip().lstrip("@"),
                        "own": len(parts) > 2 and parts[2].strip().lower() == "own"})
    return out


def winners_to_fetch(ads: list[dict], per_account: int = WINNERS_PER_ACCOUNT) -> list[dict]:
    """Each account's A and B posts (best first), plus its top 2 if it's one of ours (so our own
    creators' videos get looked at even when nothing broke out), not yet analyzed."""
    by_handle: dict[str, list[dict]] = {}
    for a in ads:
        if a.get("source") == "organic":
            by_handle.setdefault(f"{a['platform']}:{a['handle']}", []).append(a)
    out = []
    for posts in by_handle.values():
        posts.sort(key=lambda a: (a.get("score", 0), (a.get("views") or 0) / max(1, a.get("usual_views") or 1)),
                   reverse=True)
        out += [a for i, a in enumerate(posts[:per_account])
                if a.get("score", 0) >= 75 or (a.get("is_own") and i < 2)]
    return [a for a in out if "transcript" not in (a.get("analysis") or {}) and not a.get("media_key")]


def pull(storage, slug: str, source=None, max_pages: int = 8, today: date | None = None,
         only: list[str] | None = None) -> dict:
    """Fetch every account in brand.md `organic_accounts`, grade, and get the winners' media."""
    from . import ads as adslib
    from .organic_source import ScrapeCreatorsOrganic

    today = today or datetime.now(timezone.utc).date()
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    source = source or ScrapeCreatorsOrganic()
    posts, counts = [], {}
    for acc in accounts(fields):
        if only and acc["handle"] not in only and f"{acc['platform']}:{acc['handle']}" not in only:
            continue
        try:
            got = source.fetch_posts(acc["platform"], acc["handle"], max_pages)
        except Exception as e:  # noqa: BLE001 - one bad account shouldn't stop the run
            log.warning("organic: %s:%s failed: %s", acc["platform"], acc["handle"], e)
            got = []
        for p in got:
            p["own"] = "1" if acc["own"] else "0"
        counts[f"{acc['platform']}:{acc['handle']}"] = len(got)
        log.info("organic: %s:%s %d posts", acc["platform"], acc["handle"], len(got))
        posts += got
    result = import_posts(storage, slug, posts, today)

    key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(key))
    import requests

    session = requests.Session()
    downloaded = transcribed = 0
    for ad in winners_to_fetch(list(doc["ads"].values())):
        stale = ad.get("analysis") or {}
        if ad["platform"] == "youtube":
            try:
                lines = source.youtube_transcript(ad["url"])
            except Exception as e:  # noqa: BLE001
                log.warning("organic: transcript failed for %s: %s", ad["ad_id"], e)
                continue
            text = " ".join(l["text"] for l in lines)
            ad["analysis"] = {**stale, "transcript": lines, "transcript_text": text,
                              "hook_line": lines[0]["text"] if lines else "", "length_s": ad.get("secs") or 0}
            transcribed += 1
        elif ad.get("media_url"):
            adslib.download_media(storage, slug, ad, session)
            if ad.get("media_key"):
                ad.pop("analysis", None)  # a cover-only analysis: `creative` redoes it from the video
                downloaded += 1
        if (ad.get("breakdown") or {}).get("source_note", "").startswith("From the cover"):
            ad.pop("breakdown", None)  # written from the cover and caption: redo from the real video
    storage.write_text(key, json.dumps(doc, indent=2) + "\n")
    summary = {**result, "accounts": counts, "videos_downloaded": downloaded,
               "youtube_transcripts": transcribed,
               "credits_used": getattr(source, "credits_used", None)}
    log.info("organic: %s", summary)
    return summary
