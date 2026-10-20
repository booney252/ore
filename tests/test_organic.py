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
    # too few views to call: stops at C
    score, why = organic.organic_score({"handle": "x", "views": 378, "usual_views": 160})
    assert score == 50 and "capped at C" in why
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
