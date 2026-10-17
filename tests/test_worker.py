import json

from cse import worker
from cse.storage import LocalStorage


def _job(s, jid="20261017000000-abc123", type_="setup"):
    job = {"id": jid, "type": type_, "brand": "acme", "created_at": "2026-10-17T00:00:00Z"}
    s.write_text(f"jobs/pending/{jid}.json", json.dumps(job))
    return job


def test_cancelled_setup_stops_and_removes_the_brand(tmp_path, monkeypatch):
    s = LocalStorage(tmp_path)
    s.write_text("brands/acme/brand.md", "---\nname: acme\n---\n")
    job = _job(s)

    def fake_run_job(storage, j):  # the site cancels while the job runs
        storage.write_text(worker.cancel_marker(j), json.dumps({"remove_brand": True}))
        raise worker.Cancelled()

    monkeypatch.setattr(worker, "run_job", fake_run_job)
    assert worker.process_one(s)
    assert s.exists(f"jobs/cancelled/{job['id']}.json")
    assert not s.list("brands/acme/") and not s.list("jobs/cancel/") and not s.list("jobs/running/")


def test_cancel_after_last_step_still_counts(tmp_path, monkeypatch):
    s = LocalStorage(tmp_path)
    job = _job(s, type_="report")

    def fake_run_job(storage, j):
        storage.write_text(worker.cancel_marker(j), json.dumps({}))
        return "brands/acme/reports/2026-10-17.md"

    monkeypatch.setattr(worker, "run_job", fake_run_job)
    worker.process_one(s)
    assert s.exists(f"jobs/cancelled/{job['id']}.json") and not s.list("jobs/done/")
