"""Usage log, prompt caching and the Batch API path (no real API calls)."""

import json
from types import SimpleNamespace as NS

from cse import batch, llm, usage
from cse.storage import LocalStorage


def test_cost_counts_cache_and_batch():
    t = {"input": 1_000_000, "output": 100_000, "cache_write": 0, "cache_read": 1_000_000, "searches": 0}
    # $4 in + $0.20 cache read + $2 out
    assert usage.cost("claude-opus-5-5", t) == 6.2
    assert usage.cost("claude-opus-5-5", t, batch=True) == 3.1
    assert usage.cost("claude-opus-5-5", {**t, "searches": 10}) == 6.3


def test_record_and_summary(tmp_path):
    s = LocalStorage(tmp_path)
    u = NS(input_tokens=18000, output_tokens=4000, cache_creation_input_tokens=0,
           cache_read_input_tokens=0, server_tool_use=None)
    usage.record(s, "pp", "version-apology-r2-jon", u, "claude-opus-5-5")
    usage.record(s, "pp", "version-apology-r2-val", u, "claude-opus-5-5")
    month = s.list("usage/")[0].split("/")[1]
    data = usage.summary(s, month)
    assert data["pp"]["version"]["calls"] == 2
    assert round(data["pp"]["version"]["cost"], 3) == 0.304
    assert "version" in usage.format_summary(month, data)


def test_cache_moves_repeating_text_to_a_cached_first_block(tmp_path):
    knowledge = "craft notes " * 1000
    prompt = f"Write for Jon.\n\n{knowledge}\n\nThe script: hi"
    blocks = llm._content(LocalStorage(tmp_path), prompt, None, knowledge)
    assert blocks[0]["cache_control"] == {"type": "ephemeral"} and knowledge in blocks[0]["text"]
    assert knowledge not in blocks[1]["text"] and "Write for Jon." in blocks[1]["text"]
    # too short to cache, or not in the prompt: one plain block
    assert len(llm._content(LocalStorage(tmp_path), prompt, None, "short")) == 1


class FakeBatches:
    def __init__(self, answer="the answer"):
        self.sent, self.answer = [], answer

    def create(self, requests):
        self.sent.append(requests)
        return NS(id=f"b{len(self.sent)}")

    def retrieve(self, bid):
        return NS(processing_status="ended")

    def results(self, bid):
        msg = NS(content=[NS(type="text", text=self.answer)], stop_reason="end_turn",
                 model="claude-opus-5-5", usage=NS(input_tokens=10, output_tokens=5))
        return [NS(custom_id=r["custom_id"], result=NS(type="succeeded", message=msg))
                for r in self.sent[int(bid[1:]) - 1]]


def test_batch_queues_then_answers_from_the_batch(tmp_path, monkeypatch):
    s = LocalStorage(tmp_path)
    monkeypatch.setenv("CSE_LLM", "api")
    client = NS(messages=NS(batches=FakeBatches()))
    with batch.collect(s, client) as b:
        try:
            llm.ask(s, "pp", "report-2026-11-03", "write the report", max_tokens=100)
        except llm.BatchQueued:
            pass
    assert b.ids == ["b1"]
    assert client.messages.batches.sent[0][0]["params"]["max_tokens"] == 100
    assert batch.ended("b1", client)
    assert batch.fetch(s, "b1", client) == {"done": 1, "failed": 0}
    # the next ask reads the batch answer, no API call
    assert llm.ask(s, "pp", "report-2026-11-03", "write the report") == "the answer"
    assert not s.exists("brands/pp/handoff/report-2026-11-03.batch.md")
    rec = json.loads(s.read_text(s.list("usage/")[0]))
    assert rec["batch"] is True and rec["kind"] == "report"
