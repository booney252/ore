"""TikTok Shop daily: what's working, what to test, which products to swap, trends to get in early.

`refresh(storage, slug)` (job `tiktok`, command `tiktok <brand>`):
1. Pulls the last few days of every TikTok account in brand.md `organic_accounts`
   (7 days; ScrapeCreators, about 1 credit a page of ~10 posts, so heavy posters take more).
2. Scores each post against its account's usual views (the median of its posts that are a
   day or more old). A competitor post 18 to 96 hours old at 5x its usual and 3,000+ views is
   a **breakout**. The owner's posts (":own") get scored the same way.
3. Saves the first slides of breakouts and of the owner's posts to storage (TikTok's links
   expire), and reads them (Claude, vision): the product, the slide 1 hook, the angle, the
   format. Reads are cached, so each post is read once.
4. Grades each product on Kalodata (cse/kalodata.py: sales, growth, share from videos,
   commission -> A to F).
5. Builds the scoreboards (the owner's results by angle and by product), the product lineup
   status (hot / testing / cut, from the rules below) and early alerts (a product or format in
   breakouts from 2+ accounts).

Everything lands in brands/<slug>/tiktok/latest.json (and days/<date>.json) for the /tiktok page.
The lineup (the products being posted) is brands/<slug>/tiktok/lineup.json, edited on the page.
"""

from __future__ import annotations

import json
import logging
import re
import statistics
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from . import brand as brandlib
from . import kalodata, llm

log = logging.getLogger("cse")

ANGLES = {
    "him": "what he / an ex / a date will think or do",
    "others": "other people notice and ask (mom, coworkers, friends, strangers)",
    "glowup": "before and after, a glow-up or result",
    "shame": "an insult or embarrassing before (\"your teeth are yellow\")",
    "price": "price, dupe or secret (\"why pay $40 when this exists\")",
    "taboo": "taboo or edgy (weed, intimate care, freaky)",
    "gift": "gift, stocking stuffer or holiday",
    "routine": "routine, ritual or aesthetic (\"my night routine\")",
    "problem": "plain problem to fix (\"for the girls with...\")",
    "other": "anything else",
}
FORMATS = ["2-slide hook + product", "before / after", "text thread", "fake post / tweet / reddit",
           "checklist / list", "story slides", "video", "other"]

BREAKOUT_X = 5.0          # times the account's usual views
BREAKOUT_MIN_VIEWS = 3000
HIT, FLOP = 3000, 500     # the owner's post rules
CUT_AFTER = 15            # posts with nothing over 1K -> cut
FETCH_DAYS, OWN_DAYS = 7, 10   # a post can take a week to pop
BREAKOUT_MAX_HOURS = 7 * 24
MAX_PAGES = 40                 # ~10 posts a page: enough for 40+ posts a day over a week
READ_LIMIT = 100               # posts read per refresh (Claude vision), newest breakouts first


def key(slug: str, name: str) -> str:
    return brandlib.brand_key(slug, f"tiktok/{name}")


def accounts(fields: dict) -> list[tuple[str, bool]]:
    """[(handle, is_own)] for the TikTok accounts in brand.md organic_accounts."""
    out = []
    for a in fields.get("organic_accounts") or []:
        parts = str(a).split(":")
        if len(parts) >= 2 and parts[0] == "tiktok":
            out.append((parts[1].lstrip("@"), len(parts) > 2 and parts[2] == "own"))
    return out


def _age_hours(post: dict, now: float) -> float:
    ts = post.get("ts")
    return (now - ts) / 3600 if ts else 999


def score(posts: list[dict], now: float) -> float:
    """The account's usual views: median of its posts a day or more old (all posts if too few)."""
    old = [p["views"] for p in posts if _age_hours(p, now) >= 24]
    pool = old if len(old) >= 3 else [p["views"] for p in posts]
    return float(statistics.median(pool)) if pool else 0.0


def breakouts(posts: list[dict], usual: float, now: float) -> list[dict]:
    out = []
    for p in posts:
        age = _age_hours(p, now)
        if 18 <= age <= BREAKOUT_MAX_HOURS and p["views"] >= max(BREAKOUT_X * max(usual, 1), BREAKOUT_MIN_VIEWS):
            out.append(p)
    return out


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower().replace(".", "")).strip()


def same_product(a: str, b: str) -> bool:
    """'RoC Lip Volumizer' ~ 'roc derm correxion lip volumizer': all words of the shorter in the longer."""
    wa, wb = set(_norm(a).split()), set(_norm(b).split())
    if not wa or not wb:
        return False
    short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    return short <= long_


# --- pulling ------------------------------------------------------------------------

def _fetch(source, handle: str, days: int) -> list[dict]:
    since = (date.today() - timedelta(days=days)).isoformat()
    try:
        posts = source.fetch_posts("tiktok", handle, max_pages=MAX_PAGES, since=since)
    except Exception as e:  # noqa: BLE001 - one account failing shouldn't stop the rest
        log.warning("tiktok: couldn't pull @%s: %s", handle, e)
        return []
    cutoff = time.time() - days * 86400
    return [p for p in posts if (p.get("ts") or 0) >= cutoff]


def _download(url_lists: list[list[str]], n: int = 3) -> list[bytes]:
    import requests

    out = []
    for urls in url_lists[:n]:
        for u in urls:
            try:
                r = requests.get(u, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
                r.raise_for_status()
                data = r.content
            except Exception:  # noqa: BLE001 - try the next format of this slide
                continue
            if b"ftypheic" in data[:32] or b"ftypmif1" in data[:32]:
                continue  # HEIF: the API and browsers can't use it; try the next link
            out.append(data)
            break
    return out


def save_slides(storage, slug: str, post: dict) -> list[str]:
    """Store a post's first slides (or its cover, for a video). Returns their storage keys."""
    base = key(slug, f"img/{post['code']}")
    have = [k for k in storage.list(base + "-") if k.endswith(".jpg")]
    if have:
        return sorted(have)
    lists = post.get("slides") or ([[post["cover_url"]]] if post.get("cover_url") else [])
    keys = []
    for i, data in enumerate(_download(lists)):
        k = f"{base}-{i + 1}.jpg"
        storage.write_bytes(k, data)
        keys.append(k)
    return keys


# --- reading slides -----------------------------------------------------------------

READ_PROMPT = """These are the first slides of a TikTok Shop affiliate post (@{handle}, {views} views).
Caption: "{caption}"

Answer with JSON only:
{{"product": "brand + product name as shown, or the best description if no name shows",
  "category": "one or two words, e.g. lip plumper, whitening strips, perfume",
  "hook": "the exact text on slide 1",
  "angle": one of {angles},
  "format": one of {formats}}}

Angles: {angle_help}"""


def read_post(storage, slug: str, post: dict, images: list[str], client=None) -> dict | None:
    if not images:
        return None
    prompt = READ_PROMPT.format(
        handle=post["handle"], views=post["views"], caption=(post.get("caption") or "")[:200],
        angles=json.dumps(list(ANGLES)), formats=json.dumps(FORMATS),
        angle_help="; ".join(f"{k} = {v}" for k, v in ANGLES.items()))
    try:
        answer = llm.ask(storage, slug, f"tiktok-read-{post['code']}", prompt, image_keys=images,
                         client=client, max_tokens=2000, effort="low")
        got = llm.parse_json(answer)
    except (llm.LLMError, llm.HandoffPending) as e:
        log.info("tiktok: couldn't read %s: %s", post["code"], e)
        return None
    if not isinstance(got, dict):
        return None
    got["angle"] = got.get("angle") if got.get("angle") in ANGLES else "other"
    return {k: str(got.get(k) or "")[:300] for k in ("product", "category", "hook", "angle", "format")}


# --- the daily refresh ----------------------------------------------------------------

def _load(storage, k: str, default):
    return json.loads(storage.read_text(k)) if storage.exists(k) else default


def lineup_status(item: dict, own: list[dict]) -> dict:
    mine = [p for p in own if same_product(item["name"], (p.get("read") or {}).get("product", ""))]
    views = [p["views"] for p in mine]
    hits = sum(1 for v in views if v >= HIT)
    status = ("hot" if hits >= 2 else "cut" if len(mine) >= CUT_AFTER and max(views, default=0) < 1000
              else "testing")
    return {**item, "posts": len(mine), "hits": hits, "best": max(views, default=0),
            "avg": round(statistics.mean(views)) if views else 0, "status": status}


def scoreboard(own: list[dict], field: str) -> list[dict]:
    """The owner's posts grouped by angle or product: posts, average views, best, hits, flops."""
    groups: dict = defaultdict(list)
    for p in own:
        name = (p.get("read") or {}).get(field)
        if not name:
            continue
        if field == "product":  # "Dr.Melaxin spicule lip shot" and "DrMelaxin Spicule Lip Shot" are one product
            name = next((g for g in groups if same_product(g, name) or _norm(g).replace(" ", "") == _norm(name).replace(" ", "")), name)
        groups[name].append(p)
    rows = []
    for name, ps in groups.items():
        views = [p["views"] for p in ps]
        aged = [p for p in ps if p["age_h"] >= 48]
        rows.append({"name": name, "posts": len(ps), "avg": round(statistics.mean(views)),
                     "best": max(views), "hits": sum(1 for v in views if v >= HIT),
                     "flops": sum(1 for p in aged if p["views"] < FLOP),
                     "x": round(statistics.mean(p["x"] for p in ps), 1)})
    return sorted(rows, key=lambda r: -r["avg"])


def alerts(breaks: list[dict]) -> list[dict]:
    """A product or format showing up in breakouts from 2+ different accounts."""
    out = []
    products: list[dict] = []
    for b in breaks:
        name = (b.get("read") or {}).get("product")
        if not name:
            continue
        for g in products:
            if same_product(g["name"], name):
                g["posts"].append(b)
                break
        else:
            products.append({"name": name, "posts": [b]})
    for g in products:
        handles = sorted({p["handle"] for p in g["posts"]})
        if len(handles) >= 2:
            out.append({"kind": "product", "name": g["name"], "accounts": handles,
                        "views": sum(p["views"] for p in g["posts"])})
    fmts: dict = defaultdict(set)
    for b in breaks:
        f = (b.get("read") or {}).get("format")
        if f and f not in ("2-slide hook + product", "other"):
            fmts[f].add(b["handle"])
    out += [{"kind": "format", "name": f, "accounts": sorted(h), "views": 0}
            for f, h in fmts.items() if len(h) >= 2]
    return sorted(out, key=lambda a: (-len(a["accounts"]), -a["views"]))


def refresh(storage, slug: str, source=None, client=None, read: bool = True) -> str:
    from .organic_source import ScrapeCreatorsOrganic

    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    accts = accounts(fields)
    if not accts:
        raise ValueError(f"{slug}: no tiktok accounts in brand.md organic_accounts")
    source = source or ScrapeCreatorsOrganic()
    now = time.time()

    def pull(a):
        handle, own = a
        return handle, own, _fetch(source, handle, OWN_DAYS if own else FETCH_DAYS)

    with ThreadPoolExecutor(max_workers=6) as pool:
        pulled = list(pool.map(pull, accts))

    reads = _load(storage, key(slug, "reads.json"), {})
    breaks, own, usuals = [], [], {}
    for handle, is_own, posts in pulled:
        usual = score(posts, now)
        usuals[handle] = {"usual": round(usual), "posts": len(posts), "own": is_own}
        for p in posts:
            p["age_h"] = round(_age_hours(p, now), 1)
            p["x"] = round(p["views"] / usual, 1) if usual else 0
        if is_own:
            own += posts
        else:
            breaks += breakouts(posts, usual, now)
    breaks.sort(key=lambda p: -p["x"])

    # slides + reading: breakouts first (newest), then the owner's posts
    todo = breaks + sorted(own, key=lambda p: -p["ts"])

    def slides(p):
        try:
            p["images"] = save_slides(storage, slug, p)
        except Exception as e:  # noqa: BLE001
            log.warning("tiktok: couldn't save slides for %s: %s", p["code"], e)
            p["images"] = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(slides, todo))
    budget = READ_LIMIT
    for p in todo:
        if p["code"] in reads:
            p["read"] = reads[p["code"]]
        elif read and budget > 0 and llm.mode() == "api" and p["images"]:
            got = read_post(storage, slug, p, p["images"], client)
            budget -= 1
            if got:
                reads[p["code"]] = p["read"] = got
    storage.write_text(key(slug, "reads.json"), json.dumps(reads))
    _finish(storage, slug, usuals, breaks, own, updated=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    log.info("tiktok: %d accounts, %d breakouts, %d own posts", len(accts), len(breaks), len(own))
    return key(slug, "latest.json")


def _finish(storage, slug: str, usuals: dict, breaks: list[dict], own: list[dict], updated: str) -> dict:
    """Kalodata grades, scoreboards, lineup and alerts, then save latest.json."""
    todo = breaks + own
    lineup = _load(storage, key(slug, "lineup.json"), [])
    if kalodata.available():
        names = [(p.get("read") or {}).get("product", "") for p in todo] + [i["name"] for i in lineup]
        ratings = kalodata.rate_products(storage, key(slug, "products.json"), names)
        for p in todo:
            p["kalo"] = ratings.get((p.get("read") or {}).get("product", ""))
        for i in lineup:
            i["kalo"] = ratings.get(i["name"])
    slim = lambda p: {k: p.get(k) for k in ("code", "handle", "url", "views", "likes", "comments",
                                            "date", "ts", "age_h", "x", "images", "read", "shoppable",
                                            "kalo")}
    data = {
        "updated": updated,
        "accounts": usuals,
        "breakouts": [slim(p) for p in breaks],
        "own": [slim(p) for p in sorted(own, key=lambda p: -(p.get("ts") or 0))],
        "angles": scoreboard(own, "angle"),
        "products": scoreboard(own, "product"),
        "lineup": [lineup_status(i, own) for i in lineup],
        "alerts": alerts(breaks),
        "angle_help": ANGLES,
    }
    out = json.dumps(data)
    storage.write_text(key(slug, "latest.json"), out)
    storage.write_text(key(slug, f"days/{date.today().isoformat()}.json"), out)
    return data


def add_reads(storage, slug: str, new: dict) -> str:
    """Save slide reads made outside the API (e.g. by hand in a session) and rebuild the page
    from the last pull, without pulling again."""
    reads = _load(storage, key(slug, "reads.json"), {})
    for code, r in new.items():
        if isinstance(r, dict) and any(r.get(k) for k in ("product", "hook")):
            r = {k: str(r.get(k) or "")[:300] for k in ("product", "category", "hook", "angle", "format")}
            r["angle"] = r["angle"] if r["angle"] in ANGLES else "other"
            reads[code] = r
    storage.write_text(key(slug, "reads.json"), json.dumps(reads))
    last = _load(storage, key(slug, "latest.json"), None)
    if not last:
        raise ValueError(f"{slug}: no pull yet")
    for p in last["breakouts"] + last["own"]:
        if p["code"] in reads:
            p["read"] = reads[p["code"]]
    data = _finish(storage, slug, last["accounts"], last["breakouts"], last["own"], last["updated"])
    log.info("tiktok: %d reads saved, %d alerts", len(reads), len(data["alerts"]))
    return key(slug, "latest.json")
