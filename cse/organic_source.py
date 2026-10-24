"""Where organic posts come from. Swappable like adsource: anything with fetch_posts() works.

ScrapeCreators (1 credit per page): Instagram reels (12 a page, with caption and a video link),
TikTok profile videos (with caption and a video link) and YouTube Shorts (no video link; the
transcript comes from a separate call). Every post comes back in the shape organic.to_entry
reads: platform, handle, code, url, views, likes, comments, secs, date, caption, cover_url,
media_url.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from .adsource import AdSourceError

log = logging.getLogger("cse")


def _day(ts) -> str:
    if not ts:
        return ""
    if isinstance(ts, (int, float)) or str(ts).isdigit():
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()
    return str(ts)[:10]


def _first_url(node) -> str:
    """TikTok video/cover fields are {url_list: [...]}; IG versions are [{url: ...}]."""
    if isinstance(node, dict):
        urls = node.get("url_list") or []
        return urls[0] if urls else (node.get("url") or "")
    if isinstance(node, list) and node:
        return _first_url(node[0])
    return node if isinstance(node, str) else ""


def normalize_instagram(item: dict, handle: str) -> dict:
    m = item.get("media") or item
    caption = m.get("caption") or {}
    covers = ((m.get("image_versions2") or {}).get("candidates")) or []
    return {
        "platform": "instagram", "handle": handle, "code": m.get("code") or "",
        "url": f"https://www.instagram.com/reel/{m.get('code')}/",
        "views": int(m.get("play_count") or m.get("ig_play_count") or 0),
        "likes": int(m.get("like_count") or 0), "comments": int(m.get("comment_count") or 0),
        "secs": round(float(m.get("video_duration") or 0), 1),
        "date": _day(m.get("taken_at")),
        "caption": ((caption.get("text") if isinstance(caption, dict) else caption) or "").strip(),
        "cover_url": _first_url(covers),
        "media_url": _first_url(m.get("video_versions")),
    }


def normalize_tiktok(item: dict, handle: str) -> dict:
    s, v = item.get("statistics") or {}, item.get("video") or {}
    return {
        "platform": "tiktok", "handle": handle, "code": str(item.get("aweme_id") or ""),
        "url": item.get("url") or f"https://www.tiktok.com/@{handle}/video/{item.get('aweme_id')}",
        "views": int(s.get("play_count") or 0), "likes": int(s.get("digg_count") or 0),
        "comments": int(s.get("comment_count") or 0),
        "secs": round(float(v.get("duration") or 0) / (1000 if (v.get("duration") or 0) > 1000 else 1), 1),
        "date": _day(item.get("create_time")),
        "caption": (item.get("desc") or "").strip(),
        "cover_url": _first_url(v.get("origin_cover") or v.get("cover")),
        "media_url": _first_url(v.get("download_no_watermark_addr") or v.get("play_addr")
                                or v.get("download_addr")),
        # A TikTok Shop post: a product is tagged and the creator earns commission
        "shoppable": '"is_ec_video":1' in (item.get("anchors_extras") or ""),
        # Photo-mode slideshows: every slide's image links (several formats each; some are HEIF)
        "slides": [((img.get("display_image") or {}).get("url_list") or [])
                   + ((img.get("owner_watermark_image") or {}).get("url_list") or [])
                   for img in (item.get("image_post_info") or {}).get("images") or []],
    }


def normalize_youtube(item: dict, handle: str) -> dict:
    return {
        "platform": "youtube", "handle": handle, "code": item.get("id") or "",
        "url": f"https://www.youtube.com/shorts/{item.get('id')}",
        "views": int(item.get("viewCountInt") or 0), "likes": int(item.get("likeCountInt") or 0),
        "comments": int(item.get("commentCountInt") or 0), "secs": 0,
        "date": _day(item.get("publishDate")),
        "caption": ((item.get("title") or "") + "\n" + (item.get("description") or "")).strip(),
        "cover_url": item.get("thumbnail") or "", "media_url": "",
    }


class ScrapeCreatorsOrganic:
    BASE = "https://api.scrapecreators.com"

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
                                headers={"x-api-key": self.api_key}, timeout=90)
        if resp.status_code != 200:
            raise AdSourceError(f"ScrapeCreators {path} returned {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        self.credits_used += int(data.get("credits_charged") or 1)
        return data

    def fetch_posts(self, platform: str, handle: str, max_pages: int = 8) -> list[dict]:
        handle = handle.lstrip("@")
        posts, cursor = [], None
        for _ in range(max_pages):
            if platform == "instagram":
                data = self._get("v1/instagram/user/reels",
                                 {"handle": handle, **({"max_id": cursor} if cursor else {})})
                posts += [normalize_instagram(i, handle) for i in data.get("items") or []]
                paging = data.get("paging_info") or {}
                cursor = paging.get("max_id") if paging.get("more_available") else None
            elif platform == "tiktok":
                data = self._get("v3/tiktok/profile/videos",
                                 {"handle": handle, **({"max_cursor": cursor} if cursor else {})})
                posts += [normalize_tiktok(i, handle) for i in data.get("aweme_list") or []]
                cursor = data.get("max_cursor") if data.get("has_more") else None
            elif platform == "youtube":
                data = self._get("v1/youtube/channel/shorts",
                                 {"handle": handle, "sort": "newest",
                                  **({"continuationToken": cursor} if cursor else {})})
                posts += [normalize_youtube(i, handle) for i in data.get("shorts") or []]
                cursor = data.get("continuationToken")
            else:
                raise AdSourceError(f"unknown platform {platform!r}")
            if not cursor:
                break
        seen, out = set(), []
        for p in posts:
            if p["code"] and p["code"] not in seen:
                seen.add(p["code"])
                out.append(p)
        return out

    def post_comments(self, platform: str, url: str, max_pages: int = 2) -> list[dict]:
        """Top-level comments on one post: [{text, who, likes, date}]. Instagram only for now."""
        if platform != "instagram":
            raise AdSourceError(f"comments for {platform} aren't supported yet")
        out, cursor = [], None
        for _ in range(max_pages):
            data = self._get("v2/instagram/post/comments", {"url": url, **({"cursor": cursor} if cursor else {})})
            for c in data.get("comments") or []:
                text = (c.get("text") or "").strip()
                if text:
                    out.append({"text": text, "who": (c.get("user") or {}).get("username", ""),
                                "likes": int(c.get("comment_like_count") or 0), "date": _day(c.get("created_at"))})
            cursor = data.get("cursor")
            if not cursor or not data.get("comments"):
                break
        return out

    def youtube_transcript(self, url: str) -> list[dict]:
        """Timestamped lines [{start, end, text}] for a YouTube Short, [] if there are none."""
        data = self._get("v1/youtube/video/transcript", {"url": url})
        lines = []
        for seg in data.get("transcript") or []:
            start = float(seg.get("startMs") or 0) / 1000
            end = float(seg.get("endMs") or seg.get("startMs") or 0) / 1000
            lines.append({"start": round(start, 2), "end": round(end, 2), "text": (seg.get("text") or "").strip()})
        return lines
