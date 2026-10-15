"""Module 1: the 3-ring competitor map -> brands/<brand>/competitors.json.

Each competitor:
  name, ring (direct|adjacent|relative), website, facebook_page, why,
  source ("you" = listed in brand.md, "tool" = found by search),
  status ("approved" | "pending" | "removed")

Re-running keeps your edits: anything you set to "removed" stays removed, and
approved entries stay approved. New finds come in as "pending".
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from . import brand as brandlib
from . import llm

log = logging.getLogger("cse")

RINGS = ("direct", "adjacent", "relative")
MIN_PER_RING = 5

SCHEMA = {
    "type": "object",
    "properties": {
        "competitors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "ring": {"type": "string", "enum": list(RINGS)},
                    "website": {"type": "string"},
                    "facebook_page": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["name", "ring", "website", "facebook_page", "why"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["competitors"],
    "additionalProperties": False,
}

RESEARCH_PROMPT = """\
You are mapping the competitive landscape for a brand that runs paid social ads.

Brand details (from the owner's brand.md):
{brand_fields}

Owner's notes:
{notes}

Competitors the owner already knows: {known}

Use web search to find real competitors in three rings:
- DIRECT: same product type, same buyer.
- ADJACENT: different product, same buyer and same problem.
- RELATIVE: same buyer, nearby problem.

Find at least {min_per_ring} per ring (more is fine), including the owner's known ones. Prefer
brands that actively advertise to this buyer in {country}. For each one, find:
- the official website URL
- the Facebook page URL, if one exists (search for it; leave blank if not found)
- one line on why it competes, specific to this buyer and problem

Only list companies or products you confirmed exist. Do not invent URLs: if you did not
see a URL in search results, leave it blank. For health products, describe what the
competitor sells neutrally; do not repeat their health claims as fact.
"""

EXTRACT_INSTRUCTIONS = """\
Convert the research notes below into the JSON schema. One entry per competitor.
Use exactly the URLs that appear in the notes; use "" when a URL is missing.
Keep "why" to one short line. Do not add competitors that aren't in the notes.
"""


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _clean_url(url: str) -> str:
    url = (url or "").strip()
    return url if url.startswith(("http://", "https://")) else ""


def merge(existing: list[dict], known: list[str], found: list[dict]) -> list[dict]:
    """Combine previous competitors.json, brand.md's known list, and fresh finds.

    - Your status edits on existing entries win (removed stays removed).
    - Known competitors are marked source="you" and approved.
    - Fresh finds fill blank fields on existing entries but don't overwrite filled ones.
    """
    by_key: dict[str, dict] = {}
    for c in existing:
        by_key[_norm(c["name"])] = dict(c)

    known_keys = set()
    for name in known:
        key = _norm(name)
        if not key:
            continue
        known_keys.add(key)
        entry = by_key.setdefault(key, {"name": name, "ring": "", "website": "",
                                        "facebook_page": "", "why": "", "status": "approved"})
        entry["source"] = "you"

    for f in found:
        key = _norm(f.get("name", ""))
        if not key:
            continue
        fresh = {
            "name": f["name"].strip(),
            "ring": f.get("ring") if f.get("ring") in RINGS else "",
            "website": _clean_url(f.get("website", "")),
            "facebook_page": _clean_url(f.get("facebook_page", "")),
            "why": (f.get("why") or "").strip(),
        }
        if key in by_key:
            entry = by_key[key]
            for field in ("ring", "website", "facebook_page", "why"):
                if not entry.get(field):
                    entry[field] = fresh[field]
        else:
            by_key[key] = {**fresh, "source": "tool", "status": "pending"}

    ring_order = {r: i for i, r in enumerate(RINGS)}
    return sorted(by_key.values(),
                  key=lambda c: (ring_order.get(c.get("ring"), 99), c["source"] != "you",
                                 c["name"].lower()))


def counts(competitors: list[dict]) -> dict:
    active = [c for c in competitors if c.get("status") != "removed"]
    out = {r: sum(1 for c in active if c.get("ring") == r) for r in RINGS}
    out["no_ring"] = sum(1 for c in active if c.get("ring") not in RINGS)
    out["from_you"] = sum(1 for c in active if c.get("source") == "you")
    out["found_by_tool"] = sum(1 for c in active if c.get("source") == "tool")
    out["removed"] = len(competitors) - len(active)
    return out


def run(storage, slug: str, client=None) -> dict:
    fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    missing = brandlib.missing_fields(fields)
    if missing:
        log.warning("brand.md is missing: %s (results will be weaker)", ", ".join(missing))

    key = brandlib.brand_key(slug, "competitors.json")
    existing = json.loads(storage.read_text(key))["competitors"] if storage.exists(key) else []
    known = [str(k) for k in fields.get("known_competitors") or []]

    brand_fields = "\n".join(
        f"- {f}: {fields.get(f)}" for f in ["name", "website", *brandlib.PROMPT_FIELDS, "offer"]
        if fields.get(f)
    )
    prompt = RESEARCH_PROMPT.format(
        brand_fields=brand_fields,
        notes=notes.strip() or "(none)",
        known=", ".join(known) or "(none)",
        min_per_ring=MIN_PER_RING,
        country=fields.get("country") or "US",
    )

    client = client or llm.make_client()
    log.info("competitors: researching %s with web search...", slug)
    research, searches = llm.web_research(client, prompt)
    found = llm.extract_json(client, EXTRACT_INSTRUCTIONS, research, SCHEMA)["competitors"]

    competitors = merge(existing, known, found)
    storage.write_text(key, json.dumps({
        "brand": slug,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "competitors": competitors,
    }, indent=2) + "\n")

    c = counts(competitors)
    log.info("competitors: %d web searches, %d found this run", searches, len(found))
    log.info("competitors: direct %d, adjacent %d, relative %d | from you %d, found %d, removed %d",
             c["direct"], c["adjacent"], c["relative"], c["from_you"], c["found_by_tool"],
             c["removed"])
    log.info("saved %s. Review it: set \"status\" to \"approved\" or \"removed\".", key)
    return c
