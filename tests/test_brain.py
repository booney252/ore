import json

from cse import brain
from cse.storage import LocalStorage


def test_brain_additions_follow_the_brief(tmp_path):
    s = LocalStorage(tmp_path)
    assert brain.with_brief("BRIEF", s, "pp") == "BRIEF"  # nothing added: unchanged
    s.write_text("brands/pp/brain/20261020-a.json", json.dumps(
        {"id": "20261020-a", "title": "New price", "kind": "note", "added": "2026-10-20T10:00:00Z",
         "text": "We're $9.99 a month now."}))
    s.write_text("brands/pp/brain/20261021-b.json", json.dumps(
        {"id": "20261021-b", "title": "Sales deck", "kind": "doc", "filename": "deck.pdf",
         "added": "2026-10-21T10:00:00Z", "text": "x" * 40000}))
    out = brain.with_brief("BRIEF", s, "pp")
    assert out.startswith("BRIEF\n\n## Added to the brand brain by the brand")
    assert "### New price, added 2026-10-20\n\nWe're $9.99 a month now." in out
    assert "### Sales deck (from deck.pdf)" in out and "[... cut for length]" in out


def test_rebuild_brief_only_reuses_the_latest_saved_steps(tmp_path):
    from cse import research
    s = LocalStorage(tmp_path)
    s.write_text("brands/pp/research/2026-10-06/01-competitors.md", "C")
    s.write_text("brands/pp/research/2026-10-06/02-psychographics.md", "P")
    s.write_text("brands/pp/research/2026-10-06/03-awareness.md", "old A")
    s.write_text("brands/pp/research/2026-10-10/03-awareness.md", "new A")
    s.write_text("brands/pp/research/2026-10-20/unique-mechanisms.md", "M")
    assert research.latest_steps(s, "pp") == {"step1_output": "C", "step2_output": "P", "step3_output": "new A"}
