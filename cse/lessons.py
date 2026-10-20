"""Copy lessons: feedback on Ore's copy, turned into rules every writing prompt follows.

Feedback (pasted on a brief, an iteration, a Studio script, or on the brand's Copy lessons page)
is saved as brands/<brand>/feedback/<id>.json. `learn` runs prompts/14-copy-lessons.md, which
folds it into two lists:
  - brand lessons, brands/<brand>/copy-lessons.md: this brand only (the owner's taste, the
    product's real "why", words to use or avoid);
  - craft lessons, workspace/copy-lessons.md: good copy for any brand.
`for_prompt` puts both in front of the writer in every report, iteration, brief and Studio prompt.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import llm

log = logging.getLogger("cse")

PROMPT = Path("prompts/14-copy-lessons.md")
CRAFT_KEY = "workspace/copy-lessons.md"
ID_RE = re.compile(r"^[0-9]{14}-[a-z0-9]{4,8}$")
COPY_LIMIT = 30000


def brand_key(slug: str) -> str:
    return brandlib.brand_key(slug, "copy-lessons.md")


def feedback_key(slug: str, fid: str) -> str:
    if not ID_RE.match(fid):
        raise ValueError(f"bad feedback id {fid!r}")
    return brandlib.brand_key(slug, f"feedback/{fid}.json")


def _read(storage, key: str) -> str:
    return storage.read_text(key).strip() if storage.exists(key) else ""


def for_prompt(storage, slug: str) -> str:
    """The lessons block for a writing prompt, or "" when nothing's been learned yet."""
    brand, craft = _read(storage, brand_key(slug)), _read(storage, CRAFT_KEY)
    if not brand and not craft:
        return ""
    parts = ["## Copy lessons (learned from feedback on earlier copy; follow them)",
             "These come from real feedback on what Ore wrote before. Treat them as rules. "
             "A rule marked (decide) is a recommendation a person hasn't confirmed yet."]
    if brand:
        parts.append(f"### For this brand\n\n{brand}")
    if craft:
        parts.append(f"### Craft (any brand)\n\n{craft}")
    return "\n\n".join(parts)


def add_feedback(storage, slug: str, text: str, about: str = "", who: str = "", doc: str = "",
                 copy: str = "") -> dict:
    now = datetime.now(timezone.utc)
    import secrets
    fid = f"{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
    item = {"id": fid, "added": now.isoformat(timespec="seconds"), "who": who, "about": about,
            "doc": doc, "text": text.strip(), "copy": copy, "learned": None}
    storage.write_text(feedback_key(slug, fid), json.dumps(item, indent=2) + "\n")
    return item


def split_lists(answer: str) -> tuple[str, str]:
    """The model's answer -> (brand lessons, craft lessons), each a bullet list."""
    m = re.search(r"##\s*Brand lessons\s*\n(.*?)(?=\n##\s*Craft lessons|\Z)", answer, re.S | re.I)
    c = re.search(r"##\s*Craft lessons\s*\n(.*)", answer, re.S | re.I)
    return (m.group(1).strip() if m else ""), (c.group(1).strip() if c else "")


def _doc_text(storage, slug: str, doc: str) -> str:
    """The copy a piece of feedback is about: "briefs/<file>", "iterations/<file>" or "studio/<id>"."""
    if not doc:
        return ""
    kind, _, name = doc.partition("/")
    if kind in ("briefs", "iterations", "reports") and re.match(r"^[A-Za-z0-9._-]+$", name):
        key = brandlib.brand_key(slug, f"{kind}/{name}.md")
    elif kind == "studio" and re.match(r"^[0-9]{14}-[a-z0-9]{1,12}$", name):
        key = f"studio/sessions/{name}.md"
    else:
        return ""
    return storage.read_text(key) if storage.exists(key) else ""


def learn(storage, slug: str, fid: str, client=None) -> str | None:
    """Fold one piece of feedback into the brand and craft lessons. None while a handoff waits."""
    item = json.loads(storage.read_text(feedback_key(slug, fid)))
    from .stages import product_facts
    fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    copy = item.get("copy") or _doc_text(storage, slug, item.get("doc", ""))
    if len(copy) > COPY_LIMIT:
        copy = copy[:COPY_LIMIT] + "\n[... cut for length]"
    tag = f"{item.get('who') or 'feedback'}, {item['added'][:10]}"
    prompt = llm.render(PROMPT.read_text(), {
        "brand_name": fields.get("name") or slug,
        "who": item.get("who") or "(not given)",
        "about": item.get("about") or item.get("doc") or "(not given)",
        "feedback": item["text"],
        "copy": copy or "(not attached)",
        "product_facts": product_facts(fields, notes),
        "brand_lessons": _read(storage, brand_key(slug)) or "(none yet)",
        "craft_lessons": _read(storage, CRAFT_KEY) or "(none yet)",
        "source_tag": tag,
    })
    try:
        answer = llm.ask(storage, slug, f"lessons-{fid}", prompt, client=client, max_tokens=16000,
                         effort="high")
    except llm.HandoffPending as p:
        log.info("lessons: answer %s, then re-run.", p.prompt_key)
        return None
    brand, craft = split_lists(answer)
    if not brand and not craft:
        raise llm.LLMError("lessons: the answer had no Brand lessons / Craft lessons sections")
    if brand:
        storage.write_text(brand_key(slug), brand + "\n")
    if craft:
        storage.write_text(CRAFT_KEY, craft + "\n")
    item["learned"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    storage.write_text(feedback_key(slug, fid), json.dumps(item, indent=2) + "\n")
    log.info("lessons: %s folded into %s lessons and craft lessons", fid, slug)
    return brand_key(slug)
