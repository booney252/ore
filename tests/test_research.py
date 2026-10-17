import json
from datetime import date
from pathlib import Path

from cse import brand as brandlib
from cse import research, voc
from cse.storage import LocalStorage

ROOT = Path(__file__).parent.parent
TODAY = date(2026, 10, 17)


def test_parse_feed_keeps_exact_words_rating_and_link():
    data = {"feed": {"entry": [
        {"im:name": {"label": "the app itself"}},
        {"im:rating": {"label": "2"}, "title": {"label": "Deleted my logs"},
         "content": {"label": "It randomly deletes everything, I lost a month."},
         "updated": {"label": "2026-10-14T17:25:16-07:00"}, "id": {"label": "99"}},
    ]}}
    [q] = voc.parse_feed(data, "Pep AI", "https://apps.apple.com/us/app/pep/id123?mt=8")
    assert q["text"] == "Deleted my logs. It randomly deletes everything, I lost a month."
    assert q["rating"] == 2 and q["date"] == "2026-10-14"
    assert q["url"] == "https://apps.apple.com/us/app/pep/id123?see-all=reviews"


def test_parse_paste_one_quote_per_paragraph_with_source():
    text = "source: https://reddit.com/r/x/1\n\nI forget which day I dosed, every week.\n\nok\n\nThe spreadsheet got out of hand fast"
    quotes = voc.parse_paste(text, "reddit.md")
    assert [q["text"] for q in quotes] == ["I forget which day I dosed, every week.",
                                          "The spreadsheet got out of hand fast"]
    assert all(q["url"] == "https://reddit.com/r/x/1" for q in quotes)


def test_unverified_quotes_flags_only_made_up_lines():
    brief = ('They say "it randomly deletes everything, I lost a month" and '
             '"I finally feel in control of my whole routine now".')
    flagged = research.unverified_quotes(brief, ["Deleted my logs. It randomly deletes everything, I lost a month."])
    assert flagged == ["I finally feel in control of my whole routine now"]


def test_runs_steps_1_to_3_then_the_brief(tmp_path, monkeypatch):
    monkeypatch.chdir(ROOT)
    monkeypatch.setenv("CSE_LLM", "handoff")
    s = LocalStorage(tmp_path)
    md = brandlib.render_template("acme").replace('product: ""', 'product: "rocket skates"')
    s.write_text(brandlib.brand_key("acme"), md)
    s.write_text(brandlib.brand_key("acme", "voc.json"), json.dumps({"quotes": [
        {"text": "My old skates never go fast enough", "source": "pasted", "about": "x", "url": "u"}]}))

    assert research.run(s, "acme", today=TODAY) is None  # three prompts written at once
    prompts = [k for k in s.list("brands/acme/handoff/") if k.endswith(".prompt.md")]
    assert len(prompts) == 3
    assert "rocket skates" in s.read_text(prompts[0]) and "{{" not in s.read_text(prompts[1])
    for p in prompts:
        s.write_text(p.replace(".prompt.md", ".answer.md"), f"answer for {p.rsplit('-', 1)[-1]}")

    assert research.run(s, "acme", today=TODAY) is None  # now step 4 waits
    step4 = "brands/acme/handoff/research-2026-10-17-04-research-brief"
    assert "answer for" in s.read_text(step4 + ".prompt.md")
    s.write_text(step4 + ".answer.md", '# Brief\n\nThey say "my old skates never go fast enough".')

    key = research.run(s, "acme", today=TODAY)
    assert key == "brands/acme/research-brief.md"
    assert "Quote check" not in s.read_text(key)
    assert s.exists("brands/acme/research/2026-10-17/02-psychographics.md")


def test_find_app_needs_the_competitors_own_website(monkeypatch):
    class Resp:
        def raise_for_status(self): pass
        def json(self):
            return {"results": [
                {"trackName": "Eden: Christian Dating", "sellerUrl": "https://edenapp.co",
                 "trackId": 1, "trackViewUrl": "u1"},
                {"trackName": "Eden Health", "sellerUrl": "https://www.tryeden.com/",
                 "trackId": 2, "trackViewUrl": "u2"}]}

    class Session:
        def get(self, *a, **k): return Resp()

    monkeypatch.setattr(voc, "PAUSE", 0)
    assert voc.find_app(Session(), "Eden", "https://www.tryeden.com")["id"] == "2"
    assert voc.find_app(Session(), "Eden", "") is None


def test_voc_keeps_last_runs_reviews_when_apple_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(voc, "PAUSE", 0)
    s = LocalStorage(tmp_path)
    s.write_text(brandlib.brand_key("acme"), brandlib.render_template("acme"))
    s.write_text(brandlib.brand_key("acme", "competitors.json"), json.dumps({"competitors": [
        {"name": "Alarmy", "app_store_url": "https://apps.apple.com/us/app/alarmy/id1163786766"}]}))
    old = {"text": "The squat mission finally gets me out of bed", "source": "app_store", "about": "Alarmy"}
    s.write_text(brandlib.brand_key("acme", "voc.json"), json.dumps({"quotes": [old]}))

    class Session:
        def get(self, *a, **k):
            raise TimeoutError("read timed out")

    assert voc.run(s, "acme", session=Session())["Alarmy"] == 1
    assert json.loads(s.read_text(brandlib.brand_key("acme", "voc.json")))["quotes"] == [old]
