import json

import pytest

from cse import masters
from cse.storage import LocalStorage

SCRIPT = """- **Hook:** "I owe my GLP-1 an apology."

| Time | They say | On screen |
|---|---|---|
| 0-4s | "I owe my GLP-1 an apology." | Text hook: It was never the medication |
| 4-10s | "It's called PeptidePal." | PeptidePal logo pops up |"""


def test_split_answer_keeps_script_and_changes():
    md, changes = masters.split_answer(f"## Script\n\n{SCRIPT}\n\n## What I changed\n\n- Gave the payoff room.\n- New text hook.\n")
    assert md.startswith("- **Hook:**") and "| They say |" in md
    assert changes == ["Gave the payoff room.", "New text hook."]


def test_split_answer_needs_a_table():
    with pytest.raises(Exception):
        masters.split_answer("## Script\n\nno table here")


def test_first_script_takes_the_first_iteration_only():
    md = f"# Brand iterations\n\n### Iteration 1: The apology\n\n{SCRIPT}\n\n---\n\n### Iteration 2: Other\n\nx"
    title, body = masters.first_script(md)
    assert title == "The apology" and body.startswith("- **Hook:**") and "Iteration 2" not in body


def test_revise_and_versions_in_handoff(tmp_path, monkeypatch):
    s = LocalStorage(tmp_path)
    import os
    monkeypatch.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    s.write_text("brands/demo/brand.md", "---\nname: Demo\nproduct: an app\n---\n")
    s.write_text("brands/demo/research-brief.md", "# Brief")
    s.write_text("brands/demo/creators.json", json.dumps({"creators": [{"id": "jon", "name": "Jon", "about": "50s dad"}]}))
    m = {"id": "apology", "title": "The apology", "idea": "x", "md": SCRIPT, "rev": 1, "status": "draft",
         "changes": [], "creators": ["jon"], "versions": {}, "created_at": "now"}
    masters.save(s, "demo", m)
    # handoff: the first call writes the prompt and waits
    assert masters.revise(s, "demo", "apology", feedback="more payoff") is None
    prompt_key = next(k for k in s.list("brands/demo/handoff/") if k.endswith(".prompt.md"))
    assert "more payoff" in s.read_text(prompt_key)
    s.write_text(prompt_key.replace(".prompt.md", ".answer.md"), f"## Script\n\n{SCRIPT}\n\n## What I changed\n\n- More payoff.")
    assert masters.revise(s, "demo", "apology", feedback="more payoff")
    m = masters.load(s, "demo", "apology")
    assert m["rev"] == 2 and m["changes"] == ["More payoff."] and m["feedback"][0]["text"] == "more payoff"
    # versions: one per assigned creator, stamped with the master's revision
    assert masters.make_versions(s, "demo", "apology") is None
    vp = next(k for k in s.list("brands/demo/handoff/") if "version-apology" in k and k.endswith(".prompt.md"))
    assert "Jon" in s.read_text(vp)
    s.write_text(vp.replace(".prompt.md", ".answer.md"), f"## Script\n\n{SCRIPT}\n\n## What changed\n\n- His age.")
    assert masters.make_versions(s, "demo", "apology")
    v = masters.load(s, "demo", "apology")["versions"]["jon"]
    assert v["rev"] == 2 and v["status"] == "ready" and v["changes"] == ["His age."]
