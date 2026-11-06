import json
from datetime import date
from types import SimpleNamespace

from cse import tracking
from cse.storage import LocalStorage


def ad(ad_id, start, cid=None):
    return {"ad_id": ad_id, "page_id": "9", "page_name": "Pep AI", "start_date": start, "end_date": None,
            "is_active": True, "platforms": [], "body": "", "headline": "", "cta": "", "link": "",
            "media_type": "video", "media_url": f"https://x/{ad_id}.mp4", "thumbnail_url": None,
            "versions": 1, "collation_id": cid or ad_id, "ad_library_url": ""}


class Source:
    """Returns whatever top list the test sets, most impressions first."""
    credits_used = 0

    def __init__(self):
        self.ads = []

    def fetch_ads(self, page_id, max_pages=1, status="ALL"):
        assert status == "ACTIVE" and max_pages in (1, tracking.PAGES)
        self.credits_used += 1
        return list(self.ads)


class Session:
    def get(self, url, timeout):
        return SimpleNamespace(content=b"v", raise_for_status=lambda: None)


def setup(tmp_path):
    storage = LocalStorage(tmp_path)
    storage.write_text("brands/pp/competitors.json", json.dumps({"competitors": [
        {"name": "Pep AI", "ring": "direct", "status": "approved", "fb_page_id": "9"},
        {"name": "No page", "ring": "direct", "status": "approved", "fb_page_id": "none"},
    ]}))
    return storage


def test_baseline_then_entered_breakout_and_back(tmp_path):
    storage, src = setup(tmp_path), Source()
    legacy = [ad(str(i), "2025-01-01") for i in range(1, 11)]
    src.ads = legacy + [ad("99", "2026-10-01")]  # 11th: in the top 50, not the top 10
    s1 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 20))
    assert (s1["advertisers"], s1["skipped"], s1["breakouts"], s1["entered"]) == (1, 1, 0, 0)  # baseline
    saved = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]
    assert saved["99"]["top50_rank"] == 11 and not saved["99"].get("top10_rank")

    # Day 2: a 10-day-old ad enters at #2 (just entered, not a breakout yet), an old one comes back
    # at #5, two versions count once.
    src.ads = [legacy[0], ad("50", "2026-10-11"), ad("51", "2026-10-11", cid="50"), *legacy[1:3],
               ad("60", "2025-06-01"), *legacy[3:], ad("99", "2026-10-01")]
    s2 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 21))
    assert (s2["entered"], s2["breakouts"], s2["back"]) == (1, 0, 1)
    saved = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]
    assert saved["50"]["top10_entered"] == "2026-10-21" and "breakout" not in saved["50"]
    assert saved["60"]["top10_back"] == "2026-10-21"
    assert saved["1"]["top10_days"] == 2 and saved["1"]["top10_since"] == "2026-10-20"
    assert saved["10"]["top10_rank"] is None and saved["10"]["top50_rank"] == 12  # out of the top 10, still in the 50
    assert "51" not in saved
    assert s2["new_ids"] == ["60"]  # nothing to take apart for a fresh entry yet

    # Day 3: still there. Day 4: its third day in the top 10 makes it a breakout, once.
    tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 22))
    s4 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 23))
    assert s4["breakouts"] == 1 and s4["new_ids"] == ["50"]
    assert json.loads(storage.read_text("brands/pp/ads.json"))["ads"]["50"]["breakout"] == "2026-10-23"
    s5 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 24))
    assert (s5["breakouts"], s5["back"], s5["entered"]) == (0, 0, 0)


def test_climbing_needs_days_not_a_launch(tmp_path):
    storage, src = setup(tmp_path), Source()
    base = [ad(str(i), "2025-01-01") for i in range(1, 41)]
    src.ads = base
    tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 20))
    # a launch lands at #1 on day one: not climbing
    src.ads = [ad("L", "2026-10-21"), *base[:30], ad("C", "2026-10-10"), *base[30:]]  # C enters at #32
    s = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 21))
    assert s["climbing"] == 0
    # next day C jumps from #32 to #12 and keeps going: climbing
    src.ads = [ad("L", "2026-10-21"), *base[:10], ad("C", "2026-10-10"), *base[10:]]
    s = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 22))
    assert s["climbing"] == 1 and "C" in s["new_ids"]
    c = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]["C"]
    assert c["climb"] == {"from": 32, "to": 12, "days": 1} and c["rank_history"]["2026-10-22"] == 12
    # it stops running: we saw every live ad (under 50), so it's marked stopped
    src.ads = [ad("L", "2026-10-21"), *base]
    s = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 23))
    assert s["stopped"] == 1
    assert json.loads(storage.read_text("brands/pp/ads.json"))["ads"]["C"]["top50_out"] == "2026-10-23"
