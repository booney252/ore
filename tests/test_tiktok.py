import time

from cse import tiktok


def post(code, views, hours, handle="a", product=None, angle=None, fmt=None):
    now = time.time()
    p = {"code": code, "views": views, "ts": now - hours * 3600, "handle": handle,
         "age_h": hours}
    if product or angle or fmt:
        p["read"] = {"product": product or "", "angle": angle or "", "format": fmt or ""}
    return p


def test_usual_uses_posts_a_day_old():
    now = time.time()
    posts = [post("1", 1000, 30), post("2", 800, 40), post("3", 1200, 50), post("4", 90000, 2)]
    assert tiktok.score(posts, now) == 1000


def test_breakout_needs_5x_and_3k_and_the_right_age():
    now = time.time()
    posts = [post("a", 6000, 30), post("b", 4000, 30), post("c", 9000, 5), post("d", 9000, 200)]
    assert [p["code"] for p in tiktok.breakouts(posts, 1000, now)] == ["a"]
    assert tiktok.breakouts([post("e", 2900, 30)], 100, now) == []


def test_same_product_matches_short_name():
    assert tiktok.same_product("RoC Lip Volumizer", "RoC Derm Correxion Lip Volumizer")
    assert not tiktok.same_product("RoC Lip Volumizer", "Laka blush balm")


def test_alerts_need_two_accounts():
    breaks = [post("1", 9000, 30, "x", "DR.DENT whitening strips"),
              post("2", 9000, 30, "y", "Dr.Dent Whitening Strips"),
              post("3", 9000, 30, "z", "Laka blush")]
    got = tiktok.alerts(breaks)
    assert len(got) == 1 and got[0]["accounts"] == ["x", "y"]


def test_lineup_status_rules():
    own = [{**post(str(i), 4000 if i < 2 else 300, 50, product="Lip Shot"), "x": 1} for i in range(5)]
    assert tiktok.lineup_status({"name": "Lip Shot"}, own)["status"] == "hot"
    flops = [{**post(str(i), 400, 50, product="Neuro gum"), "x": 1} for i in range(15)]
    assert tiktok.lineup_status({"name": "Neuro gum"}, flops)["status"] == "cut"
    assert tiktok.lineup_status({"name": "New thing"}, flops)["status"] == "testing"


def test_kalodata_grade():
    from cse import kalodata
    hot = {"revenue": 140000, "revenue_growth_rate": 120, "video_revenue": 130000, "commission_rate": "15%"}
    assert kalodata.grade(hot)[0] == "A"
    live = {"revenue": 140000, "revenue_growth_rate": -5, "video_revenue": 10000, "commission_rate": 0.08}
    assert kalodata.grade(live)[0] == "F"
