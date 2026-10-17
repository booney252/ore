"""Module 5: weekly creative briefs -> brands/<brand>/briefs/<YYYY-MM-DD>.md

Reads the research brief, everything in knowledge/, the scored + broken-down ads, and the
last few weeks of briefs, then fills prompts/05-weekly-briefs.md.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import llm

log = logging.getLogger("cse")

PROMPT_FILE = Path("prompts/05-weekly-briefs.md")
KNOWLEDGE_DIR = Path("knowledge")
TOP_ADS = 30
MAX_NEW_ADS = 30
RECENT_WEEKS = 3
DEFAULT_AD_FORMAT = "UGC: a real creator talking to camera, shot on a phone, 20-60s full video with a word-for-word script"


def load_knowledge(folder: Path = KNOWLEDGE_DIR) -> str:
    parts = []
    for path in sorted(folder.glob("*.md")):
        text = path.read_text().strip()
        # Skip files that are still just a template heading + comment.
        body = "\n".join(l for l in text.splitlines()
                         if l.strip() and not l.startswith("#") and not l.strip().startswith("<!--"))
        if body.strip():
            parts.append(f"<file name=\"{path.name}\">\n{text}\n</file>")
    return "\n\n".join(parts) or "(none yet)"


def pick_ads(ads: list[dict], today: date) -> list[dict]:
    """Top winners overall + everything new this week + all own ads, broken down only."""
    ready = [a for a in ads if a.get("breakdown")]
    ready.sort(key=lambda a: a.get("score", 0), reverse=True)
    week_ago = today.toordinal() - 7
    new = [a for a in ready if a.get("first_seen")
           and date.fromisoformat(a["first_seen"]).toordinal() >= week_ago][:MAX_NEW_ADS]
    own = [a for a in ready if a.get("is_own")]
    chosen, seen = [], set()
    for a in ready[:TOP_ADS] + new + own:
        if a["ad_id"] not in seen:
            seen.add(a["ad_id"])
            chosen.append(a)
    return chosen


def format_ad(ad: dict, today: date) -> str:
    a, b = ad.get("analysis") or {}, ad.get("breakdown") or {}
    new = " NEW" if ad.get("first_seen") and \
        date.fromisoformat(ad["first_seen"]).toordinal() >= today.toordinal() - 7 else ""
    who = "OWN AD" if ad.get("is_own") else f"{ad.get('brand')} ({ad.get('ring')})"
    return "\n".join([
        f"### Ad {ad['ad_id']} | {who}{new}",
        f"- Score {ad.get('score')}/100: {ad.get('score_why')}",
        (f"- REMOVED from the Ad Library on {ad['removed_from_library']}: don't link it; "
         "cite it by ID as 'removed'" if ad.get("removed_from_library")
         else f"- Link: {ad.get('ad_library_url')}"),
        f"- {ad.get('media_type')}, {a.get('length_s', 0)}s, {a.get('cuts_per_second', 0)} cuts/sec",
        f"- Primary text: {(ad.get('body') or '')[:500]}",
        f"- Breakdown: {json.dumps(b, ensure_ascii=False)}",
    ])


def run(storage, slug: str, brand_name: str | None = None, count: int = 6,
        today: date | None = None, client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    brand_name = brand_name or slug
    research = storage.read_text(brandlib.brand_key(slug, "research-brief.md"))
    fields = {}
    if storage.exists(brandlib.brand_key(slug)):
        fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    ad_format = fields.get("ad_format") or DEFAULT_AD_FORMAT
    ads = list(json.loads(storage.read_text(brandlib.brand_key(slug, "ads.json")))["ads"].values())
    chosen = pick_ads(ads, today)
    if not chosen:
        raise llm.LLMError("no broken-down ads yet: run `ads`, `creative` and `breakdown` first")

    recent_keys = sorted(storage.list(brandlib.brand_key(slug, "briefs/")))[-RECENT_WEEKS:]
    recent = "\n\n".join(storage.read_text(k)[:4000] for k in recent_keys) or "(none)"

    prompt = llm.render(PROMPT_FILE.read_text(), {
        "brand_name": brand_name,
        "brief_count": count,
        "ad_format": ad_format,
        "research_brief": research,
        "knowledge": load_knowledge(),
        "ads": "\n\n".join(format_ad(a, today) for a in chosen),
        "recent_briefs": recent,
        "date": today.isoformat(),
    })
    try:
        answer = llm.ask(storage, slug, f"briefs-{today.isoformat()}", prompt, client=client,
                         max_tokens=48000, effort="high")
    except llm.HandoffPending as p:
        log.info("briefs: prompt ready at %s; answer it in %s, then re-run.",
                 p.prompt_key, p.answer_key)
        return None

    out_key = brandlib.brand_key(slug, f"briefs/{today.isoformat()}.md")
    header = (f"# {brand_name} briefs, week of {today.isoformat()}\n\n"
              f"_Built from {len(chosen)} ads ({sum(1 for a in chosen if a.get('is_own'))} own)._\n\n")
    storage.write_text(out_key, header + answer.strip() + "\n")
    log.info("briefs: saved %s (%d ads used)", out_key, len(chosen))
    return out_key
