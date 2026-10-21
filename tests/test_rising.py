from datetime import date, timedelta

from cse.score import regrade_paid
from cse.stages import balance_rising

TODAY = date(2026, 10, 21)


def ad(brand, start, active=True, end=None, versions=1, **kw):
    return {"brand": brand, "start_date": start, "is_active": active, "end_date": end,
            "versions": versions, **kw}


def stopped_after(brand, days, n=5):
    end = (date(2026, 1, 1) + timedelta(days=days)).isoformat()
    return [ad(brand, "2026-01-01", False, end) for _ in range(n)]


def test_new_ad_outliving_its_advertisers_usual_is_rising():
    ads = stopped_after("Sculptique", 6) + [ad("Sculptique", "2026-10-01")]  # 20 days, usual 6
    regrade_paid(ads, TODAY)
    new = ads[-1]
    assert new["usual_days"] == 6 and new["rising"]
    assert new["score_why"].startswith("Grade B (rising)") and "stop by day 6" in new["score_why"]


def test_rising_needs_a_week_and_both_signals_make_an_a():
    ads = stopped_after("GLP1SOS", 1) + [ad("GLP1SOS", "2026-10-17"), ad("GLP1SOS", "2026-10-11", versions=6)]
    regrade_paid(ads, TODAY)
    assert not ads[-2]["rising"]  # 4 days: under a week, still D
    assert ads[-1]["rising"] and ads[-1]["score_why"].startswith("Grade A (rising)")


def test_slow_advertisers_and_stopped_ads_dont_rise():
    ads = stopped_after("BBCO", 130) + [ad("BBCO", "2026-09-26"), ad("Other", "2026-10-01", versions=1)]
    ads.append(ad("BBCO", "2026-09-01", False, "2026-09-25", versions=8))
    regrade_paid(ads, TODAY)
    assert not ads[-3]["rising"] and not ads[-2]["rising"] and not ads[-1]["rising"]


def test_report_keeps_room_for_rising_ads():
    old = [{"ad_id": str(i), "score": 75, "days_running": 100 - i} for i in range(10)]
    pool = old + [{"ad_id": f"r{i}", "score": 75, "days_running": 20, "rising": True} for i in range(5)]
    top = balance_rising(old, pool)
    assert len(top) == 10 and sum(a.get("rising", False) for a in top) == 3
    assert {"7", "8", "9"}.isdisjoint(a["ad_id"] for a in top)  # the lowest-ranked made room
