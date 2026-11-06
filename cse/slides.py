"""Daily slides for a TikTok Shop brand: publish a rendered day so the site's "Today's slides" page shows it.

A day lives at brands/<brand>/slides/days/<date>/:
  plan.json            {date, posts: [{id, bucket, hook, product, caption, source, slides: [key, ...]}], needs_photos: [...]}
  post-<id>/<n>.jpg    the rendered slides (slides/render.js makes the PNGs)

Buckets (knowledge/<brand>/daily-system.md): copy, plug, tweak, rerun, test.
The photo bank (brands/<brand>/slides/photos.json + photos/) is what the slides are built from.
"""

from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from . import brand as brandlib

log = logging.getLogger("cse")

BUCKETS = ["copy", "plug", "tweak", "rerun", "test"]


def day_key(slug: str, date: str, name: str = "plan.json") -> str:
    return brandlib.brand_key(slug, f"slides/days/{date}/{name}")


def publish(storage, slug: str, date: str, plan: dict, render_dir: str | Path) -> dict:
    """Upload each post's slides (as JPGs) and the plan. `plan["posts"]` items need an "id" that
    matches a post-<id> folder in render_dir."""
    from PIL import Image

    render_dir = Path(render_dir)
    posts = []
    for p in plan["posts"]:
        if p.get("bucket") and p["bucket"] not in BUCKETS:
            raise ValueError(f"unknown bucket {p['bucket']!r} (use one of {BUCKETS})")
        folder = render_dir / f"post-{p['id']}"
        keys = []
        for png in sorted(folder.glob("*.png"), key=lambda f: int(f.stem)):
            buf = io.BytesIO()
            Image.open(png).convert("RGB").save(buf, "JPEG", quality=92)
            key = day_key(slug, date, f"post-{p['id']}/{png.stem}.jpg")
            storage.write_bytes(key, buf.getvalue(), content_type="image/jpeg")
            keys.append(key)
        posts.append({**p, "slides": keys})
    out = {"date": date, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "posts": posts, "needs_photos": plan.get("needs_photos") or []}
    storage.write_text(day_key(slug, date), json.dumps(out, indent=2))
    storage.write_text(brandlib.brand_key(slug, "slides/latest.txt"), date)
    log.info("slides: published %d posts for %s %s", len(posts), slug, date)
    return {"posts": len(posts), "slides": sum(len(p["slides"]) for p in posts)}


def flat_zip(render_dir: str | Path, out: str | Path, date: str, start_hour: int = 9, step_s: int = 1,
             start_minute: int = 0) -> int:
    """One zip of every slide, no folders: 01-1.jpg, 01-2.jpg, 02-1.jpg... Each JPG gets a
    "date taken" one second after the last, in posting order, so saving them all to an iPhone's
    camera roll keeps them in order (Photos sorts by date taken)."""
    import zipfile
    from datetime import datetime as dt, timedelta
    from PIL import Image

    render_dir = Path(render_dir)
    t = dt.fromisoformat(date).replace(hour=start_hour, minute=start_minute)
    n = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for folder in sorted(render_dir.glob("post-*")):
            pid = folder.name.split("-", 1)[1]
            for png in sorted(folder.glob("*.png"), key=lambda f: int(f.stem)):
                exif = Image.Exif()
                stamp = t.strftime("%Y:%m:%d %H:%M:%S")
                exif[0x0132] = stamp            # DateTime
                # DateTimeOriginal, DateTimeDigitized, plus the time zone so the phone can't shift them
                exif[0x8769] = {0x9003: stamp, 0x9004: stamp, 0x9010: "-06:00", 0x9011: "-06:00", 0x9012: "-06:00"}
                buf = io.BytesIO()
                Image.open(png).convert("RGB").save(buf, "JPEG", quality=92, exif=exif.tobytes())
                z.writestr(f"{pid}-{png.stem}.jpg", buf.getvalue())
                t += timedelta(seconds=step_s)
                n += 1
    return n
