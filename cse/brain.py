"""What the brand adds to its brain by hand: notes typed on the Research page and documents
attached there (text pulled out of PDFs, Word docs, Markdown and text files).

Each item is brands/<brand>/brain/<id>.json: {id, title, kind (note|doc), filename, added,
text}. Every prompt that reads the research brief also gets these, after it, as the brand's
own words (so they win where they disagree with the research).
"""

from __future__ import annotations

import json

from . import brand as brandlib

PER_ITEM = 30000
TOTAL = 120000


def items(storage, slug: str) -> list[dict]:
    keys = sorted(k for k in storage.list(brandlib.brand_key(slug, "brain/")) if k.endswith(".json"))
    return [json.loads(storage.read_text(k)) for k in keys]


def section(storage, slug: str) -> str:
    """The brand's own additions as one prompt block, or "" when there are none."""
    parts, used = [], 0
    for it in items(storage, slug):
        text = (it.get("text") or "").strip()
        if not text:
            continue
        if len(text) > PER_ITEM:
            text = text[:PER_ITEM] + "\n[... cut for length]"
        if used + len(text) > TOTAL:
            parts.append(f"### {it.get('title') or 'Note'}\n[left out: the brain's additions are over the length limit]")
            continue
        used += len(text)
        source = f" (from {it['filename']})" if it.get("filename") else ""
        parts.append(f"### {it.get('title') or 'Note'}{source}, added {str(it.get('added', ''))[:10]}\n\n{text}")
    if not parts:
        return ""
    return ("## Added to the brand brain by the brand\n\nNotes and documents the brand added itself. "
            "They're the brand's own words and data: where they disagree with the research above (much of "
            "which is estimated from the web), they win. Real data about the brand's own customers beats "
            "any estimate of the market.\n\n"
            + "\n\n".join(parts))


def with_brief(brief: str, storage, slug: str) -> str:
    extra = section(storage, slug)
    return f"{brief.rstrip()}\n\n{extra}" if extra else brief
