"""Module 2b (judgment part): Claude reads each new ad's frames + transcript and breaks it down.

Uses prompts/ad-breakdown.md. Saves the result as ad["breakdown"] in ads.json.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import brand as brandlib
from . import llm
from .ads import save_fields

log = logging.getLogger("cse")

PROMPT_FILE = Path("prompts/ad-breakdown.md")
STATIC_PROMPT_FILE = Path("prompts/ad-breakdown-static.md")  # images: graphic + copy, no transcript


WORKERS = 8  # breakdowns running at once


def _transcript(analysis: dict) -> str:
    lines = [f"[{s['start']:.1f}-{s['end']:.1f}] {s['text']}" for s in analysis.get("transcript", [])]
    return "\n".join(lines) or "(no speech)"


def build_prompt(template: str, ad: dict, brand_name: str) -> str:
    a = ad.get("analysis") or {}
    return llm.render(template, {
        "brand_name": brand_name,
        "advertiser": ad.get("brand", ""),
        "ring": "own ad" if ad.get("is_own") else f"{ad.get('ring', '')} competitor",
        "score": ad.get("score", 0),
        "score_why": ad.get("score_why", ""),
        "media_type": ad.get("media_type", ""),
        "length_s": a.get("length_s", 0),
        "cut_count": a.get("cut_count", 0),
        "cuts_per_second": a.get("cuts_per_second", 0),
        "headline": ad.get("headline") or "(none)",
        "cta": ad.get("cta") or "(none)",
        "link": ad.get("link") or "(none)",
        "body": ad.get("body") or "(none)",
        "transcript": _transcript(a),
        "frame_times": ", ".join(str(f["t"]) for f in a.get("frames", [])) or "(none)",
    })


def pick(ads: list[dict], limit: int | None, per_brand: int | None) -> list[dict]:
    """Highest scores first, at most `per_brand` per advertiser, at most `limit` total."""
    todo = sorted((a for a in ads if a.get("analysis") and not a.get("breakdown")),
                  key=lambda a: a.get("score", 0), reverse=True)
    if per_brand:
        seen: dict[str, int] = {}
        kept = []
        for a in todo:
            n = seen.get(a.get("brand", ""), 0)
            if n < per_brand:
                kept.append(a)
                seen[a.get("brand", "")] = n + 1
        todo = kept
    return todo[:limit] if limit is not None else todo


def run(storage, slug: str, brand_name: str | None = None, limit: int | None = None,
        per_brand: int | None = None, client=None, ids: list[str] | None = None) -> dict:
    """With `ids`, also break down those ads (e.g. the report's lane candidates) on top of the pick."""
    ads_key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(ads_key))
    templates = {"video": PROMPT_FILE.read_text(), "image": STATIC_PROMPT_FILE.read_text()}
    brand_name = brand_name or slug
    todo = pick(list(doc["ads"].values()), limit, per_brand)
    if ids:
        have = {a["ad_id"] for a in todo}
        todo += [doc["ads"][i] for i in ids if i in doc["ads"] and i not in have
                 and doc["ads"][i].get("analysis") and not doc["ads"][i].get("breakdown")]

    def one(ad: dict) -> str:
        frames = [f["key"] for f in ad["analysis"].get("frames", [])]
        try:
            answer = llm.ask(storage, slug, f"breakdown-{ad['ad_id']}",
                             build_prompt(templates["image" if ad.get("media_type") == "image"
                                                    else "video"], ad, brand_name),
                             image_keys=frames,
                             client=client, max_tokens=8000, effort="medium")
            ad["breakdown"] = llm.parse_json(answer)
            save_fields(storage, slug, ad["ad_id"], {"breakdown": ad["breakdown"]},
                        drop=("breakdown_error",))
            log.info("  broke down %s %s", ad["ad_id"], ad.get("brand"))
            return "done"
        except llm.HandoffPending as p:
            return p.prompt_key
        except llm.LLMError as e:
            ad["breakdown_error"] = str(e)[:200]
            log.warning("  breakdown failed for %s: %s", ad["ad_id"], e)
            save_fields(storage, slug, ad["ad_id"], {"breakdown_error": ad["breakdown_error"]})
            return "failed"

    # Several at once: each one is a slow model call, so in parallel a batch takes minutes, not an hour.
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(one, todo))
    done, failed = results.count("done"), results.count("failed")
    waiting = [r for r in results if r not in ("done", "failed")]

    log.info("breakdown: %d done, %d failed, %d waiting on handoff", done, failed, len(waiting))
    if waiting:
        log.info("handoff: answer each prompt in brands/%s/handoff/ (breakdown-*.prompt.md "
                 "-> .answer.md), then re-run.", slug)
    return {"done": done, "failed": failed, "waiting": len(waiting)}
