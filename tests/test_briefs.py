import json
from datetime import date

import pytest

from cse import breakdown, briefs, llm
from cse.storage import LocalStorage

TODAY = date(2026, 10, 16)


def test_render_requires_every_placeholder():
    assert llm.render("hi {{a}}", {"a": 1}) == "hi 1"
    with pytest.raises(llm.LLMError):
        llm.render("{{a}} {{b}}", {"a": 1})


def test_parse_json_handles_fences():
    assert llm.parse_json('Here:\n```json\n{"a": [1]}\n```') == {"a": [1]}
    with pytest.raises(llm.LLMError):
        llm.parse_json("no json")


def _ad(ad_id, score, first_seen, own=False, broken=True):
    return {"ad_id": ad_id, "brand": "X", "ring": "direct", "is_own": own, "score": score,
            "score_why": "Running 1 day, still active, 1 version.", "first_seen": first_seen,
            "media_type": "video", "analysis": {"frames": [], "transcript": []},
            **({"breakdown": {"hook_line": "hey"}} if broken else {})}


def test_pick_ads_top_plus_new_plus_own():
    ads = [_ad(str(i), 100 - i, "2026-01-01") for i in range(30)]
    ads += [_ad("new", 1, "2026-10-14"), _ad("own", 0, "2026-01-01", own=True),
            _ad("raw", 99, "2026-10-14", broken=False)]
    ids = [a["ad_id"] for a in briefs.pick_ads(ads, TODAY)]
    assert ids[:2] == ["0", "1"] and len(ids) == briefs.TOP_ADS + 2
    assert "new" in ids and "own" in ids and "raw" not in ids


def test_handoff_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("CSE_LLM", "handoff")
    monkeypatch.chdir(tmp_path)
    (tmp_path / "prompts").mkdir()
    (tmp_path / "knowledge").mkdir()
    (tmp_path / "knowledge" / "rules.md").write_text("# Rules\n\nNo needles.\n")
    for name in ("ad-breakdown.md", "05-weekly-briefs.md"):
        src = briefs.Path(__file__).parent.parent / "prompts" / name
        (tmp_path / "prompts" / name).write_text(src.read_text())

    storage = LocalStorage(tmp_path / "store")
    storage.write_text("brands/pp/research-brief.md", "# Brief\nBuyer is 38-64.")
    storage.write_text("brands/pp/ads.json", json.dumps({"ads": {"1": _ad("1", 80, "2026-10-15",
                                                                              broken=False)}}))

    # Breakdown: first run writes the prompt, second run reads the answer.
    assert breakdown.run(storage, "pp", "PeptidePal")["waiting"] == 1
    prompt = storage.read_text("brands/pp/handoff/breakdown-1.prompt.md")
    assert "PeptidePal" in prompt and "{{" not in prompt
    storage.write_text("brands/pp/handoff/breakdown-1.answer.md", '{"hook_line": "Wait, Sunday?"}')
    assert breakdown.run(storage, "pp", "PeptidePal")["done"] == 1

    # Briefs: same pattern.
    assert briefs.run(storage, "pp", "PeptidePal", today=TODAY) is None
    prompt = storage.read_text("brands/pp/handoff/briefs-2026-10-16.prompt.md")
    assert "No needles." in prompt and "Wait, Sunday?" in prompt and "{{" not in prompt
    storage.write_text("brands/pp/handoff/briefs-2026-10-16.answer.md", "### Brief 1: Test")
    key = briefs.run(storage, "pp", "PeptidePal", today=TODAY)
    assert key == "brands/pp/briefs/2026-10-16.md"
    assert "### Brief 1: Test" in storage.read_text(key)
