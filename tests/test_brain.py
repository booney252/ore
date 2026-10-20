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
