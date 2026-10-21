import json
from datetime import date

from cse import formats, organic
from cse.score import winner_score
from cse.storage import LocalStorage


def post(code, views, handle="dizznem", own="1"):
    return {"handle": handle, "own": own, "code": code, "views": str(views), "date": "2026-10-10",
            "caption": "c", "cover_text": "hook", "secs": "7"}


def test_organic_grade_is_views_vs_the_accounts_usual():
    assert organic.grade_ratio(5.0) == "A"
    assert organic.grade_ratio(2.0) == "B"
    assert organic.grade_ratio(1.0) == "C"
    assert organic.grade_ratio(0.9) == "D"
    score, why = organic.organic_score({"handle": "x", "views": 62165, "usual_views": 1500})
    assert score == 100 and why.startswith("Grade A: 62,165 views, 41.4x @x's usual 1,500")
    # under 10,000 views isn't a breakout, however far it beats a small account: stops at C
    score, why = organic.organic_score({"handle": "x", "views": 3878, "usual_views": 263})
    assert score == 50 and "under 10,000 views" in why
    # the brand can move the bar
    assert organic.organic_score({"handle": "x", "views": 3878, "usual_views": 263, "min_views": 2000})[0] == 100
    # winner_score hands organic posts to the organic grade
    assert winner_score({"source": "organic", "handle": "x", "views": 900, "usual_views": 1000},
                        date(2026, 10, 20))[0] == 25


def test_import_posts_merges_regrades_and_keeps_breakdowns(tmp_path):
    s = LocalStorage(tmp_path)
    s.write_text("brands/aicl/brand.md", "---\nname: AI Creator Lab\n---\n")
    posts = [post("A1", 62165), post("A2", 1500), post("A3", 2000), post("A4", 1000),
             post("N1", 3000, "tommycetty", "0")]
    assert organic.import_posts(s, "aicl", posts, date(2026, 10, 20)) == {"added": 5, "updated": 0}
    ads = json.loads(s.read_text("brands/aicl/ads.json"))["ads"]
    top = ads["in-A1"]
    assert top["source"] == "organic" and top["is_own"] and top["usual_views"] == 1750
    assert top["score"] == 100 and top["url"] == "https://www.instagram.com/reel/A1/"
    assert top["days_running"] == 10 and top["promotes"] == "AI Creator Lab"
    assert ads["in-N1"]["ring"] == "niche" and not ads["in-N1"]["is_own"]

    ads["in-A1"]["breakdown"] = {"hook_line": "x"}
    s.write_text("brands/aicl/ads.json", json.dumps({"brand": "aicl", "ads": ads}))
    organic.import_posts(s, "aicl", [post("A1", 70000)], date(2026, 10, 21))
    again = json.loads(s.read_text("brands/aicl/ads.json"))["ads"]["in-A1"]
    assert again["breakdown"] == {"hook_line": "x"} and again["views"] == 70000
    assert again["first_seen"] == "2026-10-20"


def test_read_table_takes_tsv_or_csv():
    assert organic.read_table("handle\tcode\tviews\nx\tA\t5\n") == [{"handle": "x", "code": "A", "views": "5"}]
    assert organic.read_table("handle,code,views\nx,A,5\n")[0]["code"] == "A"


def test_talking_head_format():
    assert formats.check("talking") == "talking" and formats.check("organic") == "talking"
    assert "soft call to action" in formats.describe("talking")


class FakeSource:
    credits_used = 0

    def fetch_posts(self, platform, handle, max_pages=8):
        self.credits_used += 1
        views = {"instagram": [50000, 1000, 1200, 900, 1100], "youtube": [90000, 10000, 10000]}[platform]
        return [{"platform": platform, "handle": handle, "code": f"{handle}{i}", "views": v,
                 "date": "2026-10-01", "caption": "c", "secs": 20,
                 "media_url": "" if platform == "youtube" else f"https://x/{i}.mp4"}
                for i, v in enumerate(views)]

    def youtube_transcript(self, url):
        return [{"start": 0.0, "end": 2.0, "text": "nobody tells you this"}]


def test_pull_grades_accounts_and_fetches_only_the_winners(tmp_path, monkeypatch):
    from cse import ads as adslib
    s = LocalStorage(tmp_path)
    s.write_text("brands/aicl/brand.md", "---\nname: AICL\norganic_accounts: ['instagram:reedo.io:own', "
                                         "'youtube:tommycetty']\n---\n")
    got = []
    monkeypatch.setattr(adslib, "download_media",
                        lambda storage, slug, ad, session: (got.append(ad["ad_id"]),
                                                            ad.update(media_key=f"media/{ad['ad_id']}.mp4")))
    summary = organic.pull(s, "aicl", FakeSource(), today=date(2026, 10, 20))
    assert summary["added"] == 8 and summary["credits_used"] == 2
    assert got == ["in-reedo.io0", "in-reedo.io2"]  # the breakout, plus our creator's next best
    ads = json.loads(s.read_text("brands/aicl/ads.json"))["ads"]
    assert ads["in-reedo.io0"]["is_own"] and ads["in-reedo.io0"]["media_key"]
    yt = ads["yo-tommycetty0"]
    assert yt["analysis"]["hook_line"] == "nobody tells you this" and yt["url"].endswith("/shorts/tommycetty0")


def test_comments_per_view_move_the_grade_one_step():
    base = {"handle": "x", "views": 30000, "usual_views": 10000, "usual_comment_rate": 0.002}
    assert organic.organic_score({**base, "comments": 60})[0] == 75   # 3x usual (B), normal comments
    assert organic.organic_score({**base, "comments": 200})[0] == 100  # comments 3.3x usual: up to A
    score, why = organic.organic_score({**base, "comments": 20})      # 0.07%, a third of usual
    assert score == 50 and "(down one)" in why
    assert organic.organic_score({**base, "comments": 5})[0] == 75    # under 10 comments: no move


def test_posts_before_organic_since_are_dropped(tmp_path):
    s = LocalStorage(tmp_path)
    s.write_text("brands/aicl/brand.md", "---\nname: AICL\norganic_since: '2026-04-01'\n---\n")
    old = {**post("OLD", 900000), "date": "2025-01-05"}
    organic.import_posts(s, "aicl", [old, post("NEW", 1000)], date(2026, 10, 20))
    ads = json.loads(s.read_text("brands/aicl/ads.json"))["ads"]
    assert list(ads) == ["in-NEW"]
