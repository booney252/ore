"""Module 3: voice of customer -> brands/<brand>/voc.json.

Real customer words with a source for every quote. Never rewritten.

Sources:
- App Store reviews of competitor apps (and the brand's own app), from Apple's public
  review feed. Apps come from each competitor's app_store_url, or an App Store search by name.
- Pasted text: anything the user drops in brands/<brand>/voc-paste/*.md (Reddit threads,
  TikTok comments, Amazon reviews, DMs). Optional first line "source: <url>". Each paragraph
  becomes one quote, word for word.
Left out on purpose: Google Play (no official API) and the Reddit API (non-commercial only).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone

from . import brand as brandlib

log = logging.getLogger("cse")

FEED = "https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortby=mostrecent/json"
SEARCH = "https://itunes.apple.com/search"
PAGES = 2            # 50 reviews per page
MIN_WORDS = 6        # shorter reviews ("great app!!") say nothing
PROMPT_QUOTES = 160  # how many quotes go into a research prompt
PAUSE = 3.0          # seconds between Apple requests; their public endpoints rate-limit


def app_id(url: str) -> str | None:
    m = re.search(r"/id(\d+)", url or "")
    return m.group(1) if m else None


def _words(name: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", name.lower())


def domain(url: str) -> str:
    host = re.sub(r"^https?://", "", (url or "").lower()).split("/")[0]
    return host.removeprefix("www.")


def find_app(session, name: str, website: str, country: str = "us") -> dict | None:
    """App Store search. Only accept an app whose title contains the competitor's name AND whose
    developer site is the competitor's website, so "Eden" never matches a dating app."""
    if not domain(website):
        return None
    time.sleep(PAUSE)
    r = session.get(SEARCH, params={"term": name, "entity": "software", "country": country,
                                    "limit": 10}, timeout=20)
    r.raise_for_status()
    want = _words(name)
    for app in r.json().get("results", []):
        title = _words(app.get("trackName", ""))
        named = want and any(title[i:i + len(want)] == want for i in range(len(title)))
        if named and domain(app.get("sellerUrl", "")) == domain(website):
            return {"id": str(app["trackId"]), "name": app["trackName"], "url": app["trackViewUrl"]}
    return None


def parse_feed(data: dict, app_name: str, app_url: str) -> list[dict]:
    entries = data.get("feed", {}).get("entry", [])
    if isinstance(entries, dict):
        entries = [entries]
    out = []
    for e in entries:
        if "im:rating" not in e:  # the first entry is sometimes the app itself
            continue
        title = e.get("title", {}).get("label", "").strip()
        body = e.get("content", {}).get("label", "").strip()
        text = f"{title}. {body}" if title and not title.endswith((".", "!", "?")) else f"{title} {body}"
        out.append({
            "text": text.strip(),
            "source": "app_store",
            "about": app_name,
            "rating": int(e["im:rating"]["label"]),
            "date": e.get("updated", {}).get("label", "")[:10],
            "url": f"{app_url.split('?')[0]}?see-all=reviews",
            "review_id": e.get("id", {}).get("label", ""),
        })
    return out


def parse_paste(text: str, name: str) -> list[dict]:
    """A pasted file -> one quote per paragraph, exact words."""
    lines = text.strip().splitlines()
    url = ""
    if lines and lines[0].lower().startswith("source:"):
        url = lines.pop(0).split(":", 1)[1].strip()
    paragraphs = re.split(r"\n\s*\n", "\n".join(lines))
    return [{"text": p.strip(), "source": "pasted", "about": name, "url": url}
            for p in paragraphs if len(p.split()) >= 3]


def _id(q: dict) -> str:
    return hashlib.sha1(re.sub(r"\s+", " ", q["text"].lower()).encode()).hexdigest()[:16]


def run(storage, slug: str, session=None) -> dict:
    if session is None:
        import requests

        session = requests.Session()
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    country = (fields.get("country") or "US").lower()
    comp_key = brandlib.brand_key(slug, "competitors.json")
    comps = [c for c in json.loads(storage.read_text(comp_key))["competitors"]
             if c.get("status") != "removed"] if storage.exists(comp_key) else []
    targets = [{"name": c["name"], "app_store_url": c.get("app_store_url", ""),
                "website": c.get("website", "")} for c in comps]
    if fields.get("app_store_url"):
        targets.append({"name": fields.get("name") or slug, "app_store_url": fields["app_store_url"],
                        "website": fields.get("website", "")})

    quotes: dict[str, dict] = {}
    counts: dict[str, int] = {}
    for t in targets:
        aid, url = app_id(t["app_store_url"]), t["app_store_url"]
        try:
            if not aid:
                app = find_app(session, t["name"], t["website"], country)
                if not app:
                    log.info("  %-22s no matching App Store app", t["name"])
                    counts[t["name"]] = 0
                    continue
                aid, url = app["id"], app["url"]
            got = []
            for page in range(1, PAGES + 1):
                time.sleep(PAUSE)
                r = session.get(FEED.format(country=country, page=page, app_id=aid), timeout=20)
                if r.status_code != 200:
                    log.warning("  %-22s App Store page %d: HTTP %s", t["name"], page, r.status_code)
                    break
                batch = parse_feed(r.json(), t["name"], url)
                got.extend(batch)
                if len(batch) < 50:
                    break
        except Exception as e:  # noqa: BLE001 - one app failing shouldn't stop the run
            log.warning("  %-22s App Store failed: %s", t["name"], e)
            counts[t["name"]] = 0
            continue
        got = [q for q in got if len(q["text"].split()) >= MIN_WORDS]
        for q in got:
            quotes[_id(q)] = q
        counts[t["name"]] = len(got)
        log.info("  %-22s %d App Store reviews", t["name"], len(got))

    pasted = 0
    for key in storage.list(brandlib.brand_key(slug, "voc-paste/")):
        if key.endswith((".md", ".txt")):
            for q in parse_paste(storage.read_text(key), key.rsplit("/", 1)[-1]):
                quotes[_id(q)] = q
                pasted += 1
    counts["pasted"] = pasted

    doc = {"brand": slug, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "counts": counts, "quotes": list(quotes.values())}
    storage.write_text(brandlib.brand_key(slug, "voc.json"), json.dumps(doc, indent=1) + "\n")
    log.info("voc: %d quotes (%d App Store, %d pasted)", len(quotes),
             sum(v for k, v in counts.items() if k != "pasted"), pasted)
    return counts


def for_prompt(quotes: list[dict], limit: int = PROMPT_QUOTES) -> str:
    """A balanced sample for a research prompt: pasted first, then reviews spread across apps
    and ratings, longer (more specific) ones first. One JSON line per quote."""
    pasted = [q for q in quotes if q["source"] == "pasted"]
    reviews = sorted((q for q in quotes if q["source"] != "pasted"),
                     key=lambda q: -len(q["text"]))
    picked, seen = list(pasted[:limit // 3]), {}
    for q in reviews:  # round-robin by (app, low/mid/high rating) so no single app dominates
        bucket = (q["about"], 0 if q.get("rating", 3) <= 2 else 2 if q.get("rating", 3) >= 4 else 1)
        if seen.get(bucket, 0) < 4:
            picked.append(q)
            seen[bucket] = seen.get(bucket, 0) + 1
        if len(picked) >= limit:
            break
    lines = [json.dumps({k: q.get(k) for k in ("text", "about", "rating", "url") if q.get(k) is not None},
                        ensure_ascii=False) for q in picked]
    return "\n".join(lines) or "(no customer quotes collected yet)"
