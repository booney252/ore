"""Thin wrapper around the Claude API: web research calls and JSON extraction."""

from __future__ import annotations

import json
import logging
import os

log = logging.getLogger("cse")

DEFAULT_MODEL = "claude-opus-5-5"
# Server-side refusal fallback: if a request is declined (peptide/health topics can
# trip safety classifiers), the API retries it on a suitable model in the same call.
BETAS = ["server-side-fallback-2026-07-01"]
MAX_PAUSE_RESUMES = 5


class LLMError(Exception):
    pass


def model() -> str:
    return os.environ.get("CSE_MODEL") or DEFAULT_MODEL


def make_client():
    import anthropic

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise LLMError("ANTHROPIC_API_KEY is not set in .env")
    return anthropic.Anthropic()


def _create(client, **kwargs):
    response = client.beta.messages.create(
        model=model(), betas=BETAS, fallbacks="default", **kwargs
    )
    if response.stop_reason == "refusal":
        raise LLMError(f"Claude declined the request: {response.stop_details}")
    return response


def _text(response) -> str:
    return "\n".join(b.text for b in response.content if b.type == "text").strip()


def web_research(client, prompt: str, max_searches: int = 20) -> tuple[str, int]:
    """Run a research prompt with web search. Returns (notes, number of searches used)."""
    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}]
    for _ in range(MAX_PAUSE_RESUMES + 1):
        response = _create(client, max_tokens=32000, tools=tools, messages=messages)
        if response.stop_reason != "pause_turn":
            break
        # Server-side search loop hit its iteration cap; resend to let it continue.
        messages = [messages[0], {"role": "assistant", "content": response.content}]
    searches = sum(1 for b in response.content if b.type == "server_tool_use")
    return _text(response), searches


def extract_json(client, instructions: str, source: str, schema: dict) -> dict:
    """Turn free-text research notes into JSON matching `schema`."""
    response = _create(
        client,
        max_tokens=16000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": f"{instructions}\n\n<notes>\n{source}\n</notes>"}],
    )
    try:
        return json.loads(_text(response))
    except json.JSONDecodeError as e:
        raise LLMError(f"model returned invalid JSON: {e}") from None
