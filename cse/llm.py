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


def api_key() -> str:
    """Ore's Claude API key. ORE_ANTHROPIC_API_KEY first: Claude Code cloud environments
    reserve ANTHROPIC_API_KEY for their own login and don't pass it to sessions."""
    return os.environ.get("ORE_ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or ""


def make_client():
    import anthropic

    if not api_key():
        raise LLMError("ORE_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) is not set")
    return anthropic.Anthropic(api_key=api_key())


def _create(client, **kwargs):
    # Streamed: the SDK refuses non-streaming calls with large max_tokens (10-minute rule).
    with client.beta.messages.stream(
        model=model(), betas=BETAS, fallbacks="default", **kwargs
    ) as stream:
        response = stream.get_final_message()
    if response.stop_reason == "refusal":
        raise LLMError(f"Claude declined the request: {response.stop_details}")
    return response


def _text(response) -> str:
    return "\n".join(b.text for b in response.content if b.type == "text").strip()


def web_research(client, prompt: str, max_searches: int = 20) -> tuple[str, int]:
    """Run a research prompt with web search. Returns (notes, number of searches used)."""
    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}]
    content: list = []
    for _ in range(MAX_PAUSE_RESUMES + 1):
        response = _create(client, max_tokens=32000, tools=tools, messages=messages)
        content += response.content
        if response.stop_reason != "pause_turn":
            break
        # Server-side search loop hit its iteration cap; resend everything so far to let it continue.
        messages = [messages[0], {"role": "assistant", "content": content}]
    searches = sum(1 for b in content if b.type == "server_tool_use")
    # with search, text comes in many blocks split around citations: join them back without breaks
    return "".join(b.text for b in content if b.type == "text").strip(), searches


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


# --- Prompt steps that can run through the API or as a handoff --------------------------

class HandoffPending(Exception):
    """Raised in handoff mode when a prompt is waiting for an answer."""

    def __init__(self, prompt_key: str, answer_key: str):
        super().__init__(f"waiting for {answer_key}")
        self.prompt_key, self.answer_key = prompt_key, answer_key


def mode() -> str:
    """'api' or 'handoff'. Default: api when an API key is set, else handoff."""
    explicit = (os.environ.get("CSE_LLM") or "").strip().lower()
    if explicit in ("api", "handoff"):
        return explicit
    return "api" if api_key() else "handoff"


def render(template: str, values: dict) -> str:
    """Fill {{placeholders}}. Every placeholder must have a value."""
    import re

    missing = sorted(set(re.findall(r"\{\{(\w+)\}\}", template)) - set(values))
    if missing:
        raise LLMError(f"prompt is missing values for: {', '.join(missing)}")
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(values[m.group(1)]), template)


def ask(storage, slug: str, step: str, prompt: str, image_keys: list[str] | None = None,
        client=None, max_tokens: int = 32000, effort: str = "high", web: bool = False) -> str:
    """Run one prompt step and return the model's text answer. `web` lets the API model
    search the web (for facts like pricing); in handoff mode the session can search itself.

    Handoff mode writes brands/<slug>/handoff/<step>.prompt.md and returns the answer
    once brands/<slug>/handoff/<step>.answer.md exists (written by Claude Code).
    """
    base = f"brands/{slug}/handoff/{step}"
    prompt_key, answer_key = f"{base}.prompt.md", f"{base}.answer.md"
    if mode() == "handoff":
        if storage.exists(answer_key):
            return storage.read_text(answer_key)
        images = "".join(f"\n- {k}" for k in image_keys or [])
        storage.write_text(prompt_key, prompt + (f"\n\n## Images (storage keys)\n{images}\n"
                                                 if images else ""))
        raise HandoffPending(prompt_key, answer_key)

    if web:
        answer, _ = web_research(client or make_client(), prompt)
        storage.write_text(answer_key, answer)
        return answer

    import base64

    content = []
    for key in image_keys or []:
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": "image/jpeg",
            "data": base64.standard_b64encode(storage.read_bytes(key)).decode()}})
    content.append({"type": "text", "text": prompt})
    client = client or make_client()
    with client.beta.messages.stream(
        model=model(), betas=BETAS, fallbacks="default", max_tokens=max_tokens,
        output_config={"effort": effort}, messages=[{"role": "user", "content": content}],
    ) as stream:
        response = stream.get_final_message()
    if response.stop_reason == "refusal":
        raise LLMError(f"Claude declined the request: {response.stop_details}")
    answer = _text(response)
    storage.write_text(answer_key, answer)  # keep a copy of every answer for review
    return answer


def parse_json(text: str) -> dict | list:
    """Pull a JSON object/array out of a model answer (tolerates ```json fences)."""
    start = min((i for i in (text.find("{"), text.find("[")) if i >= 0), default=-1)
    end = max(text.rfind("}"), text.rfind("]"))
    if start < 0 or end < start:
        raise LLMError("answer has no JSON")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        raise LLMError(f"answer has invalid JSON: {e}") from None
