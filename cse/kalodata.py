"""Kalodata (TikTok Shop sales data): a grade for each product, and what a post actually sold.

Each call costs Kalodata points (about 0.1), so results are cached in storage:
products for 3 days (brands/<slug>/tiktok/products.json), videos for a day (videos.json).

**Product grade** (A to F, from the last 7 days in the US):
- momentum: sales growth vs the week before (+2 at 100%+, +1 at 30%+, -1 if shrinking)
- size: 7-day sales (+1 at $50K+, -1 under $3K)
- videos: share of sales that come from creator videos (+1 at 70%+, -2 under 40%, since
  slides and videos can't move a product that sells through lives or its shop page)
- commission (+1 at 15%+, -1 under 10%)
Total 4+ = A, 3 = B, 1-2 = C, 0 = D, below 0 = F.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time

log = logging.getLogger("cse")

BASE = "https://www.kalodata.com/openapi/v1/"
PRODUCT_DAYS, VIDEO_HOURS = 3, 20


class KalodataError(Exception):
    pass


def available() -> bool:
    return bool(os.environ.get("KALODATA_API_KEY"))


def call(path: str, body: dict, session=None) -> object:
    import requests

    s = session or requests
    r = s.post(BASE + path, timeout=90, json={"region": "US", "language": "en-US", "currency": "USD", **body},
               headers={"secret-key": os.environ["KALODATA_API_KEY"], "Content-Type": "application/json"})
    out = r.json()
    if not out.get("success"):
        raise KalodataError(f"{path}: {out.get('message')}")
    return out.get("data")


def _pct(v) -> float | None:
    """Commission and growth arrive as 13, 0.13, '13%' or None."""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        m = re.search(r"-?[\d.]+", v)
        if not m:
            return None
        v = float(m.group(0))
        return v
    v = float(v)
    return v * 100 if -1.5 < v < 1.5 and v != 0 else v


def grade(p: dict) -> tuple[str, str]:
    rev = float(p.get("revenue") or 0)
    growth = _pct(p.get("revenue_growth_rate"))
    video = 100 * float(p.get("video_revenue") or 0) / rev if rev else 0
    comm = _pct(p.get("commission_rate"))
    pts = 0
    if growth is not None:
        pts += 2 if growth >= 100 else 1 if growth >= 30 else -1 if growth < 0 else 0
    pts += 1 if rev >= 50_000 else -1 if rev < 3_000 else 0
    pts += 1 if video >= 70 else -2 if video < 40 else 0
    if comm is not None:
        pts += 1 if comm >= 15 else -1 if comm < 10 else 0
    letter = "A" if pts >= 4 else "B" if pts == 3 else "C" if pts >= 1 else "D" if pts == 0 else "F"
    bits = [f"${rev / 1000:,.0f}K a week" if rev >= 1000 else f"${rev:,.0f} a week"]
    if growth is not None:
        bits.append(f"{growth:+.0f}%")
    bits.append(f"{video:.0f}% from videos")
    if comm is not None:
        bits.append(f"{comm:.0f}% commission")
    return letter, ", ".join(bits)


def _words(s: str) -> set[str]:
    return {w for w in re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split() if len(w) > 2}


def lookup(name: str, session=None) -> dict | None:
    """The best Kalodata match for a product name (last 7 days), graded. None if nothing matches."""
    query = " ".join(re.sub(r"[^\w\s.+-]", " ", name).split()[:6])
    if len(query) < 3:
        return None
    rows = call("tiktok/product/rank", {"date_range": "last7Day", "keyword": query, "page_no": 1,
                                        "page_size": 10, "sort_field": {"field": "revenue", "type": "DESC"}},
                session) or []
    want = _words(name)
    best, overlap = None, 0
    for p in rows:
        n = len(want & _words(p.get("product_name", "")))
        if n > overlap:
            best, overlap = p, n
    if not best or overlap < min(2, len(want)):
        return None
    letter, why = grade(best)
    return {"name": best.get("product_name", "")[:120], "id": str(best.get("product_id") or ""),
            "grade": letter, "why": why, "revenue": round(float(best.get("revenue") or 0)),
            "price": best.get("unit_price"), "checked": int(time.time())}


def video(code: str, session=None) -> dict | None:
    """What one post sold (last 30 days) and whether it's being boosted as an ad."""
    d = call("tiktok/video/detail", {"date_range": "last30Day", "video_id": code}, session)
    if not d:
        return None
    return {"revenue": round(float(d.get("revenue") or 0)), "sales": int(d.get("sales_volumn") or 0),
            "ad": bool(d.get("ad")), "checked": int(time.time())}


def _cache(storage, k: str) -> dict:
    return json.loads(storage.read_text(k)) if storage.exists(k) else {}


def rate_products(storage, cache_key: str, names: list[str], limit: int = 40) -> dict:
    """{name: rating or None} for each product name, from the cache when fresh."""
    import requests

    cache, session, now, out, spent = _cache(storage, cache_key), requests.Session(), time.time(), {}, 0
    for name in dict.fromkeys(n for n in names if n):
        k = " ".join(sorted(_words(name)))
        hit = cache.get(k)
        if hit and now - hit.get("checked", 0) < PRODUCT_DAYS * 86400:
            out[name] = hit.get("rating")
            continue
        if spent >= limit:
            continue
        try:
            rating = lookup(name, session)
        except Exception as e:  # noqa: BLE001 - one lookup failing shouldn't stop the page
            log.warning("kalodata: %s: %s", name, e)
            continue
        spent += 1
        cache[k] = {"rating": rating, "checked": int(now)}
        out[name] = rating
    storage.write_text(cache_key, json.dumps(cache))
    log.info("kalodata: %d product lookups", spent)
    return out


def video_sales(storage, cache_key: str, codes: list[str], limit: int = 15) -> dict:
    import requests

    cache, session, now, out, spent = _cache(storage, cache_key), requests.Session(), time.time(), {}, 0
    for code in codes:
        hit = cache.get(code)
        if hit and now - hit.get("checked", 0) < VIDEO_HOURS * 3600:
            out[code] = hit
            continue
        if spent >= limit:
            continue
        try:
            got = video(code, session)
        except Exception as e:  # noqa: BLE001
            log.warning("kalodata: video %s: %s", code, e)
            continue
        spent += 1
        if got:
            cache[code] = out[code] = got
    storage.write_text(cache_key, json.dumps(cache))
    log.info("kalodata: %d video lookups", spent)
    return out
