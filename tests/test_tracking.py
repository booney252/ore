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
        assert status == "ACTIVE" and max_pages == 1
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


def test_baseline_then_breakout_and_back(tmp_path):
    storage, src = setup(tmp_path), Source()
    legacy = [ad(str(i), "2025-01-01") for i in range(1, 11)]
    src.ads = legacy + [ad("99", "2026-10-01")]  # 11th is cut: top 10 only
    s1 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 20))
    assert (s1["advertisers"], s1["skipped"], s1["breakouts"]) == (1, 1, 0)  # baseline: nothing flags

    # Day 2: a 10-day-old ad breaks in at #2, an old one comes back at #5, two versions count once.
    src.ads = [legacy[0], ad("50", "2026-10-11"), ad("51", "2026-10-11", cid="50"), *legacy[1:3],
               ad("60", "2025-06-01"), *legacy[3:]]
    s2 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 21))
    assert (s2["breakouts"], s2["back"]) == (1, 1)

    saved = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]
    assert saved["50"]["breakout"] == "2026-10-21" and saved["50"]["top10_rank"] == 2
    assert saved["60"]["top10_back"] == "2026-10-21" and "breakout" not in saved["60"]
    assert saved["1"]["top10_days"] == 2 and saved["1"]["top10_since"] == "2026-10-20"
    assert saved["10"]["top10_rank"] is None  # pushed out of the top 10
    assert "51" not in saved
    snap = json.loads(storage.read_text("brands/pp/tracking/2026-10-21.json"))
    assert [m["ad_id"] for m in snap["moves"]] == ["50", "60"]

    # Day 3: same list again, nothing new flags a second time.
    s3 = tracking.run(storage, "pp", source=src, session=Session(), today=date(2026, 10, 22))
    assert (s3["breakouts"], s3["back"]) == (0, 0)
