import json

import pytest

from cse import teardown
from cse.storage import LocalStorage


def ad(i, brand, rank, days, media=True, **kw):
    return {"ad_id": str(i), "brand": brand, "top10_rank": rank, "days_running": days,
            "media_key": f"m/{i}.mp4" if media else None, **kw}


def test_pick_prefers_new_ads_one_per_competitor():
    ads = {a["ad_id"]: a for a in [
        ad(1, "A", 1, 200),      # old: last resort
        ad(2, "A", 2, 5),        # new
        ad(3, "A", 3, 9),        # new, same brand: after the other brands
        ad(4, "B", 5, 12),       # new
        ad(5, "C", 1, 40),       # not new
        ad(6, "D", 4, 3, media=False),  # no media: skipped
        ad(7, "E", None, 2),     # not in a top 10
    ]}
    assert teardown.pick(ads, n=3) == ["2", "4", "3"]


def test_pick_fills_with_youngest_when_few_are_new():
    ads = {a["ad_id"]: a for a in [ad(1, "A", 1, 200), ad(2, "B", 2, 45), ad(3, "C", 3, 8)]}
    assert teardown.pick(ads, n=3) == ["3", "2", "1"]


def test_card_uses_breakdown_and_first_frame():
    a = ad(9, "Monarch", 2, 6, via_page_name="Jess Saves", ad_library_url="https://x",
           analysis={"frames": [{"key": "f0.jpg"}], "hook_line": "spoken"},
           breakdown={"hook_spoken": "Nobody told me", "why_it_works": "It names the gap.",
                      "load_bearing": [{"element": "Hook", "what": "callout", "why": "x"}] * 4})
    c = teardown.card(a)
    assert c["hook"] == "Nobody told me" and c["frame"] == "f0.jpg" and c["via"] == "Jess Saves"
    assert c["rank"] == 2 and c["broken_down"] and len(c["elements"]) == 3


def test_report_key_rejects_bad_tokens():
    with pytest.raises(ValueError):
        teardown.report_key("../leads/x")
    assert teardown.report_key("a" * 32) == f"teardowns/{'a' * 32}.json"


def test_month_spend_counts_only_teardown_brands(tmp_path):
    s = LocalStorage(tmp_path)
    s.write_text("usage/2026-11/td-123/a.json", json.dumps({"cost": 1.25}))
    s.write_text("usage/2026-11/td-456/b.json", json.dumps({"cost": 0.75}))
    s.write_text("usage/2026-11/peptidepal/c.json", json.dumps({"cost": 9}))
    assert teardown.month_spend(s, "2026-11") == pytest.approx(2.0)


def test_daily_promotes_waitlist_up_to_the_cap(tmp_path, monkeypatch):
    from datetime import date

    s = LocalStorage(tmp_path)
    monkeypatch.setattr(teardown, "DAILY_CAP", 2)
    for i in range(3):
        tok = f"{i:032x}"
        s.write_text(f"teardowns/{tok}.json", json.dumps(
            {"token": tok, "status": "waitlist", "at": f"2026-11-0{i + 1}", "app": {"id": "111"}, "email": "a@b.co"}))
    out = teardown.daily(s, today=date(2026, 11, 6))
    assert out["promoted"] == 2
    statuses = [json.loads(s.read_text(f"teardowns/{i:032x}.json"))["status"] for i in range(3)]
    assert statuses == ["queued", "queued", "waitlist"]
    assert len([k for k in s.list("jobs/pending/") if k.endswith(".json")]) == 2
    assert teardown.daily(s, today=date(2026, 11, 6)) is None  # once a day
