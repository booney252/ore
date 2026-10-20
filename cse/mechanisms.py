"""Unique mechanism ideas: UMP + UMS pairs for the brand, from the research brief.

Runs prompts/09-unique-mechanisms.md after the research brief and saves
brands/<brand>/unique-mechanisms.md (a dated copy goes in research/<date>/). The awareness stage
it targets is brand.md's `target_awareness`, Problem Aware by default.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import llm
from .stages import product_facts

log = logging.getLogger("cse")

PROMPT = Path("prompts/09-unique-mechanisms.md")
DEFAULT_AWARENESS = "Problem Aware"


def build_prompt(storage, slug: str, today: date) -> str | None:
    brief_key = brandlib.brand_key(slug, "research-brief.md")
    if not storage.exists(brief_key):
        return None
    fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    return llm.render(PROMPT.read_text(), {
        "brand_name": fields.get("name") or slug,
        "product": fields.get("product") or "this product",
        "niche": fields.get("niche") or "its",
        "research_brief": storage.read_text(brief_key),
        "product_facts": product_facts(fields, notes),
        "awareness": str(fields.get("target_awareness") or "").strip() or DEFAULT_AWARENESS,
        "compliance": ("This is a health product: flag any UMP or UMS that implies a medical "
                       "result, cure or a specific number, and suggest a safer version."
                       if fields.get("health_product") else
                       "Flag any idea that would need a claim we can't prove."),
        "date": today.isoformat(),
    })


def run(storage, slug: str, today: date | None = None, client=None) -> str | None:
    """Returns the saved key, or None when there's no research brief yet or a handoff is waiting."""
    today = today or datetime.now(timezone.utc).date()
    prompt = build_prompt(storage, slug, today)
    if prompt is None:
        log.info("mechanisms: %s has no research brief yet, skipping", slug)
        return None
    try:
        answer = llm.ask(storage, slug, f"mechanisms-{today.isoformat()}", prompt, client=client,
                         max_tokens=32000, effort="high")
    except llm.HandoffPending as p:
        log.info("mechanisms: answer %s, then re-run.", p.prompt_key)
        return None
    key = brandlib.brand_key(slug, "unique-mechanisms.md")
    storage.write_text(key, answer.strip() + "\n")
    storage.write_text(brandlib.brand_key(slug, f"research/{today.isoformat()}/unique-mechanisms.md"),
                       answer.strip() + "\n")
    log.info("mechanisms: saved %s", key)
    return key
