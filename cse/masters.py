"""Master scripts: review an idea once, then Ore makes each creator's version from it.

A master is one UGC script, written in first person for a generic creator, that the brand reviews
and approves. Each creator assigned to it gets a version made from the master: the problem, the
explanation and the product payoff stay word for word; only who they are, their personal details
and the text hook change. Feedback goes on the master, and the versions are rebuilt from it.

brands/<brand>/masters/<id>.json
  {id, title, idea, md, rev, status: draft|approved, changes: [..], creators: [ids],
   versions: {<creator id>: {md, changes: [..], rev, status: ready|approved}}, created_at, updated_at}

Approving a version (on the website) writes iterations/<date>-m-<id>-for-<creator>.md, which is
what the creator portal and the brief codes read.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import creators as creatorlib
from . import llm, stages

log = logging.getLogger("cse")

PROMPTS = {
    "revise": Path("prompts/17-master-revise.md"),
    "version": Path("prompts/18-creator-version.md"),
    "assign": Path("prompts/19-assign-creators.md"),
}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def key(slug: str, mid: str) -> str:
    if not ID_RE.match(mid):
        raise ValueError(f"bad master id {mid!r}")
    return brandlib.brand_key(slug, f"masters/{mid}.json")


def load(storage, slug: str, mid: str) -> dict:
    return json.loads(storage.read_text(key(slug, mid)))


def save(storage, slug: str, m: dict) -> None:
    m["updated_at"] = _now()
    storage.write_text(key(slug, m["id"]), json.dumps(m, indent=2, ensure_ascii=False))


def list_ids(storage, slug: str) -> list[str]:
    prefix = brandlib.brand_key(slug, "masters/")
    return sorted(k[len(prefix):-5] for k in storage.list(prefix) if k.endswith(".json"))


def new_id(title: str, taken: list[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:30] or "idea"
    mid, n = base, 2
    while mid in taken:
        mid, n = f"{base}-{n}", n + 1
    return mid


def split_answer(answer: str) -> tuple[str, list[str]]:
    """'## Script ... ## What I changed ...' -> (script markdown, change bullets)."""
    parts = re.split(r"^##\s+What (?:I )?changed\s*$", answer, maxsplit=1, flags=re.M | re.I)
    script = re.sub(r"^\s*##\s+Script\s*$", "", parts[0], count=1, flags=re.M).strip()
    changes = []
    if len(parts) == 2:
        changes = [re.sub(r"^\s*[-*]\s+", "", l).strip() for l in parts[1].splitlines()
                   if re.match(r"^\s*[-*]\s+", l)]
    if "| They say |" not in script and "|They say|" not in script.replace(" ", ""):
        raise llm.LLMError("the answer has no script table")
    return script, changes


def first_script(md: str) -> tuple[str, str]:
    """The first script in an iterations file: (title, body from its hook to the end of its table)."""
    heads = list(re.finditer(r"^#{2,4}\s*(?:Iteration|Script|Idea)?\s*\d{1,2}\s*[:.\-)]\s*(.+)$", md, re.M))
    if not heads:
        return "Untitled idea", md.strip()
    end = heads[1].start() if len(heads) > 1 else len(md)
    return heads[0].group(1).strip().strip("*"), md[heads[0].end():end].strip().rstrip("-").strip()


# --- jobs ---------------------------------------------------------------------------

def create(storage, slug: str, idea: str, report: str | None = None, ads: list[int] | None = None,
           creators: list[str] | None = None, client=None) -> str | None:
    """Write a new master from an idea (the iterations prompt, no creator), then check it."""
    report_key = brandlib.brand_key(slug, f"reports/{report}.md") if report else None
    its_key = stages.run_iterations(storage, slug, report_key, ads or [], fmt="ugc", per_ad=1,
                                    idea=idea, client=client)
    if its_key is None:
        return None
    title, body = first_script(storage.read_text(its_key))
    storage.delete(its_key)  # the master is the record now; keep the Briefs list clean
    mid = new_id(title, list_ids(storage, slug))
    m = {"id": mid, "title": title, "idea": idea, "md": body, "rev": 1, "status": "draft",
         "changes": [], "creators": [c for c in creators or [] if ID_RE.match(c)], "versions": {},
         "created_at": _now()}
    save(storage, slug, m)
    return revise(storage, slug, mid, client=client)


def revise(storage, slug: str, mid: str, feedback: str = "", client=None) -> str | None:
    """Ore's rules check on the master, plus the brand's feedback if any. Bumps the revision, so
    the creator versions show as out of date."""
    m = load(storage, slug, mid)
    ctx = stages.brand_context(storage, slug)
    prompt = llm.render(PROMPTS["revise"].read_text(), {
        "brand_name": ctx["brand_name"], "product_facts": ctx["product_facts"],
        "knowledge": ctx["knowledge"], "script": m["md"],
        "feedback": feedback.strip() or "(none: just run the rules check)"})
    tag = hashlib.sha1(f"{m['md']}|{feedback}".encode()).hexdigest()[:8]
    try:
        answer = llm.ask(storage, slug, f"master-{mid}-{tag}", prompt, client=client,
                         max_tokens=16000, effort="high")
    except llm.HandoffPending as p:
        log.info("masters: prompt ready at %s; answer it in %s", p.prompt_key, p.answer_key)
        return None
    md, changes = split_answer(answer)
    m = load(storage, slug, mid)  # re-read: the brand may have changed the assignments meanwhile
    m.update(md=md, changes=changes, rev=m.get("rev", 1) + 1, status="draft")
    if feedback.strip():
        m.setdefault("feedback", []).append({"text": feedback.strip(), "at": _now()})
    save(storage, slug, m)
    return key(slug, mid)


def make_versions(storage, slug: str, mid: str, only: list[str] | None = None,
                  client=None) -> str | None:
    """One version per assigned creator (or just `only`), made from the current master."""
    m = load(storage, slug, mid)
    ctx = stages.brand_context(storage, slug)
    targets = [c for c in (only or m.get("creators") or []) if ID_RE.match(c)]
    if not targets:
        raise llm.LLMError("assign at least one creator to this script first")
    waiting = False
    for cid in targets:
        who = creatorlib.get(storage, slug, cid)
        prompt = llm.render(PROMPTS["version"].read_text(), {
            "brand_name": ctx["brand_name"], "creator_name": who.get("name", cid),
            "creator": creatorlib.describe(who), "product_facts": ctx["product_facts"],
            "knowledge": ctx["knowledge"], "script": m["md"]})
        try:
            answer = llm.ask(storage, slug, f"version-{mid}-r{m.get('rev', 1)}-{cid}", prompt,
                             client=client, max_tokens=16000, effort="medium")
        except llm.HandoffPending as p:
            log.info("masters: prompt ready at %s", p.prompt_key)
            waiting = True
            continue
        md, changes = split_answer(answer)
        cur = load(storage, slug, mid)
        cur.setdefault("versions", {})[cid] = {"md": md, "changes": changes,
                                              "rev": m.get("rev", 1), "status": "ready",
                                              "made_at": _now()}
        save(storage, slug, cur)
    return None if waiting else key(slug, mid)


def suggest(storage, slug: str, per_creator: int = 2, client=None) -> str | None:
    """Ore's pick of who films which master; fills each master's creator list."""
    ids = list_ids(storage, slug)
    masters = [load(storage, slug, i) for i in ids]
    roster = creatorlib.load(storage, slug)
    if not masters or not roster:
        raise llm.LLMError("needs at least one script and one creator")
    hook = lambda md: (re.search(r'\*\*Hook:\*\*\s*"?([^"\n]+)', md) or [None, ""])[1]
    prompt = llm.render(PROMPTS["assign"].read_text(), {
        "brand_name": stages.brand_context(storage, slug)["brand_name"],
        "masters": "\n".join(f'- id `{m["id"]}`: {m["title"]}. Hook: "{hook(m["md"])}"'
                             for m in masters),
        "creators": "\n\n".join(f"id `{c['id']}`:\n{creatorlib.describe(c)}" for c in roster),
        "per_creator": per_creator})
    tag = hashlib.sha1("|".join(ids + [c["id"] for c in roster]).encode()).hexdigest()[:8]
    try:
        answer = llm.ask(storage, slug, f"assign-{tag}", prompt, client=client,
                         max_tokens=4000, effort="medium")
    except llm.HandoffPending:
        return None
    picks = llm.parse_json(answer)
    known = {c["id"] for c in roster}
    for m in masters:
        chosen = [c for c in picks.get(m["id"], []) if c in known]
        cur = load(storage, slug, m["id"])
        cur["creators"] = chosen
        save(storage, slug, cur)
    return brandlib.brand_key(slug, "masters/")
