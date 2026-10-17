"""Foundation: the 4 research prompts -> brands/<brand>/research-brief.md, the brand brain.

1. prompts/01-competitors.md    competitor teardown   (may search the web for pricing/size)
2. prompts/02-psychographics.md inside the buyer's head
3. prompts/03-awareness.md      market awareness
4. prompts/04-research-brief.md unified brief from 1-3 + customer quotes

Steps 1-3 read the same data (brand.md fields, competitors.json, ads.json, voc.json), so they
run side by side; step 4 reads their outputs. Each step is saved under research/<date>/.
The model analyzes our data; quotes in the brief that aren't in what we collected get listed
at the end for review.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import llm, voc

log = logging.getLogger("cse")

STEPS = [
    ("01-competitors", Path("prompts/01-competitors.md"), True),
    ("02-psychographics", Path("prompts/02-psychographics.md"), False),
    ("03-awareness", Path("prompts/03-awareness.md"), False),
]
BRIEF = Path("prompts/04-research-brief.md")
ADS_IN_PROMPT = 30


def _list(v) -> str:
    return ", ".join(map(str, v)) if isinstance(v, list) else str(v or "")


def _load(storage, slug: str, name: str, field: str) -> list:
    key = brandlib.brand_key(slug, name)
    if not storage.exists(key):
        return []
    data = json.loads(storage.read_text(key))[field]
    return list(data.values()) if isinstance(data, dict) else data  # ads.json is keyed by ad id


def format_ads(ads: list[dict], limit: int = ADS_IN_PROMPT) -> str:
    """Top ads by winner score, one JSON line each: who, why it scores, and what it says."""
    top = sorted((a for a in ads if not a.get("removed_from_library")),
                 key=lambda a: a.get("score", 0), reverse=True)[:limit]
    lines = []
    for a in top:
        b = a.get("breakdown") or {}
        lines.append(json.dumps({
            "advertiser": a.get("brand"), "own_ad": bool(a.get("is_own")),
            "score": a.get("score"), "why": a.get("score_why"), "link": a.get("ad_library_url"),
            "format": b.get("format") or a.get("media_type"), "hook": b.get("hook_line", ""),
            "angle": b.get("angle", ""), "headline": a.get("headline", ""),
            "copy": (a.get("body") or "")[:400],
            "transcript": ((a.get("analysis") or {}).get("transcript_text") or "")[:500],
        }, ensure_ascii=False))
    return "\n".join(lines) or "(no ads pulled yet)"


def values(storage, slug: str) -> dict:
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    comps = [{k: c.get(k) for k in ("name", "ring", "website", "why")}
             for c in _load(storage, slug, "competitors.json", "competitors")
             if c.get("status") != "removed"]
    out = {f: _list(fields.get(f)) or "not given" for f in brandlib.PROMPT_FIELDS}
    out.update({
        "competitors_json": json.dumps(comps, ensure_ascii=False, indent=1),
        "ads_json": format_ads(_load(storage, slug, "ads.json", "ads")),
        "voc_json": voc.for_prompt(_load(storage, slug, "voc.json", "quotes")),
    })
    if fields.get("health_product"):
        out["product"] += " (a health product: flag every promise for compliance review)"
    return out


_QUOTE = re.compile(r"[\"“]([^\"”\n]{25,400})[\"”]")


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def unverified_quotes(text: str, sources: list[str]) -> list[str]:
    """Quoted passages that appear in none of our collected text (customer quotes, ad copy)."""
    corpus = " | ".join(_norm(s) for s in sources)
    out = []
    for q in _QUOTE.findall(text):
        n = _norm(q.rstrip(".…"))
        if len(n.split()) >= 5 and n not in corpus and q not in out:
            out.append(q)
    return out


def run(storage, slug: str, today: date | None = None, client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    vals = values(storage, slug)
    folder = f"research/{today.isoformat()}"

    outputs, pending = {}, []
    for i, (name, path, web) in enumerate(STEPS, start=1):
        try:
            answer = llm.ask(storage, slug, f"research-{today.isoformat()}-{name}",
                             llm.render(path.read_text(), vals), client=client,
                             max_tokens=32000, effort="high", web=web)
        except llm.HandoffPending as p:
            pending.append(p.prompt_key)
            continue
        outputs[f"step{i}_output"] = answer
        storage.write_text(brandlib.brand_key(slug, f"{folder}/{name}.md"), answer.strip() + "\n")
        log.info("research: step %d (%s) done", i, name)
    if pending:
        log.info("research: answer these, then re-run:\n  %s", "\n  ".join(pending))
        return None

    try:
        brief = llm.ask(storage, slug, f"research-{today.isoformat()}-04-research-brief",
                        llm.render(BRIEF.read_text(), {**vals, **outputs}), client=client,
                        max_tokens=32000, effort="high")
    except llm.HandoffPending as p:
        log.info("research: answer %s, then re-run.", p.prompt_key)
        return None

    quotes = [q["text"] for q in _load(storage, slug, "voc.json", "quotes")]
    ads_text = [f"{a.get('body', '')} {a.get('headline', '')} "
                f"{(a.get('analysis') or {}).get('transcript_text', '')}"
                for a in _load(storage, slug, "ads.json", "ads")]
    flagged = unverified_quotes(brief, quotes + ads_text)
    if flagged:
        brief = brief.rstrip() + "\n\n## Quote check\n\nThese quoted lines weren't found in the " \
            "customer quotes or ads we collected. Verify them or remove them:\n\n" + \
            "\n".join(f"- \"{q}\"" for q in flagged) + "\n"

    key = brandlib.brand_key(slug, "research-brief.md")
    if storage.exists(key):  # keep the old brain before replacing it
        storage.write_text(brandlib.brand_key(slug, f"{folder}/previous-research-brief.md"),
                           storage.read_text(key))
    storage.write_text(brandlib.brand_key(slug, f"{folder}/04-research-brief.md"), brief)
    storage.write_text(key, brief)
    log.info("research: saved %s (%d unverified quotes flagged)", key, len(flagged))
    return key
