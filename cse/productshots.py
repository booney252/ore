"""Product photos for TikTok slides: one of the owner's reference shots (a hand holding a product at
the vanity) regenerated with a new product in the hand, through Google's image model (the one behind
Flow). The owner's own workflow, automated: "regenerate this image but now she is holding this".

Needs GEMINI_API_KEY (Google AI Studio). Results go to the photo bank tagged with the product and
`ai: true`, and stay `approved: false` until the owner checks the first set for that product (AI can
misspell a label).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from datetime import datetime, timezone

log = logging.getLogger("cse")

MODEL = os.environ.get("ORE_IMAGE_MODEL", "gemini-3-pro-image")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = """Regenerate the first image, but now she is holding the product in the second image instead.

Keep everything else in the first image the same: the hand, skin tone, nails, bracelets, the marble vanity,
the background, the light and the camera angle. Hold the new product naturally, the way a person would hold
it, at its real size relative to the hand.

Copy the product exactly as it looks in the second image: its shape, colors, cap and every word on the label,
spelled exactly. Don't add any text, logos or watermarks that aren't on the real product.{extra}"""


class ImageError(Exception):
    pass


def generate(reference: bytes, product: bytes, extra: str = "", model: str = MODEL, session=None,
             aspect: str = "9:16") -> bytes:
    """One new image: the reference shot with the product swapped in. Returns PNG/JPEG bytes."""
    import requests

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ImageError("GEMINI_API_KEY is not set")
    s = session or requests
    body = {
        "contents": [{"parts": [
            {"text": PROMPT.format(extra=("\n\n" + extra) if extra else "")},
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(reference).decode()}},
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(product).decode()}},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
    }
    for attempt in range(3):
        r = s.post(URL.format(model=model), json=body, timeout=180, headers={"x-goog-api-key": key})
        if r.status_code in (429, 500, 503) and attempt < 2:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code != 200:
            raise ImageError(f"{model} returned {r.status_code}: {r.text[:300]}")
        for part in (r.json().get("candidates") or [{}])[0].get("content", {}).get("parts", []):
            data = (part.get("inlineData") or part.get("inline_data") or {}).get("data")
            if data:
                return base64.b64decode(data)
        raise ImageError(f"{model} returned no image: {r.text[:300]}")
    raise ImageError("no image after retries")


def add_to_bank(storage, slug: str, product: str, images: list[bytes], refs: list[str]) -> list[str]:
    """Save generated shots to the photo bank as unapproved AI product photos."""
    bank_key = f"brands/{slug}/slides/photos.json"
    bank = json.loads(storage.read_text(bank_key))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe = "".join(c if c.isalnum() else "-" for c in product.lower()).strip("-")[:40]
    keys = []
    for i, (img, ref) in enumerate(zip(images, refs)):
        k = f"brands/{slug}/slides/photos/products/{safe}-{stamp}-{i + 1}.jpg"
        storage.write_bytes(k, img, content_type="image/jpeg")
        bank["photos"].append({"key": k, "folder": "products", "name": f"{safe}-{stamp}-{i + 1}",
                               "role": "product", "shot": "product", "product": product,
                               "ai": True, "approved": False, "from_ref": ref})
        keys.append(k)
    storage.write_text(bank_key, json.dumps(bank, indent=1))
    return keys
