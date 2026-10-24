"""Organic winners: posts (Reels, TikToks, Shorts) graded on views against the account's usual.

Paid ads prove themselves by running for months; an organic post proves itself by beating the
account's normal views. So an organic post's grade starts from its views divided by the median
views of that account's posts (the outlier):
  A 5x+ the usual, B 2x+, C 1x+ (about normal), D below the usual.
Raw reach counts too, so a big account's hit isn't held back by its high usual: a post that beats
its account's usual by 1.5x+ is at least a B with 50,000+ views and an A with 250,000+.
Then engagement can lift it, comments per view against the account's usual comment rate:
  2x+ the usual comment rate: up one grade. Only with 10+ comments. Comments never pull a grade
  down: a post without a "comment a word" call to action would look weak next to one that has it.
Under 10,000 views isn't a breakout worth copying, however far it beats a small account's usual:
the grade stops at C (brand.md `breakout_min_views` changes the bar).
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

import hashlib
import json
import logging
import statistics
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib

log = logging.getLogger("cse")

GRADES = "ABCDF"
MIN_VIEWS = 10_000  # a post needs this many views to count as a winner (A or B)
PLATFORMS = {"instagram": "INSTAGRAM", "tiktok": "TIKTOK", "youtube": "YOUTUBE"}


REACH = [(250_000, "A"), (50_000, "B")]  # views that make a post a winner on reach alone...
REACH_MIN_RATIO = 1.5  # ...as long as it also beat its account's usual


def grade_reach(views: int, ratio: float) -> str | None:
    if ratio < REACH_MIN_RATIO:
        return None
    return next((g for floor, g in REACH if views >= floor), None)


def grade_ratio(ratio: float) -> str:
    return "A" if ratio >= 5 else "B" if ratio >= 2 else "C" if ratio >= 1 else "D"


MIN_COMMENTS = 10


def comment_rate(post: dict) -> float:
    views = int(post.get("views") or 0)
    return int(post.get("comments") or 0) / views if views else 0.0


def engagement_move(post: dict) -> int:
    """-1 (up one grade) or 0, from comments per view vs the account's usual. Never down."""
    usual = float(post.get("usual_comment_rate") or 0)
    if int(post.get("comments") or 0) < MIN_COMMENTS or not usual:
        return 0
    return -1 if comment_rate(post) >= 2 * usual else 0


def organic_score(post: dict) -> tuple[float, str]:
    views, usual = int(post.get("views") or 0), int(post.get("usual_views") or 0)
    if post.get("on_topic") is False:  # blew up, but not about the niche: nothing to learn from it
        return 0, (f"Off topic: {views:,} views, but it isn't about the niche"
                   f" ({post.get('topic_why') or 'general content on the account'}). Left out of winners.")
    ratio = views / usual if usual else 1.0
    outlier = grade_ratio(ratio)
    reach = grade_reach(views, ratio)
    base = min(outlier, reach or outlier)  # the better of the two ("A" < "B")
    move = engagement_move(post)
    grade = GRADES[max(0, min(4, GRADES.index(base) + move))]
    floor = int(post.get("min_views") or MIN_VIEWS)
    capped = views < floor and grade in "AB"
    if capped:
        grade = "C"
    why = (f"Grade {grade}: {views:,} views"
           + (f" ({reach} on reach)" if reach and reach < outlier else "")
           + f", {ratio:.1f}x @{post.get('handle')}'s usual {usual:,} ({outlier})")
    if post.get("usual_comment_rate"):
        why += (f", comments {comment_rate(post):.2%} of views vs usual "
                f"{float(post['usual_comment_rate']):.2%}" + (" (up one)" if move < 0 else ""))
    why += f", under {floor:,} views so not a breakout yet (capped at C)." if capped else "."
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
    if post.get("slides"):
        entry["media_type"] = "slideshow"
        entry["slides"] = post["slides"]
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
    regrade(doc["ads"].values(), int(fields.get("breakout_min_views") or MIN_VIEWS))
    storage.write_text(key, json.dumps(doc, indent=2) + "\n")
    log.info("organic: %s: %d new, %d updated posts", slug, added, updated)
    return {"added": added, "updated": updated}


def regrade(ads, min_views: int = MIN_VIEWS) -> None:
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
        a["min_views"] = min_views
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


def winners_to_fetch(ads: list[dict], per_account: int = WINNERS_PER_ACCOUNT, top_views: int = 0,
                     handles: set[str] | None = None) -> list[dict]:
    """Each account's A and B posts (best first), plus its top 2 if it's one of ours (so our own
    creators' videos get looked at even when nothing broke out), not yet analyzed. With top_views,
    also the `handles` accounts' N most-watched posts (to study an audience, not just outliers)."""
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
        if top_views and (handles is None or posts[0]["handle"] in handles):
            out += [a for a in sorted(posts, key=lambda a: -(a.get("views") or 0))[:top_views] if a not in out]
    return [a for a in out if "transcript" not in (a.get("analysis") or {}) and not a.get("media_key")]


def download_slides(storage, slug: str, ad: dict, session) -> bool:
    """Save a slideshow's slides (JPEG or WebP; TikTok also serves HEIF, which we skip) and set
    its analysis to the slides as frames, so `breakdown` can read them."""
    frames = []
    for i, urls in enumerate(ad.get("slides") or []):
        for url in urls:
            try:
                resp = session.get(url, timeout=30)
            except Exception:  # noqa: BLE001 - try the next link
                continue
            data = resp.content
            if resp.ok and (data[:3] == b"\xff\xd8\xff" or data[8:12] == b"WEBP"):
                ext = "jpg" if data[:3] == b"\xff\xd8\xff" else "webp"
                key = brandlib.brand_key(slug, f"media/{ad['ad_id']}/slide_{i:02d}.{ext}")
                storage.write_bytes(key, data, content_type=f"image/{'jpeg' if ext == 'jpg' else 'webp'}")
                frames.append({"t": i, "key": key})
                break
    if not frames:
        return False
    ad["media_key"] = frames[0]["key"]
    ad["analysis"] = {"length_s": 0, "cut_count": len(frames), "cuts_per_second": 0, "frames": frames,
                      "transcript": [], "transcript_text": "", "hook_line": ""}
    return True


def pull(storage, slug: str, source=None, max_pages: int = 8, today: date | None = None,
         only: list[str] | None = None, top_views: int = 0) -> dict:
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
    pulled = {h.split(":")[-1] for h in only} if only else None
    for ad in winners_to_fetch(list(doc["ads"].values()), top_views=top_views, handles=pulled):
        if pulled is not None and ad["handle"] not in pulled:
            continue  # only the accounts this run fetched (their media links are fresh)
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
        elif ad.get("slides"):
            if download_slides(storage, slug, ad, session):
                downloaded += 1
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


COMMENT_MIN_WORDS = 4  # "🔥🔥", "need this" and "@friend" tell us nothing about the viewer


def pull_comments(storage, slug: str, handles: list[str], top: int = 15, pages: int = 2,
                  source=None, overall: bool = False) -> dict:
    """Comments on each account's most-watched posts, saved to voc.json as `source: "comment"`.

    The viewers' own words: what they want, fear and doubt. Each quote keeps the post's link, the
    commenter and which account it came from (`about: "@handle"`), so research can compare
    audiences. Re-running skips posts we already have comments for. With `overall`, `top` is the
    most-watched posts across all the handles together instead of per account.
    """
    from . import voc as voclib
    from .organic_source import ScrapeCreatorsOrganic

    source = source or ScrapeCreatorsOrganic()
    ads_key = brandlib.brand_key(slug, "ads.json")
    posts = [a for a in json.loads(storage.read_text(ads_key))["ads"].values()
             if a.get("source") == "organic" and a.get("handle") in handles and a.get("platform") == "instagram"]
    voc_key = brandlib.brand_key(slug, "voc.json")
    doc = json.loads(storage.read_text(voc_key)) if storage.exists(voc_key) else {"brand": slug, "quotes": []}
    done = {q.get("url") for q in doc["quotes"] if q.get("source") == "comment"}
    counts: dict[str, int] = {}
    by_views = sorted(posts, key=lambda p: -(p.get("views") or 0))
    best = by_views[:top] if overall else None
    for h in handles:
        mine = [p for p in best if p["handle"] == h] if overall else [p for p in by_views if p["handle"] == h][:top]
        got = 0
        for p in mine:
            if p["url"] in done or not p.get("comments"):
                continue
            try:
                comments = source.post_comments(p["platform"], p["url"], pages)
            except Exception as e:  # noqa: BLE001 - one bad post shouldn't stop the run
                log.warning("comments: %s failed: %s", p["url"], e)
                continue
            for c in comments:
                if len(c["text"].split()) < COMMENT_MIN_WORDS:
                    continue
                doc["quotes"].append({"text": c["text"], "source": "comment", "about": f"@{h}",
                                      "who": c["who"], "likes": c["likes"], "date": c["date"],
                                      "url": p["url"], "post_views": p.get("views")})
                got += 1
        counts[h] = got
        log.info("comments: @%s %d comments from its top %d posts", h, got, len(mine))
    seen, quotes = set(), []
    for q in doc["quotes"]:
        k = voclib._id(q) + (q.get("url") or "")
        if k not in seen:
            seen.add(k)
            quotes.append(q)
    doc["quotes"] = quotes
    doc.setdefault("counts", {})["comments"] = sum(1 for q in quotes if q.get("source") == "comment")
    doc["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    storage.write_text(voc_key, json.dumps(doc, indent=1) + "\n")
    counts["credits"] = getattr(source, "credits_used", 0)
    return counts


TOPIC_PROMPT = Path("prompts/15-on-topic.md")
TOPIC_BATCH = 60


def check_topics(storage, slug: str, client=None, recheck: bool = False) -> dict:
    """Mark winners (A/B) that aren't about the brand's niche (a creator's lifestyle, general money
    memes, sports...) as `on_topic: false`, so they drop out of winners and the report. Each post
    is checked once (it keeps its `on_topic`)."""
    from . import llm

    key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(key))
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    todo = [a for a in doc["ads"].values() if a.get("source") == "organic"
            and (recheck or "on_topic" not in a)
            and (a.get("score", 0) >= 75 or (recheck and a.get("on_topic") is False))]
    checked = off = 0
    for i in range(0, len(todo), TOPIC_BATCH):
        batch = todo[i:i + TOPIC_BATCH]
        lines = [json.dumps({"id": a["ad_id"], "account": f"@{a.get('handle')}",
                             "caption": (a.get("body") or "")[:300],
                             "on_screen": str((a.get("breakdown") or {}).get("on_screen_text") or "")[:300],
                             "spoken": ((a.get("analysis") or {}).get("transcript_text") or "")[:400]},
                            ensure_ascii=False) for a in batch]
        prompt = llm.render(TOPIC_PROMPT.read_text(), {
            "brand_name": fields.get("name") or slug, "product": fields.get("product") or "",
            "niche": fields.get("niche") or "", "posts": "\n".join(lines)})
        tag = hashlib.sha1("|".join(a["ad_id"] for a in batch).encode()).hexdigest()[:8]
        answers = llm.parse_json(llm.ask(storage, slug, f"topics-{tag}", prompt, client=client,
                                          max_tokens=8000, effort="low"))
        for ans in answers if isinstance(answers, list) else []:
            ad = doc["ads"].get(str(ans.get("id")))
            if ad is None:
                continue
            ad["on_topic"] = bool(ans.get("on_topic", True))
            ad["topic_why"] = str(ans.get("why") or "")[:120]
            checked += 1
            off += not ad["on_topic"]
    regrade(doc["ads"].values(), int(fields.get("breakout_min_views") or MIN_VIEWS))
    storage.write_text(key, json.dumps(doc, indent=2) + "\n")
    log.info("topics: %d winners checked, %d off topic", checked, off)
    return {"checked": checked, "off_topic": off}
