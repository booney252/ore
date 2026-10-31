from cse.stages import clean_cards, report_overview


def test_clean_cards_keeps_real_ranks_and_limits():
    raw = {"patterns": [{"title": f"P{i}", "why": "w", "ranks": [1, 99, "2"], "example": "e", "idea": "i"}
                        for i in range(5)],
           "gaps": [{"title": "G", "ranks": []}, {"title": ""}, {"title": "G2"}, {"title": "G3"}]}
    out = clean_cards(raw, {1, 2, 3})
    assert len(out["patterns"]) == 3 and out["patterns"][0]["ranks"] == [1, 2]
    assert [g["title"] for g in out["gaps"]] == ["G", "G2"]


def test_clean_cards_handles_junk():
    assert clean_cards([], {1}) == {"patterns": [], "gaps": []}


def test_report_overview_skips_lanes():
    md = "# R\n## 1. The big picture\nA\n## 2. The lanes\n#### 1. ad\nB\n## 3. Gaps\nC\n"
    out = report_overview(md)
    assert "A" in out and "C" in out and "#### 1. ad" not in out
