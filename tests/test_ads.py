import json
from datetime import date
from types import SimpleNamespace

from cse import ads
from cse.adsource import normalize_scrapecreators
from cse.score import letter, winner_score
from cse.storage import LocalStorage

TODAY = date(2026, 10, 16)

RAW = {
    "ad_archive_id": "111", "page_id": "9", "page_name": "Pep AI", "is_active": True,
    "start_date": 1756684800,  # 2025-09-01
    "end_date": 1760572800, "publisher_platform": ["FACEBOOK", "INSTAGRAM"],
    "collation_count": 6, "collation_id": "c1",
    "snapshot": {"body": {"text": " Track every dose "}, "title": "Pep AI", "cta_text": "Install now",
                 "link_url": "https://apps.apple.com/x",
                 "videos": [{"video_hd_url": "https://v/hd.mp4", "video_sd_url": "https://v/sd.mp4",
                             "video_preview_image_url": "https://v/p.jpg"}],
                 "images": []},
}


def test_normalize_scrapecreators():
    ad = normalize_scrapecreators(RAW)
    assert ad["ad_id"] == "111"
    assert ad["start_date"] == "2025-09-01"
    assert ad["media_type"] == "video" and ad["media_url"] == "https://v/hd.mp4"
    assert ad["body"] == "Track every dose"
    assert ad["versions"] == 6
    assert ad["ad_library_url"].endswith("id=111")


def test_normalize_image_and_empty():
    img = normalize_scrapecreators({"ad_archive_id": "2", "snapshot": {
        "images": [{"original_image_url": "https://i/1.jpg"}]}})
    assert (img["media_type"], img["media_url"]) == ("image", "https://i/1.jpg")
    none = normalize_scrapecreators({"ad_archive_id": "3", "snapshot": {}})
    assert none["media_type"] == "none" and none["start_date"] is None


def test_winner_score_explains_itself():
    score, why = winner_score({"start_date": "2026-08-30", "is_active": True, "versions": 6}, TODAY)
    assert why == "Grade A: running 47 days (B), still active, 6 versions (up one)."
    assert score == 100 and letter(score) == "A"


def test_winner_score_inactive_uses_end_date_and_caps():
    score, why = winner_score({"start_date": "2025-01-01", "end_date": "2025-12-31",
                               "is_active": False, "versions": 40}, TODAY)
    assert why == "Grade A: running 364 days (A), stopped 2025-12-31 (down one), 40 versions (up one)."
    assert winner_score({"versions": 1}, TODAY) == (0, "Grade F: running 0 days (D), stopped None (down one), 1 version.")


def test_grade_cutoffs():
    grade = lambda ad: letter(winner_score(ad, TODAY)[0])
    assert grade({"start_date": "2026-03-26", "is_active": True, "versions": 1}) == "A"  # 204 days, 1 version
    assert grade({"start_date": "2026-08-01", "is_active": True, "versions": 2}) == "B"
    assert grade({"start_date": "2026-09-25", "is_active": True, "versions": 1}) == "C"
    assert grade({"start_date": "2026-10-14", "is_active": True, "versions": 1}) == "D"
    assert grade({"start_date": "2026-10-01", "end_date": "2026-10-05", "is_active": False}) == "F"
    assert letter(0) == "F" and letter(100) == "A"


def test_pick_page_prefers_exact_name():
    cands = [{"page_id": "1", "name": "Shotsy Fans", "likes": 9000},
             {"page_id": "2", "name": "Shotsy", "likes": 50}]
    assert ads.pick_page("Shotsy", cands)["page_id"] == "2"
    assert ads.pick_page("Nope", []) is None
    assert ads.pick_page("Ro", [{"page_id": "3", "name": "Cristiano Ronaldo", "likes": 10**8}]) is None


def test_dedupe_keeps_best_version():
    a = {"ad_id": "1", "collation_id": "c", "is_active": False, "start_date": "2026-01-01",
         "end_date": "2026-02-01"}
    b = {"ad_id": "2", "collation_id": "c", "is_active": True, "start_date": "2026-09-01"}
    c = {"ad_id": "3", "collation_id": "", "is_active": True, "start_date": "2026-09-01"}
    out = {x["ad_id"] for x in ads.dedupe_creatives([a, b, c], TODAY)}
    assert out == {"2", "3"}


class FakeSource:
    credits_used = 0

    def find_pages(self, name):
        self.credits_used += 1
        return [{"page_id": "9", "name": name, "likes": 1}]

    def fetch_ads(self, page_id, max_pages=1):
        self.credits_used += 1
        return [normalize_scrapecreators(RAW)]


class FakeSession:
    def __init__(self):
        self.calls = 0

    def get(self, url, timeout):
        self.calls += 1
        return SimpleNamespace(content=b"video-bytes", raise_for_status=lambda: None)


def test_run_pulls_scores_downloads_and_is_incremental(tmp_path):
    storage = LocalStorage(tmp_path)
    storage.write_text("brands/pp/competitors.json", json.dumps({"competitors": [
        {"name": "Pep AI", "ring": "direct", "status": "approved"},
        {"name": "Gone", "ring": "direct", "status": "removed"},
    ]}))
    session = FakeSession()
    s1 = ads.run(storage, "pp", source=FakeSource(), session=session, today=TODAY)
    assert (s1["creatives"], s1["new"], s1["media_downloaded"]) == (1, 1, 1)
    assert storage.read_bytes("brands/pp/media/111.mp4") == b"video-bytes"

    saved = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]["111"]
    assert saved["brand"] == "Pep AI" and saved["score_why"].startswith("Grade ") and "running 410 days" in saved["score_why"]
    comps = json.loads(storage.read_text("brands/pp/competitors.json"))["competitors"]
    assert comps[0]["fb_page_id"] == "9" and comps[0]["fb_page_match"] == "auto"

    saved["breakdown"] = {"hook": "kept"}
    storage.write_text("brands/pp/ads.json", json.dumps({"ads": {"111": saved}}))
    s2 = ads.run(storage, "pp", source=FakeSource(), session=session, today=TODAY)
    assert s2["new"] == 0 and session.calls == 1  # no re-download
    again = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]["111"]
    assert again["breakdown"] == {"hook": "kept"}


class VerifySource:
    credits_used = 0

    def get_ad(self, ad_id):
        return None if ad_id == "gone" else {"is_active": False, "end_date": "2026-10-15"}


def test_verify_marks_removed_and_stopped(tmp_path):
    storage = LocalStorage(tmp_path)
    base = {"start_date": "2026-08-01", "is_active": True, "versions": 1, "brand": "X"}
    storage.write_text("brands/pp/ads.json", json.dumps({"ads": {
        "gone": {**base, "ad_id": "gone"}, "off": {**base, "ad_id": "off"}}}))
    out = ads.verify(storage, "pp", ["gone", "off"], source=VerifySource(), today=TODAY)
    assert out == {"removed": 1, "changed": 1}
    saved = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]
    assert saved["gone"]["removed_from_library"] == "2026-10-16"
    assert "removed from the Ad Library 2026-10-16" in saved["gone"]["score_why"]
    assert saved["off"]["is_active"] is False and saved["off"]["end_date"] == "2026-10-15"


def test_own_ads_need_a_page_id():
    from cse.ads import _own_entry
    assert _own_entry({"name": "Solis", "facebook_page_id": ""}) is None
    assert _own_entry({"name": "PeptidePal", "facebook_page_id": "1196136163591767"})["fb_page_id"] == "1196136163591767"


def test_save_fields_keeps_ads_added_by_another_run(tmp_path):
    import json
    from cse.ads import save_fields
    from cse.storage import LocalStorage
    s = LocalStorage(tmp_path)
    key = "brands/acme/ads.json"
    s.write_text(key, json.dumps({"ads": {"1": {"ad_id": "1"}}}))
    # another run adds ad 2 while a long creative run is still holding its old copy
    s.write_text(key, json.dumps({"ads": {"1": {"ad_id": "1"}, "2": {"ad_id": "2"}}}))
    save_fields(s, "acme", "1", {"analysis": {"length_s": 9}})
    ads = json.loads(s.read_text(key))["ads"]
    assert ads["1"]["analysis"] == {"length_s": 9} and "2" in ads


def test_page_save_keeps_competitors_added_meanwhile(tmp_path):
    import json
    from cse.ads import _save_pages
    from cse.storage import LocalStorage
    s = LocalStorage(tmp_path)
    key = "brands/acme/competitors.json"
    s.write_text(key, json.dumps({"competitors": [{"name": "Brick"}, {"name": "Opal"}]}))
    _save_pages(s, key, [{"name": "Brick", "fb_page_id": "110679378676446", "fb_page_name": "Brick"}])
    comps = {c["name"]: c for c in json.loads(s.read_text(key))["competitors"]}
    assert comps["Brick"]["fb_page_id"] == "110679378676446" and "Opal" in comps
