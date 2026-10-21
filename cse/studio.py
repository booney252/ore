"""Creator Studio: a creator makes ads for a brand, step by step.

The creator-facing side of Ore (e.g. a Trybe creator making paid ads for a brand). The creator
fills in their profile once (studio/me.json). Then each piece of work is a session
(studio/sessions/<id>.json), made on the site:

1. pick a brand (one with `studio: true` in brand.md) and a winning ad to build from, or let Ore pick
2. `run_angles`: Ore suggests angles that fit the creator (prompts/12-studio-angles.md)
3. the creator picks angles, a format, a length and how many
4. `run_scripts`: ready-to-film scripts for each picked angle (prompts/11-creator-scripts.md)
5. `run_tweak`: "more like this", "new hooks" or "shorter" on one script (prompts/13-studio-tweak.md)

Scripts are saved to studio/sessions/<id>.md.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brain as brainlib
from . import brand as brandlib
from . import creators as creatorlib
from . import formats, llm
from . import lessons as lessonlib
from .score import strength
from .stages import format_full, load_ads, product_facts

log = logging.getLogger("cse")

ANGLES_PROMPT = Path("prompts/12-studio-angles.md")
SCRIPTS_PROMPT = Path("prompts/11-creator-scripts.md")
TWEAK_PROMPT = Path("prompts/13-studio-tweak.md")
ME_KEY = "studio/me.json"
OLD_CREATORS_KEY = "studio/creators.json"
SESSION_RE = re.compile(r"^[0-9]{14}-[a-z0-9]{1,12}$")
WINNERS = 5
ANGLES = 5
TWEAKS = {
    "more": "Write a new script on the same angle: a different hook, a different first frame and a "
            "fresh way into the same idea. Don't reuse lines from the original.",
    "hooks": "Keep the script, but write 3 brand-new hook options (first line + first frame) that "
             "are stronger and more scroll-stopping than the current ones, and use the best one as "
             "the script's opening.",
    "shorter": "Cut it to about half the length. Keep the hook, the product moment and the CTA; "
               "drop everything that isn't pulling its weight.",
}
TWEAK_LABEL = {"more": "another take", "hooks": "new hooks", "shorter": "shorter"}


def me(storage) -> dict | None:
    """The creator using the Studio (their profile, filled in once)."""
    if storage.exists(ME_KEY):
        return json.loads(storage.read_text(ME_KEY))
    if storage.exists(OLD_CREATORS_KEY):  # profiles made before the Studio had a single "me"
        found = json.loads(storage.read_text(OLD_CREATORS_KEY))["creators"]
        return found[0] if found else None
    return None


def session_key(session_id: str, ext: str = "json") -> str:
    if not SESSION_RE.match(session_id):
        raise ValueError(f"bad session id {session_id!r}")
    return f"studio/sessions/{session_id}.{ext}"


def load_session(storage, session_id: str) -> dict:
    return json.loads(storage.read_text(session_key(session_id)))


def save_session(storage, session: dict) -> None:
    storage.write_text(session_key(session["id"]), json.dumps(session, indent=2) + "\n")


def brand_winners(storage, slug: str, n: int = WINNERS) -> list[dict]:
    """The brand's own broken-down ads, best grade first (still-running ones before stopped)."""
    if not storage.exists(brandlib.brand_key(slug, "ads.json")):
        return []
    name = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0].get("name") or slug
    ads = [a for a in load_ads(storage, slug) if a.get("breakdown") and not a.get("removed_from_library")]
    # the brand's own ads, plus organic posts from its niche (for an organic offer they're the playbook)
    own = [a for a in ads if a.get("is_own") or a.get("source") == "organic"
           or a.get("brand", "").lower() == str(name).lower()]
    pool = own or ads
    pool.sort(key=lambda a: (a.get("score", 0), bool(a.get("is_active")), strength(a)),
              reverse=True)
    return pool[:n]


def _context(storage, slug: str) -> tuple[dict, str, str]:
    fields, body = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    brief_key = brandlib.brand_key(slug, "research-brief.md")
    brief = (storage.read_text(brief_key) if storage.exists(brief_key)
             else "(No research brief yet: rely on the product facts and the winning ads.)")
    return fields, product_facts(fields, body), brainlib.with_brief(brief, storage, slug)


def _winners_for(storage, session: dict) -> tuple[list[dict], str]:
    winners = brand_winners(storage, session["brand"])
    picked = session.get("ad_id")
    if picked:
        ads = {a["ad_id"]: a for a in load_ads(storage, session["brand"])}
        if picked in ads:
            rest = [a for a in winners if a["ad_id"] != picked][:2]
            return [ads[picked], *rest], (f"The creator picked ad {picked} to build from: build every "
                                          "angle on it. The others are context.")
    return winners, "The creator let you pick: build from whichever of these fits each angle best."


def already_made(storage, slug: str) -> str:
    lines = []
    for key in sorted(storage.list("studio/sessions/")):
        if not key.endswith(".md"):
            continue
        meta_key = key[:-3] + ".json"
        if storage.exists(meta_key) and json.loads(storage.read_text(meta_key)).get("brand") == slug:
            lines += [f"- {m.group(1).strip()}" for m in
                      re.finditer(r"^#{2,4}\s*Script\s+[\d.]+\s*[:.\-]?\s*(.*)$", storage.read_text(key), re.M)]
    return "\n".join(lines) or "(none yet)"


def parse_angles(md: str) -> list[dict]:
    heads = list(re.finditer(r"^#{2,4}\s*Angle\s+(\d+)\s*[:.\-]?\s*(.+)$", md, re.M))
    return [{"n": int(m.group(1)), "title": m.group(2).strip(),
             "body": md[m.end():heads[i + 1].start() if i + 1 < len(heads) else len(md)].strip()}
            for i, m in enumerate(heads)]


def run_angles(storage, session_id: str, today: date | None = None, client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    session = load_session(storage, session_id)
    fields, facts, brief = _context(storage, session["brand"])
    winners, note = _winners_for(storage, session)
    prompt = llm.render(ANGLES_PROMPT.read_text(), {
        "brand_name": fields.get("name") or session["brand"],
        "product_facts": facts,
        "research_brief": brief,
        "winner_note": note,
        "winning_ads": "\n\n".join(format_full(a, i) for i, a in enumerate(winners, start=1))
        or "(No winning ads pulled yet.)",
        "creator": creatorlib.describe(me(storage)) + brandlib.segment_block(fields, session.get("segment")),
        "copy_lessons": lessonlib.for_prompt(storage, session["brand"]),
        "already_made": already_made(storage, session["brand"]),
        "count": ANGLES,
        "date": today.isoformat(),
    })
    try:
        answer = llm.ask(storage, session["brand"], f"studio-{session_id}-angles", prompt,
                         client=client, max_tokens=16000, effort="high")
    except llm.HandoffPending as p:
        log.info("studio: answer %s, then re-run.", p.prompt_key)
        return None
    session["angles"] = parse_angles(answer)
    session["ads"] = [a["ad_id"] for a in winners]
    session["status"] = "angles"
    save_session(storage, session)
    log.info("studio: %d angles for %s", len(session["angles"]), session_id)
    return session_key(session_id)


def run_scripts(storage, session_id: str, today: date | None = None, client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    session = load_session(storage, session_id)
    picked = [a for a in session.get("angles", []) if a["n"] in session.get("picked", [])]
    if not picked:
        raise llm.LLMError("pick at least one angle")
    fmt = formats.check(session.get("format"))
    fields, facts, brief = _context(storage, session["brand"])
    winners, _ = _winners_for(storage, session)
    prompt = llm.render(SCRIPTS_PROMPT.read_text(), {
        "brand_name": fields.get("name") or session["brand"],
        "product_facts": facts,
        "research_brief": brief,
        "winning_ads": "\n\n".join(format_full(a, i) for i, a in enumerate(winners, start=1))
        or "(No winning ads pulled yet.)",
        "creator": creatorlib.describe(me(storage)) + brandlib.segment_block(fields, session.get("segment")),
        "copy_lessons": lessonlib.for_prompt(storage, session["brand"]),
        "angles": "\n\n".join(f"### Angle {a['n']}: {a['title']}\n{a['body']}" for a in picked),
        "count": max(1, min(3, int(session.get("per_angle") or 1))),
        "format_label": formats.FORMATS[fmt]["label"],
        "format_spec": formats.describe(fmt, fields.get("ad_format") or ""),
        "format_fields": formats.FORMATS[fmt]["fields"],
        "length": session.get("length") or "30s",
        "notes": f"\nThe creator's own note: {session['notes']}" if session.get("notes") else "",
        # brand.md `caption_disclosure: false` turns off the default #ad line in captions
        "caption_rule": ("short" if str(fields.get("caption_disclosure", "")).lower() == "false"
                         else "short, with the disclosure the platform needs (e.g. #ad)"),
        "date": today.isoformat(),
    })
    try:
        answer = llm.ask(storage, session["brand"], f"studio-{session_id}-scripts", prompt,
                         client=client, max_tokens=32000, effort="high")
    except llm.HandoffPending as p:
        log.info("studio: answer %s, then re-run.", p.prompt_key)
        return None
    storage.write_text(session_key(session_id, "md"), answer.strip() + "\n")
    session["status"] = "scripts"
    save_session(storage, session)
    log.info("studio: scripts saved for %s", session_id)
    return session_key(session_id, "md")


def script_section(md: str, number: str) -> str | None:
    heads = list(re.finditer(r"^#{2,4}\s*Script\s+([\d.]+)\b.*$", md, re.M))
    for i, m in enumerate(heads):
        if m.group(1) == number:
            return md[m.start():heads[i + 1].start() if i + 1 < len(heads) else len(md)].strip()
    return None


def run_tweak(storage, session_id: str, number: str, action: str, today: date | None = None,
              client=None) -> str | None:
    if action not in TWEAKS:
        raise ValueError(f"unknown tweak {action!r}")
    session = load_session(storage, session_id)
    md_key = session_key(session_id, "md")
    md = storage.read_text(md_key)
    original = script_section(md, number)
    if original is None:
        raise llm.LLMError(f"no script {number} in {session_id}")
    taken = re.findall(rf"^#{{2,4}}\s*Script\s+{re.escape(number)}\.(\d+)", md, re.M)
    new_number = f"{number}.{max(map(int, taken), default=1) + 1}"
    title = re.sub(r"^#{2,4}\s*Script\s+[\d.]+\s*[:.\-]?\s*", "", original.splitlines()[0])
    title = re.sub(r"\s*\((another take|new hooks|shorter)\)$", "", title)
    heading = f"Script {new_number}: {title} ({TWEAK_LABEL[action]})"
    fields, facts, _ = _context(storage, session["brand"])
    prompt = llm.render(TWEAK_PROMPT.read_text(), {
        "brand_name": fields.get("name") or session["brand"],
        "script": original,
        "instruction": TWEAKS[action],
        "creator": creatorlib.describe(me(storage)) + brandlib.segment_block(fields, session.get("segment")),
        "copy_lessons": lessonlib.for_prompt(storage, session["brand"]),
        "product_facts": facts,
        "heading": heading,
    })
    try:
        answer = llm.ask(storage, session["brand"], f"studio-{session_id}-{number}-{action}-{new_number}",
                         prompt, client=client, max_tokens=16000, effort="high")
    except llm.HandoffPending as p:
        log.info("studio: answer %s, then re-run.", p.prompt_key)
        return None
    body = answer.strip()
    if not re.match(r"^#{2,4}\s*Script", body):
        body = f"### {heading}\n\n{body}"
    # put the new version right after the script (and any earlier versions of it)
    after = original
    for later in re.finditer(rf"^#{{2,4}}\s*Script\s+{re.escape(number)}\.\d+\b.*$", md, re.M):
        section = script_section(md, re.search(r"Script\s+([\d.]+)", later.group(0)).group(1))
        if section:
            after = section
    pos = md.index(after) + len(after)
    storage.write_text(md_key, md[:pos].rstrip() + "\n\n" + body + "\n\n" + md[pos:].lstrip())
    log.info("studio: %s on script %s of %s", action, number, session_id)
    return md_key
