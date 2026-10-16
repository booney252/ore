import json
import subprocess

import pytest

from cse import creative
from cse.storage import LocalStorage


def test_frame_times_first_frame_plus_scene_middles():
    assert creative.frame_times([0.0, 4.0, 6.0], 10.0) == [0.0, 2.0, 5.0, 8.0]
    many = creative.frame_times([float(i) for i in range(40)], 40.0)
    assert len(many) == creative.MAX_FRAMES and many[0] == 0.0


def test_run_on_real_video(tmp_path, monkeypatch):
    video = tmp_path / "src.mp4"
    # 4s test video: 2s red then 2s blue -> one hard cut. No audio.
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=red:s=320x240:d=2",
                    "-f", "lavfi", "-i", "color=blue:s=320x240:d=2", "-filter_complex",
                    "[0][1]concat=n=2:v=1", "-y", str(video)], check=True)
    monkeypatch.setattr(creative, "transcribe", lambda p: [{"start": 0.2, "end": 1.0, "text": "Hi"}])

    storage = LocalStorage(tmp_path / "store")
    storage.write_bytes("brands/pp/media/1.mp4", video.read_bytes())
    storage.write_text("brands/pp/ads.json", json.dumps({"ads": {"1": {
        "ad_id": "1", "brand": "X", "media_type": "video", "media_key": "brands/pp/media/1.mp4",
        "score": 50}}}))

    assert creative.run(storage, "pp") == {"analyzed": 1, "failed": 0}
    a = json.loads(storage.read_text("brands/pp/ads.json"))["ads"]["1"]["analysis"]
    assert a["length_s"] == pytest.approx(4.0, abs=0.1)
    assert a["cut_count"] == 1
    assert a["hook_line"] == "Hi"
    assert len(a["frames"]) == 3 and all(storage.exists(f["key"]) for f in a["frames"])
