"""Ingredient claims: study-backed claims for each ingredient, for brands that list them.

Runs prompts/08-ingredient-claims.md when brand.md has `ingredients`. It reads the research
brief (the market overview and pain points) and `unique_mechanism` from brand.md, searches the
web for published studies, and saves brands/<brand>/ingredient-claims.md (a dated copy goes
in research/<date>/).
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brain as brainlib
from . import brand as brandlib
from . import llm

log = logging.getLogger("cse")

PROMPT = Path("prompts/08-ingredient-claims.md")
STUDY_LINK = re.compile(r"https?://(?:www\.)?(?:\S*ncbi\.nlm\.nih\.gov|doi\.org|\S*pubmed)\S*", re.I)


def ingredient_list(fields: dict) -> list[str]:
    """brand.md's `ingredients`, as a list (it may be a YAML list or one comma/line-separated string)."""
    raw = fields.get("ingredients") or []
    text = str(raw)
    items = raw if isinstance(raw, list) else re.split(r"\n" if "\n" in text else r",(?![^(]*\))", text)
    return [str(i).strip(" -•\t") for i in items if str(i).strip(" -•\t")]


def build_prompt(storage, slug: str, today: date) -> str | None:
    fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    items = ingredient_list(fields)
    if not items:
        return None
    brief_key = brandlib.brand_key(slug, "research-brief.md")
    market = (storage.read_text(brief_key) if storage.exists(brief_key)
              else f"(No research brief yet. What we know about the market:)\n"
                   f"- audience: {fields.get('audience', '')}\n- problem: {fields.get('problem', '')}\n"
                   f"{notes.strip()}")
    health = fields.get("health_product")
    return llm.render(PROMPT.read_text(), {
        "brand_name": fields.get("name") or slug,
        "product": fields.get("product") or "this product",
        "ingredients": "\n".join(f"- {i}" for i in items),
        "market_overview": brainlib.with_brief(market, storage, slug),
        "unique_mechanism": str(fields.get("unique_mechanism") or "").strip() or "(none given)",
        "compliance": ("This is a health product: flag every claim for compliance review."
                       if health else "Only claim what the studies show."),
        "date": today.isoformat(),
    })


def run(storage, slug: str, today: date | None = None, client=None) -> str | None:
    """Returns the saved key, or None when there are no ingredients or a handoff is waiting."""
    today = today or datetime.now(timezone.utc).date()
    prompt = build_prompt(storage, slug, today)
    if prompt is None:
        log.info("ingredients: %s lists no ingredients, skipping", slug)
        return None
    try:
        answer = llm.ask(storage, slug, f"ingredients-{today.isoformat()}", prompt, client=client,
                         max_tokens=32000, effort="high", web=True)
    except llm.HandoffPending as p:
        log.info("ingredients: answer %s, then re-run.", p.prompt_key)
        return None
    links = len(STUDY_LINK.findall(answer))
    if not links:
        answer = answer.rstrip() + ("\n\n> **Check:** no PubMed, PMC or DOI links were found in "
                                    "these claims. Don't use them until each one has a study link.\n")
    key = brandlib.brand_key(slug, "ingredient-claims.md")
    storage.write_text(key, answer.strip() + "\n")
    storage.write_text(brandlib.brand_key(slug, f"research/{today.isoformat()}/ingredient-claims.md"),
                       answer.strip() + "\n")
    log.info("ingredients: saved %s (%d study links)", key, links)
    return key
