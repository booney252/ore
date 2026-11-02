from cse.ads import _site_root, find_page


class FakeSource:
    def __init__(self, pages, ads):
        self.pages, self.ads, self.fetched = pages, ads, []

    def find_pages(self, name):
        return self.pages

    def fetch_ads(self, page_id, max_pages=1):
        self.fetched.append(page_id)
        return self.ads.get(page_id, [])


def test_site_root():
    assert _site_root("https://www.tryatria.com/pricing") == "tryatria"
    assert _site_root("foreplay.co") == "foreplay"
    assert _site_root("") == ""


def test_picks_the_page_whose_ads_link_to_the_site_over_a_bigger_namesake():
    pages = [{"page_id": "1", "name": "Atria", "likes": 90000}, {"page_id": "2", "name": "Atria", "likes": 800}]
    ads = {"1": [{"link": "https://atriamall.com/sale"}], "2": [{"link": "https://www.tryatria.com/?utm=fb"}]}
    page, got, how = find_page(FakeSource(pages, ads), "Atria", "https://www.tryatria.com")
    assert page["page_id"] == "2" and how == "verified" and got == ads["2"]


def test_without_a_site_keeps_the_first_page_that_has_ads():
    pages = [{"page_id": "1", "name": "Creatify", "likes": 500}, {"page_id": "2", "name": "Creatify AI", "likes": 100}]
    page, _, how = find_page(FakeSource(pages, {"2": [{"link": "x"}]}), "Creatify")
    assert page["page_id"] == "2" and how == "auto"


def test_no_name_match_means_no_page():
    page, _, _ = find_page(FakeSource([{"page_id": "1", "name": "Cristiano Ronaldo"}], {}), "Ro")
    assert page is None


def test_with_a_site_never_takes_an_unverified_lookalike():
    pages = [{"page_id": "1", "name": "Atria", "likes": 10}, {"page_id": "2", "name": "Atria Books", "likes": 5000}]
    page, got, how = find_page(FakeSource(pages, {"2": [{"link": "https://atriabooks.com"}]}), "Atria", "https://www.tryatria.com")
    assert page["page_id"] == "1" and got == [] and how == "unverified"
