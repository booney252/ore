"""The three outputs, in order:

1. report   -> brands/<brand>/reports/<date>.md   Winning Ads Report: top 10 winners broken
                                                  down line by line, patterns, why they work,
                                                  and N iteration ideas (N asked at run time)
2. scripts  -> brands/<brand>/scripts/<date>-ideas-<n>.md   full scripts for chosen ideas
3. briefs   -> brands/<brand>/briefs/<date>-ideas-<n>.md    full creative strategy briefs

Scripts and briefs read the ideas straight out of a report, by number.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import llm

log = logging.getLogger("cse")

PROMPTS = {
    "report": Path("prompts/05-winning-ads-report.md"),
    "scripts": Path("prompts/06-scripts.md"),
    "briefs": Path("prompts/07-creative-briefs.md"),
}
KNOWLEDGE_DIR = Path("knowledge")
TOP_N = 10
PER_BRAND = 3          # at most this many of one advertiser in the top list
CANDIDATES = 20        # how many to re-check in the Ad Library before picking the top
DEFAULT_AD_FORMAT = ("UGC: a real creator talking to camera, shot on a phone, "
                     "20-60s full video with a word-for-word script")


# --- shared context ------------------------------------------------------------------

def load_knowledge(folder: Path = KNOWLEDGE_DIR) -> str:
    parts = []
    for path in sorted(folder.glob("*.md")):
        text = path.read_text().strip()
        # Skip files that are still just a template heading + comment.
        body = "\n".join(l for l in text.splitlines()
                         if l.strip() and not l.startswith("#") and not l.strip().startswith("<!--"))
        if body.strip():
            parts.append(f"<file name=\"{path.name}\">\n{text}\n</file>")
    return "\n\n".join(parts) or "(none yet)"


def brand_context(storage, slug: str) -> dict:
    fields = {}
    if storage.exists(brandlib.brand_key(slug)):
        fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    return {
        "brand_name": fields.get("name") or slug,
        "ad_format": fields.get("ad_format") or DEFAULT_AD_FORMAT,
        "research_brief": storage.read_text(brandlib.brand_key(slug, "research-brief.md")),
        "knowledge": load_knowledge(),
    }


def load_ads(storage, slug: str) -> list[dict]:
    return list(json.loads(storage.read_text(brandlib.brand_key(slug, "ads.json")))["ads"].values())


# --- picking and formatting ads --------------------------------------------------------

def ranked(ads: list[dict], per_brand: int | None = PER_BRAND,
           include_removed: bool = False) -> list[dict]:
    """Broken-down ads by score, at most `per_brand` per advertiser."""
    pool = [a for a in ads if a.get("breakdown")
            and (include_removed or not a.get("removed_from_library"))]
    pool.sort(key=lambda a: a.get("score", 0), reverse=True)
    if not per_brand:
        return pool
    counts: dict[str, int] = {}
    out = []
    for a in pool:
        counts[a.get("brand", "")] = counts.get(a.get("brand", ""), 0) + 1
        if counts[a.get("brand", "")] <= per_brand:
            out.append(a)
    return out


def _who(ad: dict) -> str:
    return "OWN AD" if ad.get("is_own") else f"{ad.get('brand')} ({ad.get('ring')})"


def _link(ad: dict) -> str:
    if ad.get("removed_from_library"):
        return f"REMOVED from the Ad Library on {ad['removed_from_library']} (don't link it)"
    return ad.get("ad_library_url") or ""


def format_full(ad: dict, rank: int | None = None) -> str:
    """Everything we know about one ad: transcript line by line, text, breakdown."""
    a, b = ad.get("analysis") or {}, ad.get("breakdown") or {}
    lines = [f"[{s['start']:.1f}-{s['end']:.1f}s] {s['text']}" for s in a.get("transcript", [])]
    title = f"### {'#' + str(rank) + ' | ' if rank else ''}Ad {ad['ad_id']} | {_who(ad)}"
    return "\n".join([
        title,
        f"- Score {ad.get('score')}/100: {ad.get('score_why')}",
        f"- Link: {_link(ad)}",
        f"- {ad.get('media_type')}, {a.get('length_s', 0)}s, {a.get('cut_count', 0)} cuts "
        f"({a.get('cuts_per_second', 0)}/sec)",
        f"- Headline: {ad.get('headline') or '(none)'} | CTA button: {ad.get('cta') or '(none)'}",
        f"- Primary text: {(ad.get('body') or '').strip()[:700]}",
        "- Transcript:",
        *(f"  {l}" for l in lines or ["(no speech)"]),
        f"- Breakdown (from the video frames): {json.dumps(b, ensure_ascii=False)}",
    ])


def format_line(ad: dict) -> str:
    b = ad.get("breakdown") or {}
    return (f"- Ad {ad['ad_id']} | {_who(ad)} | score {ad.get('score')}: {ad.get('score_why')} | "
            f"{b.get('format', ad.get('media_type'))} | hook: {b.get('hook_line', '')[:120]} | "
            f"angle: {b.get('angle', '')[:120]}")


# --- stage 1: the Winning Ads Report --------------------------------------------------

def report_candidates(ads: list[dict]) -> list[str]:
    """Ad IDs to re-check in the Ad Library before the report picks its top list."""
    return [a["ad_id"] for a in ranked(ads)[:CANDIDATES]]


def run_report(storage, slug: str, idea_count: int, top_n: int = TOP_N,
               today: date | None = None, client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    ctx = brand_context(storage, slug)
    ads = load_ads(storage, slug)
    top = ranked(ads)[:top_n]
    if not top:
        raise llm.LLMError("no broken-down ads yet: run `ads`, `creative` and `breakdown` first")
    top_ids = {a["ad_id"] for a in top}
    others = [a for a in ranked(ads, per_brand=None, include_removed=True)
              if a["ad_id"] not in top_ids]

    prompt = llm.render(PROMPTS["report"].read_text(), {
        **ctx,
        "top_count": len(top),
        "idea_count": idea_count,
        "top_ads": "\n\n".join(format_full(a, i + 1) for i, a in enumerate(top)),
        "other_ads": "\n".join(format_line(a) for a in others) or "(none)",
        "date": today.isoformat(),
    })
    step = f"report-{today.isoformat()}-{idea_count}ideas"
    try:
        answer = llm.ask(storage, slug, step, prompt, client=client, max_tokens=64000,
                         effort="high")
    except llm.HandoffPending as p:
        log.info("report: prompt ready at %s; answer it in %s, then re-run.",
                 p.prompt_key, p.answer_key)
        return None

    out_key = brandlib.brand_key(slug, f"reports/{today.isoformat()}.md")
    header = (f"# {ctx['brand_name']} Winning Ads Report, {today.isoformat()}\n\n"
              f"_Top {len(top)} of {len(ads)} ads pulled. {idea_count} iteration ideas._\n\n")
    storage.write_text(out_key, header + answer.strip() + "\n")
    log.info("report: saved %s", out_key)
    return out_key


# --- stages 2 and 3: scripts and briefs from chosen ideas ------------------------------

_IDEA_RE = re.compile(r"^#{2,4}\s*Idea\s+(\d+)\b.*$", re.M)


def extract_ideas(report_md: str, numbers: list[int]) -> dict[int, str]:
    """Pull the 'Idea N' sections out of a report. Missing numbers are left out."""
    heads = list(_IDEA_RE.finditer(report_md))
    found = {}
    for i, m in enumerate(heads):
        n = int(m.group(1))
        if n not in numbers:
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(report_md)
        nxt = re.search(r"^#{1,3}\s", report_md[m.end():end], re.M)  # a later section heading
        if nxt:
            end = m.end() + nxt.start()
        found[n] = report_md[m.start():end].strip()
    return found


def latest_report_key(storage, slug: str) -> str:
    keys = sorted(k for k in storage.list(brandlib.brand_key(slug, "reports/")) if k.endswith(".md"))
    if not keys:
        raise llm.LLMError("no Winning Ads Report yet: run `report` first")
    return keys[-1]


def run_followup(storage, slug: str, kind: str, numbers: list[int], report_key: str | None = None,
                 today: date | None = None, client=None) -> str | None:
    """kind = 'scripts' or 'briefs'."""
    today = today or datetime.now(timezone.utc).date()
    report_key = report_key or latest_report_key(storage, slug)
    report_md = storage.read_text(report_key)
    ideas = extract_ideas(report_md, numbers)
    missing = [n for n in numbers if n not in ideas]
    if missing:
        raise llm.LLMError(f"{report_key} has no idea number(s) {missing}")

    ads = {a["ad_id"]: a for a in load_ads(storage, slug)}
    cited = []
    for text in ideas.values():
        for ad_id in re.findall(r"\b\d{12,20}\b", text):
            if ad_id in ads and ad_id not in cited:
                cited.append(ad_id)

    ctx = brand_context(storage, slug)
    prompt = llm.render(PROMPTS[kind].read_text(), {
        **ctx,
        "ideas": "\n\n".join(ideas[n] for n in numbers),
        "source_ads": "\n\n".join(format_full(ads[i]) for i in cited) or "(none found)",
        "date": today.isoformat(),
    })
    tag = "-".join(str(n) for n in numbers)
    report_date = Path(report_key).stem
    try:
        answer = llm.ask(storage, slug, f"{kind}-{report_date}-ideas-{tag}", prompt,
                         client=client, max_tokens=64000, effort="high")
    except llm.HandoffPending as p:
        log.info("%s: prompt ready at %s; answer it in %s, then re-run.", kind,
                 p.prompt_key, p.answer_key)
        return None

    out_key = brandlib.brand_key(slug, f"{kind}/{report_date}-ideas-{tag}.md")
    title = "Scripts" if kind == "scripts" else "Creative briefs"
    header = (f"# {ctx['brand_name']} {title}: ideas {', '.join(map(str, numbers))}\n\n"
              f"_From the Winning Ads Report of {report_date}._\n\n")
    storage.write_text(out_key, header + answer.strip() + "\n")
    log.info("%s: saved %s", kind, out_key)
    return out_key


def parse_numbers(text: str) -> list[int]:
    """'1,3,5-7' -> [1, 3, 5, 6, 7]"""
    out: list[int] = []
    for part in (p.strip() for p in text.split(",") if p.strip()):
        if "-" in part:
            lo, hi = (int(x) for x in part.split("-", 1))
            out.extend(range(lo, hi + 1))
        else:
            out.append(int(part))
    return sorted(set(out))
