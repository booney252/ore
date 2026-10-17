"""Winner score: simple and explainable.

score (0-100) = days running (up to 50) + still active (25) + versions (up to 25)
- 50 points at 90+ days running, linear below that.
- 25 points if still active.
- 25 points at 10+ versions, linear from 1 version (= 0 points).
"""

from __future__ import annotations

from datetime import date

FULL_DAYS = 90
FULL_VERSIONS = 10


def days_running(ad: dict, today: date) -> int:
    if not ad.get("start_date"):
        return 0
    start = date.fromisoformat(ad["start_date"])
    end = today if ad.get("is_active") or not ad.get("end_date") else date.fromisoformat(ad["end_date"])
    return max(0, (end - start).days)


def winner_score(ad: dict, today: date) -> tuple[int, str]:
    days = days_running(ad, today)
    versions = max(1, int(ad.get("versions") or 1))
    active = bool(ad.get("is_active"))

    score = (min(days, FULL_DAYS) / FULL_DAYS) * 50
    score += 25 if active else 0
    score += (min(versions, FULL_VERSIONS) - 1) / (FULL_VERSIONS - 1) * 25

    if ad.get("removed_from_library"):
        status = f"removed from the Ad Library {ad['removed_from_library']}"
    else:
        status = "still active" if active else f"stopped {ad.get('end_date')}"
    why = [f"Running {days} day{'s' if days != 1 else ''}", status,
           f"{versions} version{'s' if versions != 1 else ''}"]
    return round(score), ", ".join(why) + "."
