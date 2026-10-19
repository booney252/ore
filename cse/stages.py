"""The three outputs, in order:

1. report      -> reports/<date>.md (+ .json with the top ads in rank order)
                  Winning Ads Report: the top winners (videos and statics) broken down line by
                  line or piece by piece, why they work, patterns and gaps. No ideas.
2. iterations  -> iterations/<report>-ads-<ranks>[-format].md
                  The reader picks winning ads from a report and a format (UGC, B-roll, static);
                  each pick becomes an iteration: a UGC script, a B-roll shot list, or a static spec.
3. briefs      -> briefs/<iterations file>-its-<numbers>.md
                  The reader picks iterations; each becomes a full creative brief.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

from . import brand as brandlib
from . import formats, llm

log = logging.getLogger("cse")

PROMPTS = {
    "report": Path("prompts/05-winning-ads-report.md"),
    "iterations": Path("prompts/06-iterations.md"),
    "own_idea": Path("prompts/06-iterations-own-idea.md"),
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


def with_format(ctx: dict, fmt: str) -> dict:
    """Swap in the format the reader chose for this run (UGC, B-roll or static)."""
    fmt = formats.check(fmt)
    return {**ctx, "ad_format": formats.describe(fmt, ctx.get("format_notes", "")),
            "format_fields": formats.FORMATS[fmt]["fields"]}


def product_facts(fields: dict, notes: str) -> str:
    """What the product is and how it works, from brand.md (the founder's own words). Prompts
    treat this as the truth about the product, over the research brief where they differ."""
    lines = [f"- {k}: {fields[k]}" for k in ("name", "website", "product", "offer", "app_store_url")
             if fields.get(k)]
    body = notes.strip()
    return "\n".join(lines) + (f"\n\n{body}" if body else "") or "(not filled in yet)"


def brand_context(storage, slug: str) -> dict:
    fields, notes = {}, ""
    if storage.exists(brandlib.brand_key(slug)):
        fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    return {
        "product_facts": product_facts(fields, notes),
        "brand_name": fields.get("name") or slug,
        "ad_format": fields.get("ad_format") or DEFAULT_AD_FORMAT,
        "format_notes": fields.get("ad_format") or "",
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
    pool.sort(key=lambda a: (a.get("score", 0), a.get("days_running", 0)), reverse=True)
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
        f"- Winner grade: {ad.get('score_why')}",
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
    return (f"- Ad {ad['ad_id']} | {_who(ad)} | {ad.get('score_why')} | "
            f"{b.get('format', ad.get('media_type'))} | hook: {b.get('hook_line', '')[:120]} | "
            f"angle: {b.get('angle', '')[:120]}")


# --- stage 1: the Winning Ads Report --------------------------------------------------

def report_candidates(ads: list[dict]) -> list[str]:
    """Ad IDs to re-check in the Ad Library before the report picks its top list."""
    return [a["ad_id"] for a in ranked(ads)[:CANDIDATES]]


def run_report(storage, slug: str, top_n: int = TOP_N, today: date | None = None,
               client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    ctx = brand_context(storage, slug)
    ads = load_ads(storage, slug)
    # Few advertisers (a new category, or a brand with few competitors running ads): let each
    # one fill more of the top list, so the report still has top_n winners to learn from.
    advertisers = len({a.get("brand") for a in ranked(ads, per_brand=None)})
    cap = max(PER_BRAND, -(-top_n // max(1, advertisers)))
    top = ranked(ads, per_brand=cap)[:top_n]
    if not top:
        raise llm.LLMError("no broken-down ads yet: run `ads`, `creative` and `breakdown` first")
    top_ids = {a["ad_id"] for a in top}
    others = [a for a in ranked(ads, per_brand=None, include_removed=True)
              if a["ad_id"] not in top_ids]

    prompt = llm.render(PROMPTS["report"].read_text(), {
        **ctx,
        "top_count": len(top),
        "top_ads": "\n\n".join(format_full(a, i + 1) for i, a in enumerate(top)),
        "other_ads": "\n".join(format_line(a) for a in others) or "(none)",
        "date": today.isoformat(),
    })
    try:
        answer = llm.ask(storage, slug, f"report-{today.isoformat()}", prompt, client=client,
                         max_tokens=64000, effort="high")
    except llm.HandoffPending as p:
        log.info("report: prompt ready at %s; answer it in %s, then re-run.",
                 p.prompt_key, p.answer_key)
        return None

    out_key = brandlib.brand_key(slug, f"reports/{today.isoformat()}.md")
    header = (f"# {ctx['brand_name']} Winning Ads Report, {today.isoformat()}\n\n"
              f"_Top {len(top)} of {len(ads)} ads pulled._\n\n")
    storage.write_text(out_key, header + answer.strip() + "\n")
    # The ranks the report uses, so iterations can map "#3" back to an ad.
    storage.write_text(out_key[:-3] + ".json", json.dumps({
        "top": [{"rank": i + 1, "ad_id": a["ad_id"], "brand": a.get("brand")}
                for i, a in enumerate(top)]}, indent=2) + "\n")
    log.info("report: saved %s", out_key)
    return out_key


def latest_key(storage, slug: str, folder: str) -> str:
    keys = sorted(k for k in storage.list(brandlib.brand_key(slug, f"{folder}/"))
                  if k.endswith(".md"))
    if not keys:
        raise llm.LLMError(f"nothing in {folder}/ yet")
    return keys[-1]


def sections(md: str, heading: str, numbers: list[int], hashes: str = "{2,4}") -> dict[int, str]:
    r"""Pull numbered sections out of a document, e.g. heading=r"Iteration\s+(\d+)\b" for
    "### Iteration 3: ..." or r"(\d+)\." for a report's "#### 3. Advertiser: ...".
    A section runs to the next heading of the same or a higher level. `hashes` limits which
    heading levels count (a report's ads are always "####", its own sections "###")."""
    found = {}
    pattern = re.compile(rf"^(#{hashes})\s*{heading}.*$", re.M)
    for m in pattern.finditer(md):
        n = int(m.group(2))
        if n not in numbers or n in found:
            continue
        level = len(m.group(1))
        nxt = re.search(rf"^#{{1,{level}}}\s", md[m.end():], re.M)
        end = m.end() + nxt.start() if nxt else len(md)
        found[n] = md[m.start():end].strip()
    return found


# --- stage 2: iterations from chosen winners -------------------------------------------

def already_made(storage, slug: str, skip: str | None = None) -> str:
    """What the brand's earlier iterations already used: name, opening line and angle of each,
    so a new iteration can take a different angle instead of repeating one."""
    lines = []
    for key in sorted(storage.list(brandlib.brand_key(slug, "iterations/"))):
        if not key.endswith(".md") or (skip and key.endswith(f"/{skip}.md")):
            continue
        md = storage.read_text(key)
        heads = list(re.finditer(r"^#{2,4}\s*Iteration\s+\d+\s*[:.\-]?\s*(.*)$", md, re.M))
        for i, m in enumerate(heads):
            part = md[m.end():heads[i + 1].start() if i + 1 < len(heads) else len(md)]
            row = re.search(r"^\|\s*0[^|]*\|\s*([^|]+)\|", part, re.M)
            why = re.search(r"\*\*Why it should work for us:\*\*\s*(.+)", part)
            if not why:  # some files put it in sub-bullets
                why = re.search(r"\*\*Segment:\*\*\s*(.+)", part)
            lines.append(f"- {m.group(1).strip()} ({Path(key).stem})"
                         + (f"\n  Opens: {row.group(1).strip()[:200]}" if row else "")
                         + (f"\n  Angle: {why.group(1).strip()[:300]}" if why else ""))
    return "\n".join(lines) or "(none yet)"


def run_iterations(storage, slug: str, report_key: str | None, ranks: list[int],
                   fmt: str = formats.DEFAULT, per_ad: int = 1, today: date | None = None,
                   client=None, idea: str | None = None) -> str | None:
    """Turn the report's winners #<ranks> into iterations for the brand, in the chosen format.

    With `idea`, the reader's own idea leads instead: `per_ad` iterations of it, built from the
    whole report and research brief, with any picked winners used as extra inspiration."""
    today = today or datetime.now(timezone.utc).date()
    fmt = formats.check(fmt)
    idea = (idea or "").strip()
    if not ranks and not idea:
        raise llm.LLMError("pick at least one winner or write your own idea")
    report_key = report_key or latest_key(storage, slug, "reports")
    report_md = storage.read_text(report_key)
    index_key = report_key[:-3] + ".json"
    if not storage.exists(index_key):
        raise llm.LLMError(f"{report_key} has no ranked ad list (re-run the report)")
    by_rank = {t["rank"]: t["ad_id"] for t in json.loads(storage.read_text(index_key))["top"]}
    missing = [r for r in ranks if r not in by_rank]
    if missing:
        raise llm.LLMError(f"{report_key} has no ad(s) ranked {missing}")

    ads = {a["ad_id"]: a for a in load_ads(storage, slug)}
    ctx = with_format(brand_context(storage, slug), fmt)
    ctx["already_made"] = already_made(storage, slug)
    source_ads = "\n\n".join(format_full(ads[by_rank[r]], r) for r in ranks
                              if by_rank[r] in ads)
    picks = f"-ads-{'-'.join(map(str, ranks))}" if ranks else ""
    if idea:
        prompt = llm.render(PROMPTS["own_idea"].read_text(), {
            **ctx,
            "idea": idea,
            "total": per_ad,
            "report": report_md,
            "source_ads": source_ads or "(none picked)",
            "date": today.isoformat(),
        })
        tag = hashlib.sha1(idea.encode()).hexdigest()[:6]
        stem = f"{Path(report_key).stem}-idea-{tag}{picks}{f'-x{per_ad}' if per_ad > 1 else ''}"
    else:
        diagnosis = sections(report_md, r"(\d+)\.", ranks, hashes="{4}")
        prompt = llm.render(PROMPTS["iterations"].read_text(), {
            **ctx,
            "per_ad": per_ad,
            "total": per_ad * len(ranks),
            "report_sections": "\n\n".join(diagnosis.get(r, f"(ad #{r}: no section found)")
                                            for r in ranks),
            "source_ads": source_ads,
            "date": today.isoformat(),
        })
        stem = f"{Path(report_key).stem}{picks}{f'-x{per_ad}' if per_ad > 1 else ''}"
    stem += formats.suffix(fmt)
    try:
        answer = llm.ask(storage, slug, f"iterations-{stem}", prompt, client=client,
                         max_tokens=64000, effort="high")
    except llm.HandoffPending as p:
        log.info("iterations: prompt ready at %s; answer it in %s, then re-run.",
                 p.prompt_key, p.answer_key)
        return None

    out_key = brandlib.brand_key(slug, f"iterations/{stem}.md")
    source = (f"winners #{', #'.join(map(str, ranks))} of " if ranks else "") + \
        f"the Winning Ads Report of {Path(report_key).stem}"
    header = f"# {ctx['brand_name']} iterations: {formats.FORMATS[fmt]['label']}\n\n"
    if idea:
        header += "**Your idea:** " + " ".join(idea.split()) + f"\n\n_Built with {source}._\n\n"
    else:
        header += f"_From {source}._\n\n"
    storage.write_text(out_key, header + answer.strip() + "\n")
    log.info("iterations: saved %s", out_key)
    return out_key


# --- stage 3: creative briefs from chosen iterations -----------------------------------

def format_of(file_stem: str) -> str:
    """The format an iterations file was written in, from its name (no suffix = UGC)."""
    m = re.search(r"-(broll|static)$", file_stem)
    return m.group(1) if m else formats.DEFAULT


def run_briefs(storage, slug: str, iterations_key: str, numbers: list[int],
               today: date | None = None, client=None) -> str | None:
    """Briefs for iterations from one iterations file."""
    return run_brief_picks(storage, slug, [(iterations_key, n) for n in numbers],
                           today=today, client=client)


def run_brief_picks(storage, slug: str, picks: list[tuple[str, int]],
                    today: date | None = None, client=None) -> str | None:
    """One creative brief doc for iterations picked from any iterations files, in any mix of
    formats: each brief is written in its own iteration's format."""
    today = today or datetime.now(timezone.utc).date()
    if not picks:
        raise llm.LLMError("pick at least one iteration")
    chosen: list[tuple[str, int, str, str]] = []  # (file stem, number, format, text)
    for key in dict.fromkeys(k for k, _ in picks):
        numbers = [n for k, n in picks if k == key]
        found = sections(storage.read_text(key), r"Iteration\s+(\d+)\b", numbers)
        missing = [n for n in numbers if n not in found]
        if missing:
            raise llm.LLMError(f"{key} has no iteration number(s) {missing}")
        stem = Path(key).stem
        chosen += [(stem, n, format_of(stem), found[n]) for n in numbers]

    ads = {a["ad_id"]: a for a in load_ads(storage, slug)}
    cited = []
    for *_, text in chosen:
        for ad_id in re.findall(r"\b\d{12,20}\b", text):
            if ad_id in ads and ad_id not in cited:
                cited.append(ad_id)

    used = list(dict.fromkeys(f for _, _, f, _ in chosen))
    ctx = with_format(brand_context(storage, slug), used[0])
    if len(used) > 1:  # mixed formats: describe each, and give each format's fields
        ctx["ad_format"] = "each brief in its own iteration's format: " + "; ".join(
            f"{formats.FORMATS[f]['label']} ({formats.describe(f)})" for f in used)
        ctx["format_fields"] = "\n".join(
            f"- *For a {formats.FORMATS[f]['label']}:*\n"
            + "\n".join("  " + line for line in formats.FORMATS[f]["fields"].splitlines())
            for f in used)
    blocks = [f'<iteration from="{stem}" number="{n}" format="{formats.FORMATS[f]["label"]}">\n'
              f"{text}\n</iteration>" for stem, n, f, text in chosen]
    prompt = llm.render(PROMPTS["briefs"].read_text(), {
        **ctx,
        "total": len(chosen),
        "iterations": "\n\n".join(blocks),
        "source_ads": "\n\n".join(format_full(ads[i]) for i in cited) or "(none found)",
        "date": today.isoformat(),
    })
    stems = list(dict.fromkeys(stem for stem, *_ in chosen))
    if len(stems) == 1:
        out_stem = f"{stems[0]}-its-{'-'.join(str(n) for _, n, _, _ in chosen)}"
    else:
        tag = hashlib.sha1("|".join(f"{st}#{n}" for st, n, _, _ in chosen).encode()).hexdigest()[:6]
        out_stem = f"{today.isoformat()}-picks-{tag}"
    try:
        answer = llm.ask(storage, slug, f"briefs-{out_stem}", prompt, client=client,
                         max_tokens=64000, effort="high")
    except llm.HandoffPending as p:
        log.info("briefs: prompt ready at %s; answer it in %s, then re-run.",
                 p.prompt_key, p.answer_key)
        return None

    out_key = brandlib.brand_key(slug, f"briefs/{out_stem}.md")
    listing = "\n".join(f"{i}. Iteration {n} of {stem} ({formats.FORMATS[f]['label']})"
                         for i, (stem, n, f, _) in enumerate(chosen, start=1))
    header = (f"# {ctx['brand_name']} creative briefs\n\n"
              f"_{len(chosen)} brief{'s' if len(chosen) > 1 else ''}, from:_\n\n{listing}\n\n")
    storage.write_text(out_key, header + answer.strip() + "\n")
    log.info("briefs: saved %s", out_key)
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
