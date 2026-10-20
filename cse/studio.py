"""Creator Studio: ready-to-film scripts for one creator, for one brand, on demand.

The creator-facing side of Ore (e.g. a Trybe creator making paid ads for a brand). A studio
creator picks a brand, and Ore writes scripts in their voice from that brand's brain (product
facts + research brief) and its own winning ads. Studio creators live in studio/creators.json
(account-level, not per brand); scripts are saved to studio/scripts/<stem>.md with a .json
beside it (brand, creator, format, the ad IDs it was built from).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import creators as creatorlib
from . import formats, llm
from .stages import format_full, load_ads, product_facts

log = logging.getLogger("cse")

PROMPT = Path("prompts/11-creator-scripts.md")
CREATORS_KEY = "studio/creators.json"
WINNERS = 5


def studio_creators(storage) -> list[dict]:
    return json.loads(storage.read_text(CREATORS_KEY))["creators"] if storage.exists(CREATORS_KEY) else []


def get_creator(storage, creator_id: str | None) -> dict | None:
    if not creator_id:
        return None
    found = next((c for c in studio_creators(storage) if c.get("id") == creator_id), None)
    if found is None:
        raise ValueError(f"no studio creator {creator_id!r}")
    return found


def brand_winners(storage, slug: str, n: int = WINNERS) -> list[dict]:
    """The brand's own broken-down ads, best grade first (still-running ones before stopped)."""
    if not storage.exists(brandlib.brand_key(slug, "ads.json")):
        return []
    name = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0].get("name") or slug
    ads = [a for a in load_ads(storage, slug) if a.get("breakdown") and not a.get("removed_from_library")]
    own = [a for a in ads if a.get("is_own") or a.get("brand", "").lower() == str(name).lower()]
    pool = own or ads
    pool.sort(key=lambda a: (a.get("score", 0), bool(a.get("is_active")), a.get("days_running", 0)),
              reverse=True)
    return pool[:n]


def already_written(storage, slug: str, creator_id: str | None) -> str:
    lines = []
    for key in sorted(storage.list("studio/scripts/")):
        if not key.endswith(".json"):
            continue
        meta = json.loads(storage.read_text(key))
        if meta.get("brand") != slug or meta.get("creator") != creator_id:
            continue
        md_key = key[:-5] + ".md"
        if storage.exists(md_key):
            for m in re.finditer(r"^#{2,4}\s*Script\s+\d+\s*[:.\-]?\s*(.*)$", storage.read_text(md_key), re.M):
                lines.append(f"- {m.group(1).strip()}")
    return "\n".join(lines) or "(none yet)"


def run_scripts(storage, slug: str, creator_id: str | None, fmt: str = formats.DEFAULT,
                count: int = 3, notes: str = "", today: date | None = None, client=None) -> str | None:
    """Write `count` scripts for one creator and one brand. Returns the saved key, or None when a
    handoff is waiting."""
    today = today or datetime.now(timezone.utc).date()
    fmt = formats.check(fmt)
    count = max(1, min(5, int(count)))
    fields, body = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    who = get_creator(storage, creator_id)
    winners = brand_winners(storage, slug)
    brief_key = brandlib.brand_key(slug, "research-brief.md")
    notes = " ".join(notes.split())[:1000]
    prompt = llm.render(PROMPT.read_text(), {
        "brand_name": fields.get("name") or slug,
        "product_facts": product_facts(fields, body),
        "research_brief": storage.read_text(brief_key) if storage.exists(brief_key)
        else "(No research brief yet: rely on the product facts and the winning ads.)",
        "winning_ads": "\n\n".join(format_full(a, i) for i, a in enumerate(winners, start=1))
        or "(No winning ads pulled yet.)",
        "creator": creatorlib.describe(who),
        "already_written": already_written(storage, slug, creator_id),
        "count": count,
        "format_label": formats.FORMATS[fmt]["label"],
        "format_spec": formats.describe(fmt, fields.get("ad_format") or ""),
        "format_fields": formats.FORMATS[fmt]["fields"],
        "notes": f"\nThe creator's own note: {notes}" if notes else "",
        "date": today.isoformat(),
    })
    tag = hashlib.sha1(f"{slug}|{creator_id}|{fmt}|{count}|{notes}".encode()).hexdigest()[:6]
    stem = f"{today.isoformat()}-{slug}-{creator_id or 'any'}-{tag}"
    try:
        answer = llm.ask(storage, slug, f"scripts-{stem}", prompt, client=client,
                         max_tokens=32000, effort="high")
    except llm.HandoffPending as p:
        log.info("scripts: prompt ready at %s; answer it in %s, then re-run.", p.prompt_key, p.answer_key)
        return None
    key = f"studio/scripts/{stem}.md"
    storage.write_text(key, answer.strip() + "\n")
    storage.write_text(f"studio/scripts/{stem}.json", json.dumps({
        "brand": slug, "creator": creator_id, "format": fmt, "count": count, "notes": notes,
        "ads": [a["ad_id"] for a in winners], "created": today.isoformat(),
    }, indent=2) + "\n")
    log.info("scripts: saved %s", key)
    return key
