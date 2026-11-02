"""Creator profiles: who's speaking in an ad.

A brand (an offer) can have a roster of creators in brands/<brand>/creators.json. Iterations and
briefs can be written for one of them: their story, their voice, what they can film and what they
can believably say. Without a creator, prompts write for the creator described in the brand's
ad_format notes.
"""

from __future__ import annotations

import json
import re

from . import brand as brandlib

FIELDS = [
    ("handle", "Handle"),
    ("platforms", "Platforms"),
    ("about", "Who they are"),
    ("story", "Their story with this offer"),
    ("audience", "Their audience"),
    ("can_film", "What they can film"),
    ("voice", "How they talk"),
    ("can_claim", "What they can believably say"),
    ("avoid", "Avoid"),
]
NO_CREATOR = ("No specific creator. Write for the creator described in the format notes, and keep "
              "any personal story general enough that most creators could believably say it.")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")


def load(storage, slug: str) -> list[dict]:
    key = brandlib.brand_key(slug, "creators.json")
    return json.loads(storage.read_text(key))["creators"] if storage.exists(key) else []


def get(storage, slug: str, creator_id: str | None) -> dict | None:
    if not creator_id:
        return None
    if not ID_RE.match(creator_id):
        raise ValueError(f"bad creator id {creator_id!r}")
    found = next((c for c in load(storage, slug) if c.get("id") == creator_id), None)
    if found is None:
        raise ValueError(f"no creator {creator_id!r} for {slug}")
    return found


def describe(creator: dict | None) -> str:
    """The prompt block for the creator who'll say the words."""
    if not creator:
        return NO_CREATOR
    lines = [f"**{creator.get('name', 'The creator')}** will film and say this ad. Write it for them:"]
    lines += [f"- {label}: {creator[k].strip()}" for k, label in FIELDS if str(creator.get(k) or "").strip()]
    lines.append("The profile is who they can believably play: their age, life stage, job, look, where "
                 "they film and how they talk. The story in the ad can be scripted for them; it doesn't "
                 "have to be something that literally happened to them, so write a strong first-person "
                 "story. Never write anything that contradicts who they visibly are (a 24-year-old guy "
                 "isn't a menopause coach), use their real details where they make the story stronger, "
                 "and follow their Avoid list.")
    return "\n".join(lines)
