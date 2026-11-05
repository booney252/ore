"""Free teardowns: the landing page's lead magnet.

Someone sends their App Store link and email. Ore finds the app's closest competitors, reads each
one's top 10 Meta ads, breaks down the newest ones (the breakouts), and builds a private report
page at /t/<token>. If they add their creators, it also writes a script for each one. Then for
TRACK_DAYS it keeps reading those competitors' top 10s every day and emails them when a new ad
breaks in.

Each app is a hidden brand, `td-<App Store id>` (left out of the brand list), so the existing
pipeline does the work (find_page, tracking, creative, breakdown) and a second request for the
same app reuses everything already pulled. Reports live at teardowns/<token>.json; the request
itself at leads/<id>.json.

Costs are capped: at most DAILY_CAP new reports a day (the rest wait for tomorrow), at most
3 breakdowns per report and 2 new breakouts per app per day, and no Claude work at all once this
month's teardown spend passes MONTHLY_CAP dollars (reports pause and the owner is told).
"""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone

import yaml

from . import ads as adslib
from . import brand as brandlib
from . import breakdown, creative, llm, mailer, tracking, usage
from .stages import load_knowledge

log = logging.getLogger("cse")

TRACK_DAYS = 3
PICKS = 3              # breakdowns in a new report
DAILY_NEW = 2          # new breakouts broken down per app per day while tracking
MAX_COMPETITORS = 5    # competitors with an Ad Library page to watch
DAILY_CAP = int(os.environ.get("TEARDOWN_DAILY_CAP") or 20)
MONTHLY_CAP = float(os.environ.get("TEARDOWN_MONTHLY_CAP") or 100)
SITE = os.environ.get("ORE_SITE_URL", "https://ore-web-eight.vercel.app").rstrip("/")

COMPETITOR_PROMPT = """Find the apps that compete most directly with this app in the US: the same job \
for the same buyer, the ones a person choosing {name} would compare it against. Prefer apps that \
advertise on Facebook and Instagram. Give 7, most direct first, each with its website.

App: {name} ({genre}), by {seller}
App Store: {url}
What it does: {description}
"""
COMPETITOR_SCHEMA = {
    "type": "object",
    "properties": {"competitors": {"type": "array", "items": {
        "type": "object",
        "properties": {"name": {"type": "string"}, "website": {"type": "string"},
                       "why": {"type": "string"}},
        "required": ["name", "website", "why"], "additionalProperties": False}}},
    "required": ["competitors"], "additionalProperties": False,
}


def _prompt_file():
    from pathlib import Path

    return Path(__file__).resolve().parent.parent / "prompts" / "20-teardown-scripts.md"


def slug_for(app_id: str | int) -> str:
    return brandlib.validate_slug(f"td-{app_id}")


def report_key(token: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{16,64}", token or ""):
        raise ValueError("bad teardown token")
    return f"teardowns/{token}.json"


def load(storage, token: str) -> dict:
    return json.loads(storage.read_text(report_key(token)))


def save(storage, token: str, rep: dict) -> None:
    rep["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    storage.write_text(report_key(token), json.dumps(rep, indent=2) + "\n")


def queue_job(storage, token: str, app_id) -> str:
    now = datetime.now(timezone.utc)
    jid = f"{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
    storage.write_text(f"jobs/pending/{jid}.json", json.dumps(
        {"id": jid, "type": "teardown", "brand": slug_for(app_id), "token": token,
         "created_at": now.isoformat()}, indent=2))
    return jid


# --- money ------------------------------------------------------------------------------

def month_spend(storage, month: str | None = None) -> float:
    """Dollars spent on Claude for teardown brands (td-*) this month, from the usage log."""
    month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    total = 0.0
    for key in storage.list(f"usage/{month}/"):
        if "/td-" in key and key.endswith(".json"):
            try:
                total += float(json.loads(storage.read_text(key)).get("cost") or 0)
            except Exception:  # noqa: BLE001 - one bad record shouldn't stop the check
                continue
    return total


def over_budget(storage) -> bool:
    spent = month_spend(storage)
    if spent >= MONTHLY_CAP:
        log.warning("teardown: monthly cap reached ($%.2f of $%.0f)", spent, MONTHLY_CAP)
        return True
    return False


# --- the app as a hidden brand ----------------------------------------------------------

def ensure_brand(storage, slug: str, app: dict) -> None:
    key = brandlib.brand_key(slug)
    if storage.exists(key):
        return
    fields = {"name": app["name"], "website": app.get("website") or app.get("url") or "",
              "app_store_url": app.get("url") or "", "product": (app.get("description") or "")[:900],
              "niche": app.get("genre") or "", "country": "US", "teardown": True}
    storage.write_text(key, "---\n" + yaml.safe_dump(fields, sort_keys=False, allow_unicode=True)
                       + "---\nA free teardown's app. Built by cse/teardown.py, hidden from the brand list.\n")


def find_competitors(storage, slug: str, app: dict, client=None) -> list[dict]:
    """The app's closest competitors (one short web search), reused for 14 days."""
    key = brandlib.brand_key(slug, "competitors.json")
    if storage.exists(key):
        doc = json.loads(storage.read_text(key))
        fresh = datetime.fromisoformat(doc["updated_at"]) > datetime.now(timezone.utc) - timedelta(days=14)
        if fresh and doc["competitors"]:
            return doc["competitors"]
    client = client or llm.make_client()
    spent: list = []
    notes, searches = llm.web_research(client, COMPETITOR_PROMPT.format(
        name=app["name"], genre=app.get("genre") or "app", seller=app.get("seller") or "",
        url=app.get("url") or "", description=(app.get("description") or "")[:700]), max_searches=5, spent=spent)
    for model, u in spent:
        usage.record(storage, slug, "teardown-competitors", u, model)
    found = llm.extract_json(client, "List the competitor apps from these notes, most direct first. "
                             "Leave out the app itself.", notes, COMPETITOR_SCHEMA)["competitors"]
    comps = [{"name": c["name"].strip(), "ring": "direct", "website": c["website"].strip(), "why": c["why"],
              "status": "approved", "source": "found"}
             for c in found if c["name"].strip().lower() != app["name"].strip().lower()][:8]
    storage.write_text(key, json.dumps({"brand": slug, "updated_at": datetime.now(timezone.utc).isoformat(
        timespec="seconds"), "competitors": comps}, indent=2) + "\n")
    log.info("teardown: %d competitors for %s (%d searches)", len(comps), app["name"], searches)
    return comps


def find_pages(storage, slug: str, source) -> list[dict]:
    """An Ad Library page for each competitor, until MAX_COMPETITORS have one. Extras are left
    out ("removed") so tracking only reads the ones we watch."""
    key = brandlib.brand_key(slug, "competitors.json")
    doc = json.loads(storage.read_text(key))
    have = 0
    for c in doc["competitors"]:
        if have >= MAX_COMPETITORS:
            if not c.get("fb_page_id"):
                c["status"] = "removed"
            continue
        if not c.get("fb_page_id"):
            try:
                page, _, how = adslib.find_page(source, c["name"], c.get("website") or "")
            except Exception as e:  # noqa: BLE001 - one lookup failing shouldn't stop the rest
                log.warning("teardown: page lookup failed for %s: %s", c["name"], e)
                page, how = None, ""
            if page:
                c["fb_page_id"], c["fb_page_name"], c["fb_page_match"] = page["page_id"], page["name"], how
            else:
                c["fb_page_id"] = "none"
        if c.get("fb_page_id") not in (None, "", "none"):
            have += 1
            c["status"] = "approved"
    storage.write_text(key, json.dumps(doc, indent=2) + "\n")
    return [c for c in doc["competitors"] if c.get("fb_page_id") not in (None, "", "none")]


def _tracked_today(storage, slug: str, today: date) -> bool:
    return storage.exists(brandlib.brand_key(slug, f"tracking/{today.isoformat()}.json"))


def _ads(storage, slug: str) -> dict:
    key = brandlib.brand_key(slug, "ads.json")
    return json.loads(storage.read_text(key))["ads"] if storage.exists(key) else {}


def pick(ads: dict, n: int = PICKS) -> list[str]:
    """The newest ads in the competitors' top 10s: under 30 days first (best rank, then youngest),
    one per competitor before a second; then the youngest of the rest if that's not enough."""
    top = [a for a in ads.values() if a.get("top10_rank") and a.get("media_key")]
    new = sorted((a for a in top if (a.get("days_running") or 999) <= tracking.NEW_DAYS),
                 key=lambda a: (a["top10_rank"], a.get("days_running") or 0))
    out: list[str] = []
    brands: set[str] = set()
    for a in new:
        if a.get("brand") not in brands:
            out.append(a["ad_id"])
            brands.add(a.get("brand"))
    out += [a["ad_id"] for a in new if a["ad_id"] not in out]
    rest = sorted((a for a in top if a["ad_id"] not in out), key=lambda a: a.get("days_running") or 999)
    out += [a["ad_id"] for a in rest]
    return out[:n]


def card(ad: dict) -> dict:
    """What the report page shows for one ad."""
    b, an = ad.get("breakdown") or {}, ad.get("analysis") or {}
    frames = an.get("frames") or []
    return {
        "ad_id": ad["ad_id"], "brand": ad.get("brand"), "via": ad.get("via_page_name") or "",
        "rank": ad.get("top10_rank"), "days": ad.get("days_running"),
        "hook": b.get("hook_spoken") or b.get("hook_line") or an.get("hook_line") or ad.get("headline") or "",
        "hook_text": b.get("hook_text") or "",
        "frame": frames[0]["key"] if frames else (ad.get("media_key") if ad.get("media_type") == "image" else None),
        "format": b.get("format") or "", "angle": b.get("angle") or "",
        "why": b.get("why_it_works") or "",
        "elements": [{"element": e.get("element", ""), "what": e.get("what", "")}
                     for e in (b.get("load_bearing") or [])[:3]],
        "library": ad.get("ad_library_url") or "",
        "broken_down": bool(b),
    }


def write_scripts(storage, slug: str, app: dict, cards: list[dict], ads: dict, creators: str,
                  client=None) -> list[dict]:
    """One script per creator (up to 3), built on the strongest breakout."""
    best = [ads[c["ad_id"]] for c in cards if c.get("broken_down") and c["ad_id"] in ads][:2]
    if not best or not creators.strip():
        return []
    winners = json.dumps([{"brand": a.get("brand"), "days_live": a.get("days_running"),
                           "top10_rank": a.get("top10_rank"),
                           "transcript": (a.get("analysis") or {}).get("transcript_text", "")[:2500],
                           "breakdown": {k: (a.get("breakdown") or {}).get(k) for k in (
                               "hook_spoken", "hook_text", "angle", "structure", "beats", "load_bearing",
                               "why_it_works", "cta")}} for a in best], indent=1)
    prompt = (_prompt_file().read_text()
              .replace("{{app_name}}", app["name"])
              .replace("{{app_description}}", (app.get("description") or "")[:1500])
              .replace("{{winners}}", winners)
              .replace("{{creators}}", creators.strip()[:2000]))
    knowledge = load_knowledge(slug)
    answer = llm.ask(storage, slug, f"teardown-scripts-{secrets.token_hex(3)}", prompt, client=client,
                     max_tokens=6000, effort="medium", cache=knowledge)
    out = llm.parse_json(answer)
    return (out.get("scripts") if isinstance(out, dict) else out or [])[:3]


# --- building a report ------------------------------------------------------------------

def _mail_ready(rep: dict, token: str) -> None:
    link = f"{SITE}/t/{token}"
    n = len(rep.get("breakouts") or [])
    mailer.send(rep["email"], f"Your teardown for {rep['app']['name']} is ready",
                f"<p>We read the top 10 ads of {len(rep.get('competitors') or [])} of your closest competitors "
                f"and broke down the {n} newest.</p><p><a href=\"{link}\">Open your teardown</a></p>"
                f"<p>For the next {TRACK_DAYS} days we'll keep watching them and email you the day a new ad "
                f"breaks into one of their top 10s.</p><p>Ore</p>")


def build(storage, token: str, client=None, source=None, session=None, check=lambda: None) -> str:
    """Build (or finish) a teardown. Safe to run again: it skips what's already done."""
    rep = load(storage, token)
    if over_budget(storage):
        rep["status"] = "paused"
        save(storage, token, rep)
        return "paused: monthly teardown budget reached"
    app = rep["app"]
    slug = slug_for(app["id"])
    if rep.get("status") != "ready":
        rep["status"] = "building"
        save(storage, token, rep)
    if source is None:
        from .adsource import ScrapeCreatorsSource

        source = ScrapeCreatorsSource()
    if session is None:
        import requests

        session = requests.Session()
    today = datetime.now(timezone.utc).date()

    ensure_brand(storage, slug, app)
    find_competitors(storage, slug, app, client)
    check()
    watched = find_pages(storage, slug, source)
    check()
    if not _tracked_today(storage, slug, today):
        tracking.run(storage, slug, source=source, session=session, today=today)
    ads = _ads(storage, slug)
    ids = [c["ad_id"] for c in rep.get("breakouts") or []] or pick(ads)
    creative.run(storage, slug, limit=0, ids=ids)
    check()
    breakdown.run(storage, slug, brand_name=app["name"], limit=0, ids=ids, client=client)
    ads = _ads(storage, slug)

    rep["competitors"] = [{"name": c["name"], "page": c.get("fb_page_name") or "", "website": c.get("website") or ""}
                          for c in watched]
    rep["breakouts"] = [card(ads[i]) for i in ids if i in ads]
    if rep.get("creators") and not rep.get("scripts"):
        check()
        try:
            rep["scripts"] = write_scripts(storage, slug, app, rep["breakouts"], ads, rep["creators"], client)
        except llm.LLMError as e:
            log.warning("teardown: scripts failed for %s: %s", token, e)
    first = rep.get("status") != "ready"
    rep["status"] = "ready"
    rep.setdefault("built", today.isoformat())
    rep.setdefault("tracking_until", (today + timedelta(days=TRACK_DAYS)).isoformat())
    save(storage, token, rep)
    if first:
        _mail_ready(rep, token)
    return f"teardown ready: {len(rep['breakouts'])} ads, {len(rep.get('scripts') or [])} scripts"


# --- every day: new reports from the waitlist, and new breakouts for tracked apps --------

def _reports(storage) -> list[tuple[str, dict]]:
    out = []
    for key in storage.list("teardowns/"):
        m = re.fullmatch(r"teardowns/([a-f0-9]{16,64})\.json", key)
        if m:
            out.append((m.group(1), json.loads(storage.read_text(key))))
    return sorted(out, key=lambda x: x[1].get("at") or "")


def daily(storage, today: date | None = None, source=None, session=None, client=None) -> dict | None:
    """Once a day (the worker calls this every loop; a marker makes it run once)."""
    today = today or datetime.now(timezone.utc).date()
    marker = f"teardowns/daily/{today.isoformat()}.done"
    if storage.exists(marker):
        return None
    storage.write_text(marker, datetime.now(timezone.utc).isoformat())
    reports = _reports(storage)

    # 1. the waitlist: yesterday's overflow gets today's first spots
    day_key = f"teardowns/day/{today.isoformat()}.json"
    used = json.loads(storage.read_text(day_key)).get("count", 0) if storage.exists(day_key) else 0
    promoted = 0
    for token, rep in reports:
        if rep.get("status") == "waitlist" and used < DAILY_CAP:
            rep["status"] = "queued"
            save(storage, token, rep)
            queue_job(storage, token, rep["app"]["id"])
            used += 1
            promoted += 1
    storage.write_text(day_key, json.dumps({"count": used}))

    # 2. tracking: each app with a live report, once
    if over_budget(storage):
        return {"promoted": promoted, "tracked": 0, "new": 0}
    live: dict[str, list[tuple[str, dict]]] = {}
    for token, rep in reports:
        if rep.get("status") == "ready" and (rep.get("tracking_until") or "") >= today.isoformat():
            live.setdefault(slug_for(rep["app"]["id"]), []).append((token, rep))
    if live and source is None:
        from .adsource import ScrapeCreatorsSource

        source = ScrapeCreatorsSource()
    new_total = 0
    for slug, reps in live.items():
        try:
            summary = (tracking.run(storage, slug, source=source, session=session, today=today)
                       if not _tracked_today(storage, slug, today) else None)
        except Exception as e:  # noqa: BLE001
            log.warning("teardown: tracking failed for %s: %s", slug, e)
            continue
        if not summary:
            continue
        snap = json.loads(storage.read_text(summary["key"]))
        fresh = [m["ad_id"] for m in snap.get("moves", []) if m["kind"] == "breakout"][:DAILY_NEW]
        if not fresh:
            continue
        creative.run(storage, slug, limit=0, ids=fresh)
        breakdown.run(storage, slug, brand_name=reps[0][1]["app"]["name"], limit=0, ids=fresh, client=client)
        ads = _ads(storage, slug)
        cards = [{**card(ads[i]), "found": today.isoformat()} for i in fresh if i in ads]
        new_total += len(cards)
        for token, rep in reps:
            have = {c["ad_id"] for c in rep.get("new") or []}
            add = [c for c in cards if c["ad_id"] not in have]
            if not add:
                continue
            rep["new"] = add + (rep.get("new") or [])
            save(storage, token, rep)
            c = add[0]
            mailer.send(rep["email"], f"New ad in {c['brand']}'s top 10",
                        f"<p>{c['brand']} just put a new ad into its top 10 (#{c['rank']}, live "
                        f"{c['days']} days): \"{c['hook']}\"</p><p><a href=\"{SITE}/t/{token}\">See why it "
                        f"works</a></p><p>Ore</p>")
    log.info("teardown daily: %d promoted from the waitlist, %d apps tracked, %d new breakouts",
             promoted, len(live), new_total)
    return {"promoted": promoted, "tracked": len(live), "new": new_total}
