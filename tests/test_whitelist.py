from datetime import date

from cse import whitelist


def test_domain():
    assert whitelist.domain("https://go.motionapp.com/benchmarks-paid") == "motionapp.com"
    assert whitelist.domain("www.tryatria.com") == "tryatria.com"
    assert whitelist.domain("https://shop.brand.co.uk/x") == "brand.co.uk"
    assert whitelist.domain("") == ""


def test_matches_site_or_app_only():
    assert whitelist.matches({"link": "https://go.motionapp.com/x"}, "motionapp.com", [])
    assert not whitelist.matches({"link": "https://www.tryatria.com/"}, "motionapp.com", [])
    assert whitelist.matches({"link": "https://apps.apple.com/us/app/pep-ai/id6758682710"}, "", ["6758682710"])
    assert not whitelist.matches({"link": "https://apps.apple.com/us/app/other/id111111111"}, "", ["6758682710"])
    assert not whitelist.matches({"link": "https://linktr.ee/x"}, "linktr.ee", [])  # generic hosts never match


class FakeSource:
    def __init__(self, results):
        self.results, self.queries = results, []

    def search_ads(self, q, max_pages=1):
        self.queries.append(q)
        return self.results


def ad(ad_id, page_id, page_name, link):
    return {"ad_id": ad_id, "page_id": page_id, "page_name": page_name, "link": link, "body": ad_id,
            "headline": "", "media_url": None, "collation_id": ad_id, "start_date": "2026-10-01",
            "end_date": None, "is_active": True, "versions": 1}


def test_find_keeps_creator_pages_only():
    comp = {"name": "Motion", "website": "https://motionapp.com", "fb_page_id": "1"}
    src = FakeSource([ad("a", "1", "Motion", "https://motionapp.com/x"),            # own page: skip
                      ad("b", "2", "Stormie Captures", "https://go.motionapp.com/y"),  # whitelisted
                      ad("c", "3", "Atria AI", "https://www.tryatria.com/")])          # mentions only
    out = whitelist.find(src, comp, date(2026, 11, 3))
    assert [a["ad_id"] for a in out] == ["b"]
    assert out[0]["whitelisted"] and out[0]["via_page_name"] == "Stormie Captures"
    assert src.queries == ["motionapp.com"]
    pages = whitelist.remember(comp, out, date(2026, 11, 3))
    assert pages[0]["page_id"] == "2" and pages[0]["name"] == "Stormie Captures"


def test_app_brands_search_by_name():
    comp = {"name": "Pep AI", "website": "https://pepaiapp.com/",
            "app_store_url": "https://apps.apple.com/us/app/pep-ai/id6758682710"}
    assert whitelist.queries(comp) == ["pepaiapp.com", "Pep AI"]


def test_own_page_by_name_is_not_whitelisted():
    comp = {"name": "Atria", "website": "https://www.tryatria.com", "fb_page_id": "9", "fb_page_match": "unverified"}
    src = FakeSource([ad("a", "5", "Atria AI", "https://www.tryatria.com/"),
                      ad("b", "6", "Some Creator", "https://tryatria.com/x")])
    out = whitelist.find(src, comp, date(2026, 11, 3))
    own = [a for a in out if a.get("own_page")]
    wl = [a for a in out if a.get("whitelisted")]
    assert [a["ad_id"] for a in own] == ["a"] and [a["ad_id"] for a in wl] == ["b"]
    assert whitelist.fix_page(comp, out) and comp["fb_page_id"] == "5" and comp["fb_page_match"] == "verified"
    assert [p["name"] for p in whitelist.remember(comp, out, date(2026, 11, 3))] == ["Some Creator"]
