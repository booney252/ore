"""Whitelisted ads: a brand's ads running from a creator's page (allowlisting / dark posts).

Ore's page pull only sees ads on the brand's own Facebook page. Brands often run their best UGC
from the creator's page instead, so those ads show the creator's name. They still send people to
the brand, though, so we search the whole Ad Library for the brand's website (and, for apps, the
app's name) and keep every ad whose link goes to the brand's site or its App Store listing but
runs from another page. Each one is saved as the brand's ad with `whitelisted: true` and
`via_page_name` (the creator page), and the creator page is remembered on the competitor
(`creator_pages`) so daily tracking can watch it too.
"""

from __future__ import annotations

import re
from datetime import date
from urllib.parse import urlparse

from . import ads as adslib

MAX_CREATOR_PAGES = 5  # creator pages per brand that daily tracking checks (1 credit each)
# hosts that aren't one brand's own site, so they can't identify whose ad it is
GENERIC = {"apple.com", "google.com", "linktr.ee", "facebook.com", "instagram.com", "tiktok.com",
           "fb.me", "bit.ly", "shopify.com", "myshopify.com", "amazon.com", "youtube.com", "wa.me"}
_TWO_PART = {"co.uk", "com.au", "co.nz", "co.za", "com.br", "co.jp"}


def domain(url: str | None) -> str:
    """'https://go.motionapp.com/x' -> 'motionapp.com'."""
    if not url:
        return ""
    host = urlparse(url if "//" in url else f"//{url}").netloc.lower().split(":")[0]
    parts = [p for p in host.split(".") if p]
    if len(parts) < 2:
        return ""
    keep = 3 if ".".join(parts[-2:]) in _TWO_PART and len(parts) >= 3 else 2
    return ".".join(parts[-keep:])


def app_ids(comp: dict) -> list[str]:
    """App Store ids from the competitor's app_store_url ('.../id6758682710' -> '6758682710')."""
    return re.findall(r"id(\d{6,})", comp.get("app_store_url") or "")


def matches(ad: dict, dom: str, ids: list[str]) -> bool:
    """Does this ad send people to the brand: its website (any subdomain) or its App Store app?"""
    link = ad.get("link") or ""
    if dom and dom not in GENERIC and domain(link) == dom:
        return True
    return any(f"id{i}" in link for i in ids)


def queries(comp: dict) -> list[str]:
    """What to search the Ad Library for: the site's domain, plus the app's name for app brands
    (their ads link to the App Store, so the domain never shows up)."""
    out = []
    dom = domain(comp.get("website"))
    if dom and dom not in GENERIC:
        out.append(dom)
    if app_ids(comp):
        out.append(comp.get("fb_search_name") or comp["name"])
    return out


def own_page_name(page_name: str, comp: dict) -> bool:
    """Is this page the brand's own, just not the one on file? ("Atria AI" for Atria,
    "foreplay.co" for Foreplay.) Its ads are the brand's regular ads, not whitelisted."""
    n, b = adslib._norm(page_name), adslib._norm(comp.get("name"))
    root = adslib._site_root(comp.get("website") or "")
    return bool(n) and ((len(b) >= 3 and (b in n or n in b)) or (len(root) >= 3 and root in n))


def find(source, comp: dict, today: date, max_pages: int = 1) -> list[dict]:
    """The brand's ads running from pages other than the one on file. Ads from a creator's page
    are tagged whitelisted; ads from a page named like the brand are marked own_page (its real
    page, when the one on file is wrong)."""
    dom, ids = domain(comp.get("website")), app_ids(comp)
    own = str(comp.get("fb_page_id") or "")
    seen, out = set(), []
    for q in queries(comp):
        for ad in source.search_ads(q, max_pages=max_pages):
            if ad["ad_id"] in seen or not ad.get("page_id") or ad["page_id"] == own:
                continue
            if not matches(ad, dom, ids):
                continue
            seen.add(ad["ad_id"])
            if own_page_name(ad.get("page_name") or "", comp):
                out.append({**ad, "own_page": True})
            else:
                out.append({**ad, "whitelisted": True, "via_page_id": ad["page_id"],
                            "via_page_name": ad.get("page_name") or ""})
    return adslib.dedupe_creatives(out, today)


def remember(comp: dict, found: list[dict], today: date) -> list[dict]:
    """Add newly seen creator pages to comp['creator_pages'] (most recently seen first)."""
    pages = {p["page_id"]: p for p in comp.get("creator_pages") or []}
    for ad in found:
        if not ad.get("whitelisted"):
            continue
        p = pages.setdefault(ad["via_page_id"], {"page_id": ad["via_page_id"],
                                                 "name": ad["via_page_name"],
                                                 "first_seen": today.isoformat()})
        p["last_seen"] = today.isoformat()
    comp["creator_pages"] = sorted(pages.values(), key=lambda p: p.get("last_seen") or "", reverse=True)
    return comp["creator_pages"]


def top_on_page(source, comp: dict, page: dict, today: date, n: int = 10) -> list[dict]:
    """The brand's ads in a creator page's most-shown active ads, in order."""
    dom, ids = domain(comp.get("website")), app_ids(comp)
    pulled = source.fetch_ads(page["page_id"], max_pages=1, status="ACTIVE")
    mine = [{**a, "whitelisted": True, "via_page_id": page["page_id"],
             "via_page_name": page.get("name") or a.get("page_name") or ""}
            for a in pulled if matches(a, dom, ids)]
    return adslib.dedupe_creatives(mine, today)[:n]


def fix_page(comp: dict, found: list[dict]) -> bool:
    """When the search turns up the brand's real page (its ads link to the brand's site) and the
    page on file isn't verified, switch to it. Returns True when it changed."""
    own = [a for a in found if a.get("own_page")]
    if not own or comp.get("fb_page_match") in ("verified", "set by you"):
        return False
    comp["fb_page_id"], comp["fb_page_name"] = own[0]["page_id"], own[0].get("page_name") or ""
    comp["fb_page_match"] = "verified"
    return True
