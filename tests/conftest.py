
import pytest


@pytest.fixture(autouse=True)
def _no_live_api(monkeypatch):
    """Tests never call the real Claude API, even when a key is set in the shell."""
    monkeypatch.setenv("CSE_LLM", "handoff")
    monkeypatch.delenv("ORE_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
