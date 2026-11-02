from cse.voc import from_citations


def test_keeps_cited_review_text_and_drops_short_or_own_site():
    cites = [
        {"text": "Foreplay saved our team hours every week but the boards get messy fast", "url": "https://www.g2.com/products/foreplay/reviews", "title": "Foreplay Reviews"},
        {"text": "great tool", "url": "https://www.g2.com/x", "title": ""},
        {"text": "Ore helps brands write a brief for every creator in their own voice", "url": "https://ore.app/", "title": "Ore"},
        {"text": "Foreplay saved our team hours every week but the boards get messy fast", "url": "https://www.g2.com/products/foreplay/reviews", "title": "dup"},
    ]
    out = from_citations(cites, ["Foreplay", "Motion"], own_site="https://ore.app")
    assert len(out) == 1
    assert out[0]["source"] == "web:g2.com" and out[0]["about"] == "Foreplay" and out[0]["url"].startswith("https://www.g2.com")
