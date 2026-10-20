import json

from cse import lessons, llm
from cse.storage import LocalStorage

ANSWER = """## Brand lessons

- Every reason to track ties back to half-life: exact day and amount matter. [Michael, 2026-10-20]

## Craft lessons

- Every list item gets its own "why it matters" line. [Michael, 2026-10-20]
"""


class Fake:
    def __init__(self):
        self.prompts = []

    def __call__(self, storage, slug, step, prompt, **kw):
        self.prompts.append(prompt)
        return ANSWER


def test_feedback_becomes_brand_and_craft_lessons(tmp_path, monkeypatch):
    s = LocalStorage(tmp_path)
    s.write_text("brands/pp/brand.md", "---\nname: PeptidePal\nproduct: a tracker\n---\nNotes.\n")
    s.write_text("brands/pp/briefs/b1.md", "### Brief 1: These Three\nHook...")
    assert lessons.for_prompt(s, "pp") == ""
    item = lessons.add_feedback(s, "pp", "Say WHY each item matters.", who="Michael",
                                about="Brief 1", doc="briefs/b1")
    fake = Fake()
    monkeypatch.setattr(llm, "ask", fake)
    assert lessons.learn(s, "pp", item["id"]) == "brands/pp/copy-lessons.md"
    assert "Brief 1: These Three" in fake.prompts[0] and "Say WHY" in fake.prompts[0]
    assert s.read_text("brands/pp/copy-lessons.md").startswith("- Every reason to track")
    assert "why it matters" in s.read_text("workspace/copy-lessons.md")
    block = lessons.for_prompt(s, "pp")
    assert "### For this brand" in block and "### Craft (any brand)" in block
    assert json.loads(s.read_text(f"brands/pp/feedback/{item['id']}.json"))["learned"]
