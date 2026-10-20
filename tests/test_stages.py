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


def test_sections_and_parse_numbers():
    report = ("### 2. Each ad\n\n#### 1. Cal AI: \"best way\" (static)\n- why 2922821464729858\n\n"
              "#### 2. Shotsy: \"Is anyone else\" (video)\n- x\n\n### 3. Patterns\n- p\n")
    got = stages.sections(report, r"(\d+)\.", [1, 2], hashes="{4}")
    assert got[1].startswith("#### 1. Cal AI") and "2922821464729858" in got[1]
    assert "Patterns" not in got[2]
    its = "### Iteration 1: Fridge\n- a\n### Iteration 2: Notes\n- b\n## Sources\nlinks"
    assert stages.sections(its, r"Iteration\s+(\d+)\b", [2]) == {2: "### Iteration 2: Notes\n- b"}
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

    # Report: the transcript line by line, no ideas section, plus the ranked ad list
    assert stages.run_report(storage, "pp", today=TODAY) is None
    prompt = storage.read_text("brands/pp/handoff/report-2026-10-17.prompt.md")
    assert "[0.0-2.0s] Is anyone else" in prompt and "No needles." in prompt
    assert "Iteration ideas" not in prompt and "{{" not in prompt
    storage.write_text("brands/pp/handoff/report-2026-10-17.answer.md",
                       "### 2. Each ad\n\n#### 1. Cal AI: \"best way\" (static)\n- why it works\n\n"
                       "### 3. Patterns\n- p\n")
    key = stages.run_report(storage, "pp", today=TODAY)
    assert key == "brands/pp/reports/2026-10-17.md"
    assert json.loads(storage.read_text("brands/pp/reports/2026-10-17.json"))["top"][0] == \
        {"rank": 1, "ad_id": "2922821464729858", "brand": "X"}

    # Iterations from winner #1 as a static: the report's diagnosis, the ad, static fields
    assert stages.run_iterations(storage, "pp", None, [1], fmt="static", today=TODAY) is None
    step = "brands/pp/handoff/iterations-2026-10-17-ads-1-static"
    prompt = storage.read_text(step + ".prompt.md")
    assert "#### 1. Cal AI" in prompt and "Patterns" not in prompt.split("<report>")[1].split("</report>")[0]
    assert "Ad 2922821464729858" in prompt and "**Text on the image:**" in prompt
    assert "They say" not in prompt and "{{" not in prompt
    storage.write_text(step + ".answer.md",
                       "### Iteration 1: Truck\n- **From:** ad #1 (Cal AI, 2922821464729858)\n")
    its_key = stages.run_iterations(storage, "pp", None, [1], fmt="static", today=TODAY)
    assert its_key == "brands/pp/iterations/2026-10-17-ads-1-static.md"
    with pytest.raises(llm.LLMError):
        stages.run_iterations(storage, "pp", None, [4], today=TODAY)

    # Brief for iteration 1: stays static, pulls its source ad
    assert stages.run_briefs(storage, "pp", its_key, [1], today=TODAY) is None
    step = "brands/pp/handoff/briefs-2026-10-17-ads-1-static-its-1"
    prompt = storage.read_text(step + ".prompt.md")
    assert "### Iteration 1: Truck" in prompt and "Static image ad" in prompt
    assert "Ad 2922821464729858" in prompt and "{{" not in prompt
    storage.write_text(step + ".answer.md", "### Brief 1: Truck")
    assert stages.run_briefs(storage, "pp", its_key, [1], today=TODAY) == \
        "brands/pp/briefs/2026-10-17-ads-1-static-its-1.md"
    with pytest.raises(llm.LLMError):
        stages.run_briefs(storage, "pp", its_key, [9], today=TODAY)


def test_formats():
    from cse import formats
    assert formats.check("B-roll") == "broll" and formats.check(None) == "ugc"
    assert formats.suffix("ugc") == "" and formats.suffix("static") == "-static"
    with pytest.raises(ValueError):
        formats.check("carousel")
    assert "chosen format wins" in formats.describe("broll", "creator 45-60")


def test_breakdown_pick_caps_per_brand():
    ads = [{"ad_id": str(i), "brand": "A" if i < 5 else "B", "score": 100 - i,
            "analysis": {"frames": []}} for i in range(8)]
    ids = [a["ad_id"] for a in breakdown.pick(ads, limit=4, per_brand=2)]
    assert ids == ["0", "1", "5", "6"]


def test_worker_runs_iteration_and_brief_jobs(brand, monkeypatch):
    from cse import worker

    storage = brand
    storage.write_text("brands/pp/reports/2026-10-17.md", "#### 1. X: \"hook\"\n- why\n")
    storage.write_text("brands/pp/reports/2026-10-17.json",
                       json.dumps({"top": [{"rank": 1, "ad_id": "2922821464729858"}]}))
    storage.write_text("brands/pp/handoff/iterations-2026-10-17-ads-1.answer.md",
                       "### Iteration 1: Fridge")
    base = {"brand": "pp", "created_at": "2026-10-17T00:00:00Z"}
    jobs = {
        "j1": {"type": "iterations", "report": "2026-10-17", "ads": [1], "format": "ugc"},
        "j2": {"type": "iterations", "report": "2026-10-17", "ads": [5], "format": "ugc"},
        "j3": {"type": "briefs", "iterations": "2026-10-17-ads-1", "numbers": [1]},
    }
    for jid, job in jobs.items():
        storage.write_text(f"jobs/pending/{jid}.json", json.dumps({**base, **job, "id": jid}))

    while worker.process_one(storage):
        pass
    done = json.loads(storage.read_text("jobs/done/j1.json"))
    assert done["result"].endswith("iterations/2026-10-17-ads-1.md")
    assert "no ad(s) ranked [5]" in json.loads(storage.read_text("jobs/failed/j2.json"))["error"]
    assert json.loads(storage.read_text("jobs/waiting/j3.json"))["type"] == "briefs"
    assert storage.list("jobs/pending/") == [] and storage.list("jobs/running/") == []


def test_report_cap_grows_with_few_advertisers(brand):
    storage = brand
    ads = {str(i): _ad(str(i), 90 - i, brand="A" if i % 2 else "B") for i in range(12)}
    storage.write_text("brands/pp/ads.json", json.dumps({"ads": ads}))
    stages.run_report(storage, "pp", today=TODAY)
    prompt = storage.read_text("brands/pp/handoff/report-2026-10-17.prompt.md")
    assert prompt.count("\n### #") == 10  # 2 advertisers fill all 10 slots


def test_iterations_from_your_own_idea(brand):
    storage = brand
    storage.write_text("brands/pp/reports/2026-10-17.md",
                       "#### 1. X: \"hook\"\n- why\n\n### 3. Patterns\n- Nobody shows the morning.\n")
    storage.write_text("brands/pp/reports/2026-10-17.json",
                       json.dumps({"top": [{"rank": 1, "ad_id": "2922821464729858"}]}))
    idea = "A guy films his 6am alarm going off, then his phone locking."
    assert stages.run_iterations(storage, "pp", None, [], fmt="broll", per_ad=2, idea=idea,
                                 today=TODAY) is None
    [key] = [k for k in storage.list("brands/pp/handoff/") if "idea" in k]
    prompt = storage.read_text(key)
    assert idea in prompt and "Nobody shows the morning." in prompt and "(none picked)" in prompt
    assert "| Shot |" in prompt and "{{" not in prompt and "1 to 2" in prompt
    storage.write_text(key.replace(".prompt.md", ".answer.md"), "### Iteration 1: 6am")
    out = stages.run_iterations(storage, "pp", None, [], fmt="broll", per_ad=2, idea=idea, today=TODAY)
    assert "-idea-" in out and out.endswith("-x2-broll.md")
    assert "**Your idea:** A guy films" in storage.read_text(out)
    with pytest.raises(llm.LLMError):
        stages.run_iterations(storage, "pp", None, [], today=TODAY)


def test_product_facts_from_brand_md_reach_the_prompts(brand):
    storage = brand
    storage.write_text("brands/pp/brand.md", "---\nname: PeptidePal\nproduct: a tracker\n---\n\n"
                       "## How it works\nNo snooze. Start mission.\n")
    storage.write_text("brands/pp/reports/2026-10-17.md", "#### 1. X: \"hook\"\n- why\n")
    storage.write_text("brands/pp/reports/2026-10-17.json",
                       json.dumps({"top": [{"rank": 1, "ad_id": "2922821464729858"}]}))
    stages.run_iterations(storage, "pp", None, [1], today=TODAY)
    [key] = [k for k in storage.list("brands/pp/handoff/") if k.endswith(".prompt.md")]
    prompt = storage.read_text(key)
    assert "- product: a tracker" in prompt and "No snooze. Start mission." in prompt


def test_one_brief_doc_from_iterations_in_different_files_and_formats(brand):
    storage = brand
    storage.write_text("brands/pp/iterations/2026-10-18-ads-3-4.md",
                       "### Iteration 1: Three things\n- ugc a\n### Iteration 2: Day after\n- ugc b\n")
    storage.write_text("brands/pp/iterations/2026-10-18-idea-abc123-broll.md",
                       "### Iteration 1: Appointment pile\n- broll c\n")
    picks = [("brands/pp/iterations/2026-10-18-ads-3-4.md", 1),
             ("brands/pp/iterations/2026-10-18-ads-3-4.md", 2),
             ("brands/pp/iterations/2026-10-18-idea-abc123-broll.md", 1)]
    assert stages.run_brief_picks(storage, "pp", picks, today=TODAY) is None
    [key] = [k for k in storage.list("brands/pp/handoff/") if "picks" in k]
    prompt = storage.read_text(key)
    assert prompt.count("<iteration from=") == 3 and "1 to 3" in prompt
    assert "| They say |" in prompt and "| Shot |" in prompt and "{{" not in prompt
    storage.write_text(key.replace(".prompt.md", ".answer.md"), "### Brief 1: x")
    out = stages.run_brief_picks(storage, "pp", picks, today=TODAY)
    assert "/briefs/2026-10-17-picks-" in out
    assert "Iteration 1 of 2026-10-18-idea-abc123-broll (B-roll video)" in storage.read_text(out)


def test_new_iterations_see_what_was_already_made(brand):
    storage = brand
    storage.write_text("brands/pp/iterations/2026-10-16-ads-1.md",
                       "### Iteration 1: Second-One Warning\n"
                       "- **Why it should work for us:** the buying moment, adding a second one.\n"
                       "- **Script:**\n\n| Time | They say | On screen |\n|---|---|---|\n"
                       "| 0-3s | \"If you just added a second shot, listen.\" | headphones off |\n")
    made = stages.already_made(storage, "pp")
    assert "Second-One Warning (2026-10-16-ads-1)" in made
    assert 'Opens: "If you just added a second shot, listen."' in made
    assert "Angle: the buying moment" in made
    storage.write_text("brands/pp/reports/2026-10-17.md", "#### 1. X: \"hook\"\n- why\n")
    storage.write_text("brands/pp/reports/2026-10-17.json",
                       json.dumps({"top": [{"rank": 1, "ad_id": "2922821464729858"}]}))
    stages.run_iterations(storage, "pp", None, [1], today=TODAY)
    [key] = [k for k in storage.list("brands/pp/handoff/") if k.endswith(".prompt.md")]
    prompt = storage.read_text(key)
    assert "Second-One Warning" in prompt and "different angle" in prompt


def test_ingredient_claims_only_run_when_ingredients_are_listed(brand):
    from cse import ingredients
    storage = brand
    storage.write_text("brands/pp/brand.md", "---\nname: Calm Co\nproduct: a sleep gummy\n"
                       "ingredients: []\n---\n\n# Calm Co\n")
    assert ingredients.run(storage, "pp", today=TODAY) is None
    assert not [k for k in storage.list("brands/pp/handoff/") if "ingredients" in k]

    storage.write_text("brands/pp/brand.md", "---\nname: Calm Co\nproduct: a sleep gummy\n"
                       "ingredients: \"Magnesium glycinate, L-theanine\"\n"
                       "unique_mechanism: \"the cortisol off-switch\"\nhealth_product: true\n---\n")
    storage.write_text("brands/pp/research-brief.md", "# Brief\nThey can't switch off at night.\n")
    assert ingredients.run(storage, "pp", today=TODAY) is None  # handoff waits
    [key] = [k for k in storage.list("brands/pp/handoff/") if "ingredients" in k and k.endswith(".prompt.md")]
    prompt = storage.read_text(key)
    assert "- Magnesium glycinate\n- L-theanine" in prompt
    assert "the cortisol off-switch" in prompt and "can't switch off at night" in prompt
    assert "flag every claim for compliance review" in prompt and "{{" not in prompt

    storage.write_text(key.replace(".prompt.md", ".answer.md"), "### Magnesium glycinate\n| 1 | claim | pain | RCT | n/a |")
    out = ingredients.run(storage, "pp", today=TODAY)
    assert out == "brands/pp/ingredient-claims.md"
    assert "no PubMed, PMC or DOI links" in storage.read_text(out)
    assert storage.exists("brands/pp/research/2026-10-17/ingredient-claims.md")


def test_unique_mechanisms_need_a_brief_and_aim_at_problem_aware(brand):
    from cse import mechanisms
    storage = brand
    storage.write_text("brands/pp/brand.md", "---\nname: PeptidePal\nproduct: a tracker\n"
                       "niche: tracking apps\n---\n\n## How it works\nOne calm screen.\n")
    assert mechanisms.run(storage, "pp", today=TODAY) is None  # no brief yet
    storage.write_text("brands/pp/research-brief.md", "# Brief\nSticky notes and four Reddit tabs.\n")
    assert mechanisms.run(storage, "pp", today=TODAY) is None  # handoff waits
    [key] = [k for k in storage.list("brands/pp/handoff/") if "mechanisms" in k and k.endswith(".prompt.md")]
    prompt = storage.read_text(key)
    assert "four Reddit tabs" in prompt and "One calm screen." in prompt
    assert "who are Problem Aware" in prompt and "tracking apps niche" in prompt and "{{" not in prompt
    storage.write_text(key.replace(".prompt.md", ".answer.md"), "### 1. The Memory Gap\n- **UMP:** x")
    assert mechanisms.run(storage, "pp", today=TODAY) == "brands/pp/unique-mechanisms.md"
    assert storage.exists("brands/pp/research/2026-10-17/unique-mechanisms.md")


def test_chosen_mechanisms_reach_every_writing_prompt(brand):
    storage = brand
    storage.write_text("brands/pp/brand.md", "---\nname: PeptidePal\nproduct: a tracker\n---\n")
    storage.write_text("brands/pp/unique-mechanisms-chosen.md", "### The Memory Gap\n- **UMP:** notes don't remember")
    ctx = stages.brand_context(storage, "pp")
    assert "## Our unique mechanism" in ctx["product_facts"] and "The Memory Gap" in ctx["product_facts"]


def test_ranking_runs_on_the_chosen_mechanisms(brand):
    from cse import mechanisms
    storage = brand
    storage.write_text("brands/pp/brand.md", "---\nname: PeptidePal\nproduct: a tracker\n"
                       "audience: people on weekly shots\n---\n")
    assert mechanisms.rank(storage, "pp", today=TODAY) is None  # nothing chosen
    storage.write_text("brands/pp/research-brief.md", "# Brief\nFour Reddit tabs.\n")
    storage.write_text("brands/pp/unique-mechanisms-chosen.md", "### 1. The Memory Gap\n- x\n\n### 4. The Scroll\n- y")
    assert mechanisms.rank(storage, "pp", today=TODAY) is None  # handoff waits
    [key] = [k for k in storage.list("brands/pp/handoff/") if "rank" in k and k.endswith(".prompt.md")]
    prompt = storage.read_text(key)
    assert "The Memory Gap" in prompt and "The Scroll" in prompt and "Four Reddit tabs." in prompt
    assert "to people on weekly shots" in prompt and "who are Problem Aware" in prompt and "{{" not in prompt
    storage.write_text(key.replace(".prompt.md", ".answer.md"), "### #1. The Memory Gap")
    assert mechanisms.rank(storage, "pp", today=TODAY) == "brands/pp/unique-mechanisms-ranked.md"


def test_mechanism_prompts_use_the_brands_own_awareness_stage(brand):
    from cse import mechanisms
    storage = brand
    assert mechanisms.stages_in("| **Problem Aware** (campaign target) | 38% |\n"
                                "| **Solution Aware** (campaign target) | 19% |") == "Problem Aware and Solution Aware"
    assert mechanisms.stages_in("Unaware 20%\n**Final call: Solution Aware.** Most know apps exist.") == "Solution Aware"
    storage.write_text("brands/pp/brand.md", "---\nname: X\nproduct: a gummy\n---\n")
    storage.write_text("brands/pp/research-brief.md", "# Brief\n")
    storage.write_text("brands/pp/research/2026-10-01/03-awareness.md", "**Final call: Product Aware.**")
    fields = {"name": "X"}
    assert mechanisms.target_awareness(storage, "pp", fields) == "Product Aware"
    assert mechanisms.target_awareness(storage, "pp", {"target_awareness": "Most Aware"}) == "Most Aware"
    mechanisms.run(storage, "pp", today=TODAY)
    [key] = [k for k in storage.list("brands/pp/handoff/") if k.endswith(".prompt.md")]
    assert "who are Product Aware" in storage.read_text(key)


def test_iterations_and_briefs_can_be_written_for_one_creator(brand):
    storage = brand
    storage.write_text("brands/pp/creators.json", json.dumps({"creators": [{
        "id": "maya", "name": "Maya", "story": "Started the course in March, first brand deal in June.",
        "voice": "fast, funny, says 'okay so'", "can_claim": "one $500 brand deal; nothing about income"}]}))
    storage.write_text("brands/pp/reports/2026-10-17.md", "#### 1. X: \"hook\"\n- why\n")
    storage.write_text("brands/pp/reports/2026-10-17.json",
                       json.dumps({"top": [{"rank": 1, "ad_id": "2922821464729858"}]}))
    assert stages.run_iterations(storage, "pp", None, [1], fmt="broll", creator="maya", today=TODAY) is None
    [key] = [k for k in storage.list("brands/pp/handoff/") if k.endswith(".prompt.md")]
    prompt = storage.read_text(key)
    assert "**Maya** will film and say this ad" in prompt and "first brand deal in June" in prompt
    assert "nothing about income" in prompt and key.endswith("-for-maya-broll.prompt.md")
    storage.write_text(key.replace(".prompt.md", ".answer.md"), "### Iteration 1: Okay so")
    out = stages.run_iterations(storage, "pp", None, [1], fmt="broll", creator="maya", today=TODAY)
    assert out.endswith("-ads-1-for-maya-broll.md") and stages.format_of(Path(out).stem) == "broll"
    assert "**Written for:** Maya" in storage.read_text(out)
    with pytest.raises(ValueError):
        stages.run_iterations(storage, "pp", None, [1], creator="nobody", today=TODAY)
    # without a creator, the prompt says so
    stages.run_iterations(storage, "pp", None, [1], today=TODAY)
    plain = [k for k in storage.list("brands/pp/handoff/") if k.endswith("2026-10-17-ads-1.prompt.md")]
    assert "No specific creator" in storage.read_text(plain[0])
