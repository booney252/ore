"""The brand brain: brands/<slug>/brand.md.

brand.md starts with a YAML block holding the fields the research prompts
need ({{product}}, {{age_range}}, ...), followed by free-form notes.
"""

from __future__ import annotations

import re

import yaml

# Fields the prompts in prompts/ fill from brand.md.
PROMPT_FIELDS = [
    "product",
    "niche",
    "audience",
    "age_range",
    "problem",
    "country",
    "communities",
    "category_examples",
]

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")

TEMPLATE = """\
---
# Brand brain for {name}. Fill in every field; the research prompts use them.
name: {name}
website: ""
product: ""            # what it is, one line. e.g. "a morning alarm that locks your phone until you get up"
niche: ""              # e.g. "habit and productivity apps"
audience: ""           # who buys it, in plain words
age_range: ""          # this brand's real range, e.g. "18-25"
problem: ""            # the problem they struggle with, in their words
country: "US"
communities: []        # where they talk: subreddits, forums, creators. e.g. ["r/getdisciplined"]
category_examples: []  # products like ours, e.g. ["Alarmy", "Opal"]
offer: ""              # price, trial, guarantee
app_store_url: ""
play_store_url: ""
known_competitors: []  # names you already know; the tool marks these as "listed by you"
health_product: false  # true = flag every promise for compliance review
ingredients: []        # if it has them, e.g. ["Ashwagandha (600 mg)", "Magnesium glycinate"]; Ore finds study-backed claims for each
unique_mechanism: ""   # optional: the unique mechanism the copy will use
ad_format: "UGC: a real creator talking to camera, shot on a phone, 20-60s full video with a word-for-word script"  # what every brief must be
---

# {name}

## Product

## Offer

## Audience

## Notes
"""

_FRONT_MATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?(.*)\Z", re.DOTALL)


class BrandError(Exception):
    pass


def validate_slug(slug: str) -> str:
    if not SLUG_RE.match(slug):
        raise BrandError(
            f"brand name '{slug}' must be lowercase letters, numbers and dashes (e.g. 'peptidepal')"
        )
    return slug


def brand_key(slug: str, filename: str = "brand.md") -> str:
    return f"brands/{validate_slug(slug)}/{filename}"


def render_template(slug: str) -> str:
    return TEMPLATE.format(name=validate_slug(slug))


def parse(text: str) -> tuple[dict, str]:
    """Split brand.md into (fields, notes body)."""
    match = _FRONT_MATTER_RE.match(text)
    if not match:
        raise BrandError("brand.md must start with a '---' YAML block")
    fields = yaml.safe_load(match.group(1)) or {}
    if not isinstance(fields, dict):
        raise BrandError("brand.md YAML block must be key: value pairs")
    return fields, match.group(2)


def missing_fields(fields: dict) -> list[str]:
    return [f for f in PROMPT_FIELDS if not fields.get(f)]
