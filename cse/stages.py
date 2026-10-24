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
from . import brain as brainlib
from . import creators as creatorlib
from . import lessons as lessonlib
from . import formats, llm
from .score import strength

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

def load_knowledge(slug: str | None = None, folder: Path = KNOWLEDGE_DIR) -> str:
    """Craft notes for every brand (knowledge/*.md, including copywriting-skills.md) plus this brand's
    own (knowledge/<slug>/*.md). The full book notes in knowledge/books/ are a library the skills
    were built from; they aren't loaded."""
    parts = []
    paths = (sorted(folder.glob("*.md"))
             + (sorted((folder / slug).glob("*.md")) if slug and slug != "books" else []))
    for path in paths:
        if path.name == "README.md":
            continue
        text = path.read_text().strip()
        # Skip files that are still just a template heading + comment.
        body = "\n".join(l for l in text.splitlines()
                         if l.strip() and not l.startswith("#") and not l.strip().startswith("<!--"))
        if body.strip():
            parts.append(f"<file name=\"{path.relative_to(folder)}\">\n{text}\n</file>")
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
    target = str(fields.get("target_awareness") or "").strip()
    if target:  # the brand picked who the copy aims at: open where that viewer is
        body += (f"\n\n## Who the copy aims at: {target}\n\nThe brand targets viewers at the **{target}** "
                 f"stage of awareness. Open where they are (their words for their situation), not with what "
                 f"only a later stage would recognize; bring in the solution and the proof after the hook.")
    return "\n".join(lines) + (f"\n\n{body.strip()}" if body.strip() else "") or "(not filled in yet)"


def brand_context(storage, slug: str) -> dict:
    fields, notes = {}, ""
    if storage.exists(brandlib.brand_key(slug)):
        fields, notes = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))
    facts = product_facts(fields, notes)
    chosen_key = brandlib.brand_key(slug, "unique-mechanisms-chosen.md")
    if storage.exists(chosen_key):  # the mechanisms the user picked: the copy should use them
        facts += ("\n\n## Our unique mechanism (chosen by the brand; use it where it fits)\n\n"
                  + storage.read_text(chosen_key).strip())
        ranked_key = brandlib.brand_key(slug, "unique-mechanisms-ranked.md")
        if storage.exists(ranked_key):  # lead with the one the ranking put first
            bottom = storage.read_text(ranked_key).split("## Bottom line", 1)
            if len(bottom) == 2:
                facts += "\n\nWhich to lead with:" + bottom[1].split("\n## ", 1)[0].rstrip()
    return {
        "product_facts": facts,
        "brand_name": fields.get("name") or slug,
        "ad_format": fields.get("ad_format") or DEFAULT_AD_FORMAT,
        "format_notes": fields.get("ad_format") or "",
        "research_brief": brainlib.with_brief(
            storage.read_text(brandlib.brand_key(slug, "research-brief.md")), storage, slug),
        "knowledge": "\n\n".join(x for x in (load_knowledge(slug), lessonlib.for_prompt(storage, slug)) if x),
        "creator": creatorlib.describe(None),
    }


def audience(storage, slug: str, segment: str | None) -> str:
    """The "Who it's for" block for one of brand.md's audience segments ("" for everyone)."""
    if not segment:
        return ""
    return brandlib.segment_block(brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0], segment)


def load_ads(storage, slug: str) -> list[dict]:
    return list(json.loads(storage.read_text(brandlib.brand_key(slug, "ads.json")))["ads"].values())


# --- picking and formatting ads --------------------------------------------------------

def ranked(ads: list[dict], per_brand: int | None = PER_BRAND,
           include_removed: bool = False) -> list[dict]:
    """Broken-down ads by score, at most `per_brand` per advertiser."""
    pool = [a for a in ads if a.get("breakdown")
            and (include_removed or not a.get("removed_from_library"))]
    pool.sort(key=lambda a: (a.get("score", 0), strength(a)), reverse=True)
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
    if ad.get("source") == "organic":
        kind = "OUR AFFILIATE'S POST" if ad.get("is_own") else "NICHE CREATOR'S POST"
        return f"{kind} @{ad.get('handle')} on {ad.get('platform')} (organic)"
    return "OWN AD" if ad.get("is_own") else f"{ad.get('brand')} ({ad.get('ring')})"


def _link(ad: dict) -> str:
    if ad.get("source") == "organic":
        return ad.get("url") or ""
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
        (f"- Views: {ad.get('views', 0):,} (account's usual {ad.get('usual_views', 0):,}), "
         f"{ad.get('likes', 0):,} likes, {ad.get('comments', 0):,} comments | Text on the cover: "
         f"{ad.get('headline') or '(none)'}" if ad.get("source") == "organic" else
         f"- Headline: {ad.get('headline') or '(none)'} | CTA button: {ad.get('cta') or '(none)'}"),
        f"- {'Caption' if ad.get('source') == 'organic' else 'Primary text'}: {(ad.get('body') or '').strip()[:700]}",
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

SEGMENT_MIN = 3  # winners each audience segment gets in the report's top list, if it has them


def balance_segments(top: list[dict], pool: list[dict], segs: list[dict],
                     each: int = SEGMENT_MIN) -> list[dict]:
    """Make room in the top list for every audience segment's best winners (A or B), so a smaller
    segment isn't crowded out by a bigger one; they replace the lowest-ranked posts of segments
    that have more than their share."""
    segs = [s for s in segs if s["handles"]]
    if len(segs) < 2:
        return top
    seg_of = lambda a: next((s["key"] for s in segs if a.get("handle") in s["handles"]), None)
    top = list(top)
    for seg in segs:
        have = [a for a in top if seg_of(a) == seg["key"]]
        extra = [a for a in pool if seg_of(a) == seg["key"] and a not in top and a.get("score", 0) >= 75]
        for add in extra[:max(0, each - len(have))]:
            counts = {s["key"]: sum(1 for a in top if seg_of(a) == s["key"]) for s in segs}
            out = next((a for a in reversed(top) if seg_of(a) != seg["key"]
                        and counts.get(seg_of(a), 0) > each), None)
            if out is None:
                break
            top.remove(out)
            top.append(add)
    return sorted(top, key=lambda a: (a.get("score", 0), strength(a)), reverse=True)


# The report is split into lanes, so one kind of winner can't crowd out the rest:
# (key, title, what it is, how many ads). Each ad appears once; the first FULL_PER_LANE of a
# lane get the full line-by-line breakdown, the rest a short card.
PAID_LANES = [
    ("proven", "Proven winners", "the best long-runners: months of paid spend and still winning", 5),
    ("rising", "Rising now", "new ads (under 30 days) already outlasting how long their brand usually "
               "keeps an ad, or being scaled with 5+ versions: what's working right now", 5),
    ("ugc", "UGC", "creator videos: a person talking to camera", 5),
    ("static", "Statics", "image ads", 5),
    ("lfs", "LFS", "long-form copy: 400+ words of ad text, with any image or video", 4),
    ("broll", "B-roll", "footage, voiceover, screen recordings, slideshows, animation", 3),
]
ORGANIC_LANES = [
    ("breakout", "Breakouts", "the posts that beat their account's usual views the most", 8),
    ("recent", "Recent winners", "A or B posts from the last 30 days: what's working right now", 6),
    ("ugc", "Talking to camera", "a creator talking to camera", 5),
    ("broll", "B-roll and other formats", "footage, voiceover, screen recordings, slideshows", 4),
]
MORE_LANE = ("more", "More winners", "the next best ads, any format")
REPORT_TOTAL = 25
FULL_PER_LANE = 2
LANE_PER_BRAND = 2  # at most this many of one advertiser in one lane
LFS_WORDS = 400


def ad_kind(ad: dict) -> str | None:
    """The ad's pile, same rules as web/lib/ads.ts kind(): LFS (400+ words of ad text), static,
    UGC (a person talking to camera) or B-roll. None for a video not broken down yet."""
    if len((ad.get("body") or "").split()) >= LFS_WORDS:
        return "lfs"
    b = ad.get("breakdown") or {}
    fmt = str(b.get("format") or "").lower()
    if ad.get("media_type") in ("image", "slideshow") or fmt.startswith("static"):
        return "static"
    if not fmt:
        return None
    if re.search(r"ugc|talking.head|selfie|skit|creator|testimonial|interview|podcast", fmt):
        return "ugc"
    if re.search(r"b-roll|broll|voiceover|slideshow|screen recording|animation|montage", fmt):
        return "broll"
    camera = str(b.get("camera") or "").lower()
    creator = str(b.get("creator") or "").lower().strip()
    on_camera = re.search(r"talking.head|selfie|front.facing|to.camera|green.screen|webcam|propped phone", camera)
    return "ugc" if on_camera and not re.match(r"(none|no |n/a|faceless)", creator) else "broll"


def is_organic(ads: list[dict]) -> bool:
    return sum(a.get("source") == "organic" for a in ads) > len(ads) / 2


def in_lane(ad: dict, key: str, unknown_video_ok: bool = False) -> bool:
    if key == "proven":
        return not ad.get("rising")
    if key == "rising":
        return bool(ad.get("rising"))
    if key == "breakout":
        return True
    if key == "recent":
        return (ad.get("days_running") or 0) <= 30 and ad.get("score", 0) >= 75
    if key == "more":
        return True
    kind = ad_kind(ad)
    if kind is None and unknown_video_ok and key in ("ugc", "broll"):
        return True
    return kind == key


def report_formats(fields: dict) -> set[str] | None:
    """brand.md `report_formats` (e.g. "ugc", or "ugc, static"): the only formats the brand's
    report covers. None = all of them."""
    raw = str(fields.get("report_formats") or "").lower()
    keys = {k.strip().replace("-", "") for k in re.split(r"[,\s]+", raw) if k.strip()}
    keys = {"ugc" if k in ("talking", "talkinghead") else k for k in keys}
    return keys or None


def _format_ok(ad: dict, formats: set[str] | None, unknown_ok: bool = False) -> bool:
    if not formats:
        return True
    kind = ad_kind(ad)
    return kind in formats or (kind is None and unknown_ok and bool(formats & {"ugc", "broll"}))


def pick_lanes(ads: list[dict], total: int = REPORT_TOTAL, segs: list[dict] | None = None,
               formats: set[str] | None = None) -> list[dict]:
    """The report's winners, lane by lane: [{"lane", "title", "about", "ad", "full"}].
    With `formats`, only those formats count, and the other format lanes are dropped."""
    lanes = ORGANIC_LANES if is_organic(ads) else PAID_LANES
    if formats:
        lanes = [l for l in lanes if l[0] not in ("ugc", "static", "lfs", "broll") or l[0] in formats]
    pool = [a for a in ranked(ads, per_brand=None) if _format_ok(a, formats)]
    advertisers = max(1, len({a.get("brand") for a in pool}))
    taken: set[str] = set()
    picks: list[dict] = []
    for key, title, about, n in [*lanes, (*MORE_LANE, total)]:
        want = n if key != "more" else total - len(picks)
        if want <= 0:
            continue
        eligible = [a for a in pool if a["ad_id"] not in taken and in_lane(a, key)]
        # Few advertisers (a new category): let each fill more of a lane. The filler lane has no cap.
        cap = len(eligible) if key == "more" else max(LANE_PER_BRAND, -(-want // advertisers))
        chosen, per = [], {}
        for a in eligible:
            if len(chosen) >= want:
                break
            if per.get(a.get("brand"), 0) < cap:
                chosen.append(a)
                per[a.get("brand")] = per.get(a.get("brand"), 0) + 1
        if key == "breakout" and segs:
            chosen = balance_segments(chosen, eligible, segs)
        for i, a in enumerate(chosen):
            taken.add(a["ad_id"])
            picks.append({"lane": key, "title": title, "about": about, "ad": a,
                          "full": i < FULL_PER_LANE and key != "more"})
    return picks


def lane_candidates(ads: list[dict], per_lane: int = 8, formats: set[str] | None = None) -> list[str]:
    """Ads worth transcribing and breaking down before a report, so every lane has winners to
    pick from: the best of each lane by grade, broken down or not (a video's UGC/B-roll lane is
    only known after its breakdown)."""
    lanes = ORGANIC_LANES if is_organic(ads) else PAID_LANES
    if formats:
        lanes = [l for l in lanes if l[0] not in ("ugc", "static", "lfs", "broll") or l[0] in formats]
    pool = sorted((a for a in ads if not a.get("removed_from_library")
                   and (a.get("media_key") or a.get("analysis"))
                   and _format_ok(a, formats, unknown_ok=True)),
                  key=lambda a: (a.get("score", 0), strength(a)), reverse=True)
    out: dict[str, None] = {}
    for key, *_ in lanes:
        per: dict[str, int] = {}
        n = 0
        for a in pool:
            if n >= per_lane:
                break
            if in_lane(a, key, unknown_video_ok=True) and per.get(a.get("brand"), 0) < LANE_PER_BRAND:
                out[a["ad_id"]] = None
                per[a.get("brand")] = per.get(a.get("brand"), 0) + 1
                n += 1
    return list(out)


def report_candidates(ads: list[dict]) -> list[str]:
    """Ad IDs to re-check in the Ad Library before the report picks its winners."""
    picks = [p["ad"] for p in pick_lanes(ads, total=REPORT_TOTAL + 10)]
    return list(dict.fromkeys(a["ad_id"] for a in ranked(ads)[:CANDIDATES] + picks))


def format_lanes(picks: list[dict]) -> str:
    """The report's winners for the prompt, lane by lane, numbered straight through."""
    out, lane = [], None
    for rank, p in enumerate(picks, start=1):
        if p["lane"] != lane:
            lane = p["lane"]
            out.append(f"## Lane: {p['title']} ({p['about']})")
        depth = "FULL breakdown" if p["full"] else "SHORT card"
        out.append(f"Depth: {depth}\n" + format_full(p["ad"], rank))
    return "\n\n".join(out)


def run_report(storage, slug: str, top_n: int = REPORT_TOTAL, today: date | None = None,
               client=None) -> str | None:
    today = today or datetime.now(timezone.utc).date()
    ctx = brand_context(storage, slug)
    ads = load_ads(storage, slug)
    fields = brandlib.parse(storage.read_text(brandlib.brand_key(slug)))[0]
    picks = pick_lanes(ads, total=top_n, segs=brandlib.segments(fields), formats=report_formats(fields))
    if not picks:
        raise llm.LLMError("no broken-down ads yet: run `ads`, `creative` and `breakdown` first")
    top_ids = {p["ad"]["ad_id"] for p in picks}
    others = [a for a in ranked(ads, per_brand=None, include_removed=True)
              if a["ad_id"] not in top_ids]
    lanes = list(dict.fromkeys(p["title"] for p in picks))

    prompt = llm.render(PROMPTS["report"].read_text(), {
        **ctx,
        "top_count": len(picks),
        "lane_list": ", ".join(lanes),
        "top_ads": format_lanes(picks),
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
              f"_{len(picks)} winners in {len(lanes)} sections ({', '.join(lanes)}), "
              f"from {len(ads)} ads pulled._\n\n")
    storage.write_text(out_key, header + answer.strip() + "\n")
    # The ranks the report uses, so iterations can map "#3" back to an ad, grouped by lane.
    storage.write_text(out_key[:-3] + ".json", json.dumps({
        "top": [{"rank": i + 1, "ad_id": p["ad"]["ad_id"], "brand": p["ad"].get("brand"),
                 "lane": p["lane"], "lane_title": p["title"], "full": p["full"]}
                for i, p in enumerate(picks)]}, indent=2) + "\n")
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
                   client=None, idea: str | None = None, creator: str | None = None,
                   segment: str | None = None) -> str | None:
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
    who = creatorlib.get(storage, slug, creator)
    seg = audience(storage, slug, segment)
    ctx["creator"] = creatorlib.describe(who) + seg
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
    stem += (f"-for-{who['id']}" if who else "") + (f"-to-{segment}" if seg else "") + formats.suffix(fmt)
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
    if who:
        header += f"**Written for:** {who['name']}\n\n"
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
    m = re.search(rf"-({'|'.join(f for f in formats.FORMATS if f != formats.DEFAULT)})$", file_stem)
    return m.group(1) if m else formats.DEFAULT


def run_briefs(storage, slug: str, iterations_key: str, numbers: list[int],
               today: date | None = None, client=None) -> str | None:
    """Briefs for iterations from one iterations file."""
    return run_brief_picks(storage, slug, [(iterations_key, n) for n in numbers],
                           today=today, client=client)


def run_brief_picks(storage, slug: str, picks: list[tuple[str, int]],
                    today: date | None = None, client=None, creator: str | None = None,
                    segment: str | None = None) -> str | None:
    """One creative brief doc for iterations picked from any iterations files, in any mix of
    formats: each brief is written in its own iteration's format."""
    today = today or datetime.now(timezone.utc).date()
    if not picks:
        raise llm.LLMError("pick at least one iteration")
    chosen: list[tuple[str, int, str, str]] = []  # (file stem, number, format, text)
    for key in dict.fromkeys(k for k, _ in picks):
        numbers = [n for k, n in picks if k == key]
        found = sections(storage.read_text(key), r"Iteration\s+(\d+)\b", numbers, hashes="{1,4}")
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
    who = creatorlib.get(storage, slug, creator)
    seg = audience(storage, slug, segment)
    ctx["creator"] = creatorlib.describe(who) + seg
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
    if who:
        out_stem += f"-for-{who['id']}"
    if seg:
        out_stem += f"-to-{segment}"
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
              f"_{len(chosen)} brief{'s' if len(chosen) > 1 else ''}, from:_\n\n{listing}\n\n"
              + (f"**Written for:** {who['name']}\n\n" if who else ""))
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
