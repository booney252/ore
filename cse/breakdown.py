"""Module 2b (judgment part): Claude reads each new ad's frames + transcript and breaks it down.

Uses prompts/ad-breakdown.md. Saves the result as ad["breakdown"] in ads.json.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from . import brand as brandlib
from . import llm

log = logging.getLogger("cse")

PROMPT_FILE = Path("prompts/ad-breakdown.md")


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


def run(storage, slug: str, brand_name: str | None = None, limit: int | None = None,
        client=None) -> dict:
    ads_key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(ads_key))
    template = PROMPT_FILE.read_text()
    brand_name = brand_name or slug
    todo = sorted((a for a in doc["ads"].values() if a.get("analysis") and not a.get("breakdown")),
                  key=lambda a: a.get("score", 0), reverse=True)
    if limit:
        todo = todo[:limit]

    done, waiting, failed = 0, [], 0
    for ad in todo:
        frames = [f["key"] for f in ad["analysis"].get("frames", [])]
        try:
            answer = llm.ask(storage, slug, f"breakdown-{ad['ad_id']}",
                             build_prompt(template, ad, brand_name), image_keys=frames,
                             client=client, max_tokens=8000, effort="medium")
            ad["breakdown"] = llm.parse_json(answer)
            done += 1
        except llm.HandoffPending as p:
            waiting.append(p.prompt_key)
        except llm.LLMError as e:
            ad["breakdown_error"] = str(e)[:200]
            failed += 1
            log.warning("  breakdown failed for %s: %s", ad["ad_id"], e)
    storage.write_text(ads_key, json.dumps(doc, indent=2) + "\n")

    log.info("breakdown: %d done, %d failed, %d waiting on handoff", done, failed, len(waiting))
    if waiting:
        log.info("handoff: answer each prompt in brands/%s/handoff/ (breakdown-*.prompt.md "
                 "-> .answer.md), then re-run.", slug)
    return {"done": done, "failed": failed, "waiting": len(waiting)}
