"""New brand from a one-line description: the whole foundation, in order.

The website (or `cse setup`) writes a brand.md with just the name, website and what it sells.
1. brand profile: fill every empty brand.md field from web research (never overwriting the user)
2. competitors: the 3-ring map
3. voc: customer quotes (App Store reviews + anything pasted)
4. ads: pull competitor + own ads from the Ad Library and score them
5. research: the 4 research prompts -> research-brief.md
"""

from __future__ import annotations

import json
import logging
import os
import re

from . import brand as brandlib
from . import ads, competitors, llm, research, voc

log = logging.getLogger("cse")

FIELDS = [*brandlib.PROMPT_FIELDS, "offer", "app_store_url", "known_competitors", "health_product"]

RESEARCH_PROMPT = """\
You are setting up a creative strategy profile for a brand that runs paid social ads.
All we know is below. Research the brand with web search (its website, app store or shop
listing, reviews, press) and write plain notes covering each field. Only state what you
found or can reasonably infer; say "not found" otherwise.

What we know:
{known}

Fields to cover:
- product: what it is, one line
- niche: the category it competes in
- audience: who buys it, in plain words
- age_range: the buyers' realistic age range, e.g. "25-45"
- problem: the problem buyers struggle with, in their words
- country: main market, e.g. "US"
- communities: where buyers talk (subreddits, forums, creators)
- category_examples: 3-6 products like this one
- offer: price, trial, guarantee
- app_store_url: its App Store link if it's an iOS app, else empty
- known_competitors: its closest competitors by name
- health_product: true if it's health, supplements, medical, weight loss or similar
  (ad claims need compliance review)
"""

EXTRACT = "Turn these research notes into the brand profile fields. Use empty values for anything not found."

SCHEMA = {
    "type": "object",
    "properties": {
        "product": {"type": "string"},
        "niche": {"type": "string"},
        "audience": {"type": "string"},
        "age_range": {"type": "string"},
        "problem": {"type": "string"},
        "country": {"type": "string"},
        "communities": {"type": "array", "items": {"type": "string"}},
        "category_examples": {"type": "array", "items": {"type": "string"}},
        "offer": {"type": "string"},
        "app_store_url": {"type": "string"},
        "known_competitors": {"type": "array", "items": {"type": "string"}},
        "health_product": {"type": "boolean"},
    },
    "required": FIELDS,
    "additionalProperties": False,
}


def _empty(v) -> bool:
    return v in (None, "", [], False)


def fill(brand_md: str, values: dict) -> str:
    """Write `values` into brand.md's front matter, only where the field is still empty.
    Keeps the template's comments; values are written as JSON, which YAML reads as-is."""
    current = brandlib.parse(brand_md)[0]
    head, sep, rest = brand_md.partition("\n---")
    for field, value in values.items():
        if _empty(value) or not _empty(current.get(field)):
            continue
        line = re.compile(rf"^{re.escape(field)}:[^#\n]*?(\s*#.*)?$", re.M)
        new = f"{field}: {json.dumps(value, ensure_ascii=False)}"
        if line.search(head):
            head = line.sub(lambda m: new + (m.group(1) or ""), head, count=1)
        else:
            head += f"\n{new}"
    return head + sep + rest


def run(storage, slug: str, client=None, check=lambda: None) -> str | None:
    """`check` is called between steps; the worker uses it to stop a cancelled job."""
    key = brandlib.brand_key(slug)
    text = storage.read_text(key)
    fields = brandlib.parse(text)[0]
    client = client or llm.make_client()

    if brandlib.missing_fields(fields):
        known = "\n".join(f"- {k}: {v}" for k, v in fields.items()
                          if not _empty(v) and k != "ad_format")
        log.info("setup: researching %s...", slug)
        notes, searches = llm.web_research(client, RESEARCH_PROMPT.format(known=known))
        values = llm.extract_json(client, EXTRACT, notes, SCHEMA)
        storage.write_text(key, fill(text, values))
        log.info("setup: drafted brand.md from %d web searches", searches)

    check()
    competitors.run(storage, slug, client=client)
    check()
    voc.run(storage, slug)
    check()
    if os.environ.get("SCRAPECREATORS_API_KEY"):
        ads.run(storage, slug)
    else:
        log.warning("setup: SCRAPECREATORS_API_KEY not set, so the research runs without ads")
    check()
    return research.run(storage, slug, client=client)
