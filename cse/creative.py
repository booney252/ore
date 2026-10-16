"""Module 2b (mechanical part): transcript, cuts and key frames for each new creative.

For every ad in ads.json that has downloaded media and no `analysis` yet:
- video: length, Whisper transcript with timestamps, hook line (first spoken line),
  cut count + cuts per second (PySceneDetect), key frames (first frame + one per scene)
- image: the image itself is the key frame

Frames go to brands/<brand>/media/<ad_id>/frame_<NN>.jpg. The vision/LLM breakdown
(format, angle, structure, first-frame description, time to product, on-screen text)
reads these frames in the next step.
"""

from __future__ import annotations

import json
import logging
import subprocess
import tempfile
from pathlib import Path

from . import brand as brandlib

log = logging.getLogger("cse")

MAX_FRAMES = 12
WHISPER_MODEL = "base"
_whisper = None


def _model():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper


def video_length(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip() or 0), 2)


def load_audio(path: Path):
    """16 kHz mono float32 samples via ffmpeg (empty array if the video has no audio)."""
    import numpy as np

    out = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1",
                          "-ar", "16000", "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(out.stdout, dtype=np.float32)


def transcribe(path: Path) -> list[dict]:
    audio = load_audio(path)
    if audio.size < 16000 // 2:  # under half a second of audio
        return []
    segments, _ = _model().transcribe(audio, vad_filter=True)
    return [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments if s.text.strip()]


def scene_starts(path: Path) -> list[float]:
    from scenedetect import ContentDetector, detect

    scenes = detect(str(path), ContentDetector())
    return [round(getattr(start, 'seconds', None) or start.get_seconds(), 2) for start, _ in scenes] or [0.0]


def frame_times(starts: list[float], length: float) -> list[float]:
    """First frame, then the middle of each scene, capped at MAX_FRAMES."""
    bounds = starts + [length]
    mids = [round((bounds[i] + bounds[i + 1]) / 2, 2) for i in range(len(starts))]
    times = [0.0] + [t for t in mids if t > 0.0]
    if len(times) > MAX_FRAMES:
        step = len(times) / MAX_FRAMES
        times = [times[int(i * step)] for i in range(MAX_FRAMES)]
    return times


def grab_frame(video: Path, t: float, out: Path) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(video),
                    "-frames:v", "1", "-q:v", "3", "-vf", "scale=720:-2", str(out)], check=True)


def analyze_video(path: Path, workdir: Path) -> tuple[dict, list[tuple[float, Path]]]:
    length = video_length(path)
    transcript = transcribe(path)
    starts = scene_starts(path)
    cuts = max(0, len(starts) - 1)
    frames = []
    for i, t in enumerate(frame_times(starts, length)):
        out = workdir / f"frame_{i:02d}.jpg"
        grab_frame(path, t, out)
        if out.exists():
            frames.append((t, out))
    analysis = {
        "length_s": length,
        "cut_count": cuts,
        "cuts_per_second": round(cuts / length, 2) if length else 0,
        "transcript": transcript,
        "transcript_text": " ".join(s["text"] for s in transcript),
        "hook_line": transcript[0]["text"] if transcript and transcript[0]["start"] < 5 else "",
    }
    return analysis, frames


def pick(ads: list[dict], limit: int | None = None, per_brand: int | None = None) -> list[dict]:
    """Highest scores first; with per_brand, only each advertiser's top N (analyzed or not)."""
    ranked = sorted((a for a in ads if a.get("media_key")),
                    key=lambda a: a.get("score", 0), reverse=True)
    if per_brand:
        counts: dict[str, int] = {}
        kept = []
        for a in ranked:
            counts[a.get("brand", "")] = counts.get(a.get("brand", ""), 0) + 1
            if counts[a.get("brand", "")] <= per_brand:
                kept.append(a)
        ranked = kept
    todo = [a for a in ranked if not a.get("analysis")]
    return todo[:limit] if limit else todo


def run(storage, slug: str, limit: int | None = None, per_brand: int | None = None) -> dict:
    ads_key = brandlib.brand_key(slug, "ads.json")
    doc = json.loads(storage.read_text(ads_key))
    todo = pick(list(doc["ads"].values()), limit, per_brand)

    done = failed = 0
    for ad in todo:
        try:
            with tempfile.TemporaryDirectory() as tmp:
                tmp = Path(tmp)
                if ad["media_type"] == "video":
                    src = tmp / "ad.mp4"
                    src.write_bytes(storage.read_bytes(ad["media_key"]))
                    analysis, frames = analyze_video(src, tmp)
                else:
                    analysis, frames = {"length_s": 0, "cut_count": 0, "cuts_per_second": 0,
                                        "transcript": [], "transcript_text": "", "hook_line": ""}, []
                frame_keys = []
                for i, (t, path) in enumerate(frames):
                    key = brandlib.brand_key(slug, f"media/{ad['ad_id']}/frame_{i:02d}.jpg")
                    storage.write_bytes(key, path.read_bytes(), content_type="image/jpeg")
                    frame_keys.append({"t": t, "key": key})
                if ad["media_type"] == "image":
                    frame_keys = [{"t": 0, "key": ad["media_key"]}]
                analysis["frames"] = frame_keys
            ad["analysis"] = analysis
            ad.pop("analysis_error", None)
            done += 1
            log.info("  %s %-20s %5.1fs  %2d cuts  hook: %s", ad["ad_id"], ad["brand"][:20],
                     analysis["length_s"], analysis["cut_count"], analysis["hook_line"][:60])
        except Exception as e:  # noqa: BLE001 - log every failure, keep going
            ad["analysis_error"] = str(e)[:200]
            failed += 1
            log.warning("  analysis failed for %s: %s", ad["ad_id"], ad["analysis_error"])
        storage.write_text(ads_key, json.dumps(doc, indent=2) + "\n")  # save progress per ad

    log.info("creative: %d analyzed, %d failed, %d still to do",
             done, failed, len([a for a in doc["ads"].values()
                                if a.get("media_key") and not a.get("analysis")]))
    return {"analyzed": done, "failed": failed}
