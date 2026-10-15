import json
from types import SimpleNamespace

from cse import brand as brandlib
from cse import competitors
from cse.storage import LocalStorage


def test_merge_marks_known_and_found():
    out = competitors.merge(
        existing=[],
        known=["Alarmy"],
        found=[
            {"name": "Alarmy", "ring": "direct", "website": "https://alar.my",
             "facebook_page": "", "why": "alarm app"},
            {"name": "Opal", "ring": "adjacent", "website": "not a url",
             "facebook_page": "https://facebook.com/opal", "why": "screen time"},
        ],
    )
    by_name = {c["name"]: c for c in out}
    assert by_name["Alarmy"]["source"] == "you"
    assert by_name["Alarmy"]["status"] == "approved"
    assert by_name["Alarmy"]["ring"] == "direct"
    assert by_name["Opal"]["source"] == "tool"
    assert by_name["Opal"]["status"] == "pending"
    assert by_name["Opal"]["website"] == ""  # junk URLs dropped


def test_merge_keeps_user_edits():
    existing = [
        {"name": "Opal", "ring": "relative", "website": "https://opal.so", "facebook_page": "",
         "why": "mine", "source": "tool", "status": "removed"},
    ]
    found = [{"name": "OPAL", "ring": "adjacent", "website": "https://other.com",
              "facebook_page": "https://facebook.com/opal", "why": "theirs"}]
    [opal] = competitors.merge(existing, [], found)
    assert opal["status"] == "removed"
    assert opal["ring"] == "relative"
    assert opal["website"] == "https://opal.so"
    assert opal["facebook_page"] == "https://facebook.com/opal"  # blank field filled


def test_counts_skip_removed():
    c = competitors.counts([
        {"name": "a", "ring": "direct", "source": "you", "status": "approved"},
        {"name": "b", "ring": "adjacent", "source": "tool", "status": "pending"},
        {"name": "c", "ring": "relative", "source": "tool", "status": "removed"},
    ])
    assert (c["direct"], c["adjacent"], c["relative"], c["removed"]) == (1, 1, 0, 1)


class FakeClient:
    """Stands in for anthropic.Anthropic: first call is research, second is extraction."""

    def __init__(self, found):
        self.calls = []
        self.found = found
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if "tools" in kwargs:
            content = [SimpleNamespace(type="server_tool_use"),
                       SimpleNamespace(type="text", text="research notes")]
        else:
            content = [SimpleNamespace(type="text", text=json.dumps({"competitors": self.found}))]
        return SimpleNamespace(stop_reason="end_turn", stop_details=None, content=content)


def test_run_writes_competitors_json(tmp_path):
    storage = LocalStorage(tmp_path)
    text = brandlib.render_template("solis").replace(
        'product: ""', 'product: "alarm that locks your phone"'
    ).replace("known_competitors: []", "known_competitors: [Alarmy]")
    storage.write_text("brands/solis/brand.md", text)

    client = FakeClient([{"name": "Opal", "ring": "adjacent", "website": "https://opal.so",
                          "facebook_page": "", "why": "screen time blocker"}])
    c = competitors.run(storage, "solis", client=client)

    assert "alarm that locks your phone" in client.calls[0]["messages"][0]["content"]
    saved = json.loads(storage.read_text("brands/solis/competitors.json"))
    assert {x["name"] for x in saved["competitors"]} == {"Alarmy", "Opal"}
    assert c["from_you"] == 1 and c["found_by_tool"] == 1
