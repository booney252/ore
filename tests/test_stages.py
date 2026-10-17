import json
from datetime import date
from pathlib import Path

import pytest

from cse import breakdown, llm, stages
from cse.storage import LocalStorage

TODAY = date(2026, 10, 17)
ROOT = Path(__file__).parent.parent


def test_render_requires_every_placeholder():
    assert llm.render("hi {{a}}", {"a": 1}) == "hi 1"
    with pytest.raises(llm.LLMError):
        llm.render("{{a}} {{b}}", {"a": 1})


def test_parse_json_handles_fences():
    assert llm.parse_json('Here:\n```json\n{"a": [1]}\n```') == {"a": [1]}
    with pytest.raises(llm.LLMError):
        llm.parse_json("no json")


def _ad(ad_id, score, brand="X", broken=True, removed=False):
    return {"ad_id": ad_id, "brand": brand, "ring": "direct", "score": score,
            "score_why": "Running 1 day, still active, 1 version.", "media_type": "video",
            "analysis": {"frames": [], "transcript": [{"start": 0, "end": 2, "text": "Is anyone else"}]},
            **({"breakdown": {"hook_line": "Is anyone else"}} if broken else {}),
            **({"removed_from_library": "2026-10-17"} if removed else {})}


def test_ranked_caps_per_brand_and_skips_removed_and_raw():
    ads = [_ad(str(i), 100 - i, brand="A") for i in range(5)]
    ads += [_ad("b1", 50, brand="B"), _ad("gone", 99, removed=True), _ad("raw", 98, broken=False)]
    ids = [a["ad_id"] for a in stages.ranked(ads, per_brand=3)]
    assert ids == ["0", "1", "2", "b1"]


def test_extract_ideas_and_parse_numbers():
    md = ("## 4. Iteration ideas\n\n#### Idea 1: Fridge\n- From: ad #1 (Cal AI, 2922821464729858)\n\n"
          "#### Idea 2: Notes\n- From: ad #2\n\n#### Idea 3: Doctor\n- x\n\n## Sources\nlinks")
    got = stages.extract_ideas(md, [1, 3])
    assert set(got) == {1, 3}
    assert got[1].startswith("#### Idea 1: Fridge") and "2922821464729858" in got[1]
    assert "Sources" not in got[3]
    assert stages.parse_numbers("1, 3,5-7") == [1, 3, 5, 6, 7]


@pytest.fixture
def brand(tmp_path, monkeypatch):
    monkeypatch.setenv("CSE_LLM", "handoff")
    monkeypatch.chdir(tmp_path)
    (tmp_path / "prompts").mkdir()
    (tmp_path / "knowledge").mkdir()
    (tmp_path / "knowledge" / "rules.md").write_text("# Rules\n\nNo needles.\n")
    for f in (ROOT / "prompts").glob("*.md"):
        (tmp_path / "prompts" / f.name).write_text(f.read_text())
    storage = LocalStorage(tmp_path / "store")
    storage.write_text("brands/pp/brand.md", "---\nname: PeptidePal\n---\n")
    storage.write_text("brands/pp/research-brief.md", "# Brief\nBuyer is 38-64.")
    storage.write_text("brands/pp/ads.json", json.dumps({"ads": {
        "2922821464729858": {**_ad("2922821464729858", 80), "breakdown": None},
    }}))
    return storage


def test_full_pipeline_in_handoff(brand):
    storage = brand
    # Breakdown via handoff
    assert breakdown.run(storage, "pp", "PeptidePal")["waiting"] == 1
    storage.write_text("brands/pp/handoff/breakdown-2922821464729858.answer.md",
                       '{"hook_line": "Is anyone else", "format": "talking head"}')
    assert breakdown.run(storage, "pp", "PeptidePal")["done"] == 1

    # Report: prompt has the transcript line by line, the idea count and the format
    assert stages.run_report(storage, "pp", idea_count=7, today=TODAY) is None
    prompt = storage.read_text("brands/pp/handoff/report-2026-10-17-7ideas.prompt.md")
    assert "[0.0-2.0s] Is anyone else" in prompt and "exactly 7 ideas" in prompt
    assert "No needles." in prompt and "UGC: a real creator" in prompt and "{{" not in prompt
    storage.write_text("brands/pp/handoff/report-2026-10-17-7ideas.answer.md",
                       "## 4. Ideas\n\n#### Idea 1: Fridge\n- From: ad #1 (2922821464729858)\n\n"
                       "#### Idea 2: Notes\n- x\n")
    key = stages.run_report(storage, "pp", idea_count=7, today=TODAY)
    assert key == "brands/pp/reports/2026-10-17.md"

    # Scripts for idea 1: pulls the idea text and its source ad
    assert stages.run_followup(storage, "pp", "scripts", [1], today=TODAY) is None
    prompt = storage.read_text("brands/pp/handoff/scripts-2026-10-17-ideas-1.prompt.md")
    assert "#### Idea 1: Fridge" in prompt and "Idea 2" not in prompt
    assert "Ad 2922821464729858" in prompt
    storage.write_text("brands/pp/handoff/scripts-2026-10-17-ideas-1.answer.md", "### Script 1")
    assert stages.run_followup(storage, "pp", "scripts", [1], today=TODAY) == \
        "brands/pp/scripts/2026-10-17-ideas-1.md"

    with pytest.raises(llm.LLMError):
        stages.run_followup(storage, "pp", "briefs", [9], today=TODAY)


def test_breakdown_pick_caps_per_brand():
    ads = [{"ad_id": str(i), "brand": "A" if i < 5 else "B", "score": 100 - i,
            "analysis": {"frames": []}} for i in range(8)]
    ids = [a["ad_id"] for a in breakdown.pick(ads, limit=4, per_brand=2)]
    assert ids == ["0", "1", "5", "6"]
