"""Where Meta ads come from. Swappable: anything with find_pages() and fetch_ads() works.

Every source returns ads in one normalized shape (see `normalize_scrapecreators`):
  ad_id, page_id, page_name, start_date, end_date (YYYY-MM-DD or None), is_active,
  platforms, body, headline, cta, link, media_type (video|image|none), media_url,
  thumbnail_url, versions, collation_id, ad_library_url
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

log = logging.getLogger("cse")


class AdSourceError(Exception):
    pass


def _date(ts) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()


def normalize_scrapecreators(raw: dict) -> dict:
    snap = raw.get("snapshot") or {}
    videos = [v for v in snap.get("videos") or [] if v.get("video_hd_url") or v.get("video_sd_url")]
    images = [i for i in snap.get("images") or []
              if i.get("original_image_url") or i.get("resized_image_url")]
    # Carousel / DCO ads keep their media in cards.
    for card in snap.get("cards") or []:
        if card.get("video_hd_url") or card.get("video_sd_url"):
            videos.append(card)
        elif card.get("original_image_url") or card.get("resized_image_url"):
            images.append(card)

    if videos:
        v = videos[0]
        media_type, media_url = "video", v.get("video_hd_url") or v.get("video_sd_url")
        thumb = v.get("video_preview_image_url")
    elif images:
        i = images[0]
        media_type, media_url = "image", i.get("original_image_url") or i.get("resized_image_url")
        thumb = media_url
    else:
        media_type, media_url, thumb = "none", None, None

    ad_id = str(raw.get("ad_archive_id") or raw.get("ad_id") or "")
    body = (snap.get("body") or {}).get("text") or ""
    return {
        "ad_id": ad_id,
        "page_id": str(raw.get("page_id") or snap.get("page_id") or ""),
        "page_name": raw.get("page_name") or snap.get("page_name") or "",
        "start_date": _date(raw.get("start_date")),
        "end_date": _date(raw.get("end_date")),
        "is_active": bool(raw.get("is_active")),
        "platforms": raw.get("publisher_platform") or [],
        "body": body.strip(),
        "headline": (snap.get("title") or "").strip(),
        "cta": snap.get("cta_text") or "",
        "link": snap.get("link_url") or "",
        "media_type": media_type,
        "media_url": media_url,
        "thumbnail_url": thumb,
        "versions": int(raw.get("collation_count") or 1),
        "collation_id": str(raw.get("collation_id") or ""),
        "ad_library_url": f"https://www.facebook.com/ads/library/?id={ad_id}" if ad_id else "",
    }


class ScrapeCreatorsSource:
    BASE = "https://api.scrapecreators.com/v1/facebook/adLibrary"

    def __init__(self, api_key: str | None = None, session=None):
        self.api_key = api_key or os.environ.get("SCRAPECREATORS_API_KEY")
        if not self.api_key:
            raise AdSourceError("SCRAPECREATORS_API_KEY is not set in .env")
        if session is None:
            import requests

            session = requests.Session()
        self.session = session
        self.credits_used = 0

    def _get(self, path: str, params: dict) -> dict:
        resp = self.session.get(f"{self.BASE}/{path}", params=params,
                                headers={"x-api-key": self.api_key}, timeout=60)
        if resp.status_code != 200:
            raise AdSourceError(f"ScrapeCreators {path} returned {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        self.credits_used += int(data.get("credits_charged") or 1)
        return data

    def find_pages(self, name: str) -> list[dict]:
        data = self._get("search/companies", {"query": name})
        return [{"page_id": str(r.get("page_id")), "name": r.get("name") or "",
                 "likes": r.get("likes") or 0, "ig_username": r.get("ig_username") or ""}
                for r in data.get("searchResults") or []]

    def fetch_ads(self, page_id: str, country: str = "US", max_pages: int = 2) -> list[dict]:
        ads, cursor = [], None
        for _ in range(max_pages):
            params = {"pageId": page_id, "country": country, "status": "ALL", "media_type": "ALL"}
            if cursor:
                params["cursor"] = cursor
            data = self._get("company/ads", params)
            ads.extend(normalize_scrapecreators(r) for r in data.get("results") or [])
            cursor = data.get("cursor")
            if not cursor or not data.get("results"):
                break
        return [a for a in ads if a["ad_id"]]
