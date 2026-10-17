from cse import brand as brandlib
from cse.setup import fill


def test_fill_writes_empty_fields_only_and_keeps_comments():
    md = brandlib.render_template("acme").replace('product: ""', 'product: "rocket skates"')
    out = fill(md, {
        "product": "something else",
        "audience": 'coyotes who "need" speed',
        "communities": ["r/roadrunner"],
        "health_product": True,
        "offer": "",
    })
    fields, notes = brandlib.parse(out)
    assert fields["product"] == "rocket skates"          # user's value kept
    assert fields["audience"] == 'coyotes who "need" speed'
    assert fields["communities"] == ["r/roadrunner"]
    assert fields["health_product"] is True
    assert fields["offer"] == ""
    assert "# who buys it, in plain words" in out          # template comment kept
    assert notes.startswith("\n# acme") or "# acme" in notes
