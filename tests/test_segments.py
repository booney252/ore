import json

from cse import brand, organic, research
from cse.storage import LocalStorage


def test_segments_parse():
    segs = brand.segments({"segments": ["her | Women | women who want AI income | jiannacapri @alexismakesai",
                                        "him | Men", "bad key | x"]})
    assert [s["key"] for s in segs] == ["her", "him"]
    assert segs[0]["handles"] == ["jiannacapri", "alexismakesai"] and segs[1]["handles"] == []


class FakeComments:
    credits_used = 0

    def post_comments(self, platform, url, pages):
        self.credits_used += 1
        return [{"text": "is this a scam or does it work", "who": "a", "likes": 2, "date": "2026-10-01"},
                {"text": "🔥", "who": "b", "likes": 0, "date": ""}]


def _setup(tmp_path):
    s = LocalStorage(tmp_path)
    s.write_text("brands/x/brand.md", "---\nname: X\n---\n")
    post = lambda h, code, views: {"source": "organic", "handle": h, "platform": "instagram", "views": views,
                                   "comments": 5, "url": f"https://www.instagram.com/reel/{code}/", "score": 75}
    ads = {"in-a": post("jen", "a", 900), "in-b": post("tom", "b", 500)}
    s.write_text("brands/x/ads.json", json.dumps({"brand": "x", "ads": ads}))
    s.write_text("brands/x/voc.json", json.dumps({"brand": "x", "quotes": [
        {"text": "I made 10k in my first month", "source": "testimonial", "about": "X"}]}))
    return s


def test_comments_land_in_voc_and_split_by_segment(tmp_path):
    s = _setup(tmp_path)
    got = organic.pull_comments(s, "x", ["jen"], source=FakeComments())
    assert got == {"jen": 1, "credits": 1}
    again = organic.pull_comments(s, "x", ["jen"], source=FakeComments())  # already pulled: skipped
    assert again["credits"] == 0
    quotes = json.loads(s.read_text("brands/x/voc.json"))["quotes"]
    assert [q["source"] for q in quotes] == ["testimonial", "comment"]
    seg = {"key": "her", "label": "Women", "who": "", "handles": ["jen"]}
    v = research.segment_values(s, "x", seg, {"audience": "everyone"})
    assert "scam" in v["voc_json"] and "10k" in v["voc_json"] and "/reel/a/" in v["ads_json"]
    assert "/reel/b/" not in v["ads_json"] and v["audience"] == "Women"
    v2 = research.segment_values(s, "x", {**seg, "handles": ["tom"]}, {})
    assert "scam" not in v2["voc_json"]
