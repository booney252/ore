"""Unique mechanism ideas: UMP + UMS pairs for the brand, from the research brief.

Runs prompts/09-unique-mechanisms.md after the research brief and saves
brands/<brand>/unique-mechanisms.md (a dated copy goes in research/<date>/). The awareness stage
it targets is brand.md's `target_awareness` if set, otherwise the market-awareness research's final
call (research step 3, then the research brief), Problem Aware if neither names one.

Once the brand picks the ones it likes (the site saves unique-mechanisms-chosen.md), `rank` runs
prompts/10-rank-mechanisms.md and saves unique-mechanisms-ranked.md.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brain as brainlib
from . import brand as brandlib
from . import llm
from .stages import product_facts

log = logging.getLogger("cse")

PROMPT = Path("prompts/09-unique-mechanisms.md")
RANK_PROMPT = Path("prompts/10-rank-mechanisms.md")
DEFAULT_AWARENESS = "Problem Aware"
STAGES = ["Most Aware", "Product Aware", "Solution Aware", "Problem Aware", "Unaware"]
STAGE_RE = re.compile("|".join(STAGES), re.I)
VERDICT_RE = re.compile(r"final (?:call|pick|selection)|campaign target|\(primary\)|primary target|target stage", re.I)


def stages_in(text: str) -> str:
    """The awareness stage(s) the research says to target, e.g. "Problem Aware", or ""."""
    found: list[str] = []
    for line in text.splitlines():
        verdict = VERDICT_RE.search(line)
        if not verdict:
            continue
        if re.search(r"final (?:call|pick|selection)", verdict.group(0), re.I):
            # the final call is the verdict: take the stage right after it, not the rest of the line
            first = STAGE_RE.search(line, verdict.end())
            if first:
                return next(s for s in STAGES if s.lower() == first.group(0).lower())
            continue
        for m in STAGE_RE.finditer(line):
            stage = next(s for s in STAGES if s.lower() == m.group(0).lower())
            if stage not in found:
                found.append(stage)
    return " and ".join(found)


def target_awareness(storage, slug: str, fields: dict) -> str:
    """The brand's market awareness: brand.md, else the awareness research, else Problem Aware."""
    if str(fields.get("target_awareness") or "").strip():
        return str(fields["target_awareness"]).strip()
    step3 = sorted(k for k in storage.list(brandlib.brand_key(slug, "research/"))
                   if k.endswith("03-awareness.md"))
    sources = [step3[-1]] if step3 else []
    sources.append(brandlib.brand_key(slug, "research-brief.md"))
    for key in sources:
        if storage.exists(key):
            found = stages_in(storage.read_text(key))
            if found:
                return found
    return DEFAULT_AWARENESS


def build_prompt(storage, slug: str, today: date) -> str | None:
    brief_key = brandlib.brand_key(slug, "research-brief.md")
    if not storage.exists(brief_key):
        return None
    fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    return llm.render(PROMPT.read_text(), {
        "brand_name": fields.get("name") or slug,
        "product": fields.get("product") or "this product",
        "niche": fields.get("niche") or "its",
        "research_brief": brainlib.with_brief(storage.read_text(brief_key), storage, slug),
        "product_facts": product_facts(fields, notes),
        "awareness": target_awareness(storage, slug, fields),
        "compliance": ("This is a health product: flag any UMP or UMS that implies a medical "
                       "result, cure or a specific number, and suggest a safer version."
                       if fields.get("health_product") else
                       "Follow only the brand's own rules on claims (brand.md, the research brief's hard "
                       "rules); otherwise go bold."),
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


def rank(storage, slug: str, today: date | None = None, client=None) -> str | None:
    """Rank the brand's chosen mechanisms. None when nothing is chosen or a handoff is waiting."""
    today = today or datetime.now(timezone.utc).date()
    chosen_key = brandlib.brand_key(slug, "unique-mechanisms-chosen.md")
    brief_key = brandlib.brand_key(slug, "research-brief.md")
    if not storage.exists(chosen_key) or not storage.exists(brief_key):
        log.info("mechanisms: %s has no chosen mechanisms to rank, skipping", slug)
        return None
    fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    prompt = llm.render(RANK_PROMPT.read_text(), {
        "brand_name": fields.get("name") or slug,
        "product": fields.get("product") or "this product",
        "niche": fields.get("audience") or fields.get("niche") or "this market",
        "research_brief": brainlib.with_brief(storage.read_text(brief_key), storage, slug),
        "mechanisms": storage.read_text(chosen_key),
        "product_facts": product_facts(fields, notes),
        "awareness": target_awareness(storage, slug, fields),
        "date": today.isoformat(),
    })
    try:
        answer = llm.ask(storage, slug, f"mechanisms-rank-{today.isoformat()}", prompt, client=client,
                         max_tokens=16000, effort="high")
    except llm.HandoffPending as p:
        log.info("mechanisms: answer %s, then re-run.", p.prompt_key)
        return None
    key = brandlib.brand_key(slug, "unique-mechanisms-ranked.md")
    storage.write_text(key, answer.strip() + "\n")
    log.info("mechanisms: saved %s", key)
    return key

