"""Winner grade: simple and explainable, graded like school.

Time live sets the grade, because nobody keeps paying for an ad that loses money:
  A 90+ days, B 30+ days, C 14+ days, D under 2 weeks.
Then two adjustments:
- Stopped (or removed from the Ad Library): down one grade (a stopped D is an F).
- 5+ versions (they're making copies to scale it): up one grade, A at most.
`score` (grade x 25: A=100 ... F=0) is kept only for sorting; people see the letter.
"""

from __future__ import annotations

from datetime import date

GRADES = "ABCDF"
SCALE_VERSIONS = 5


def days_running(ad: dict, today: date) -> int:
    if not ad.get("start_date"):
        return 0
    start = date.fromisoformat(ad["start_date"])
    end = today if ad.get("is_active") or not ad.get("end_date") else date.fromisoformat(ad["end_date"])
    return max(0, (end - start).days)


def grade_time(days: int) -> str:
    return "A" if days >= 90 else "B" if days >= 30 else "C" if days >= 14 else "D"


def letter(score: float) -> str:
    """The grade from a stored score."""
    return GRADES[max(0, min(4, round(4 - (score or 0) / 25)))]


def winner_score(ad: dict, today: date) -> tuple[float, str]:
    if ad.get("source") == "organic":  # graded on views vs the account's usual, not time live
        from .organic import organic_score
        return organic_score(ad)
    days = days_running(ad, today)
    versions = max(1, int(ad.get("versions") or 1))
    active = bool(ad.get("is_active")) and not ad.get("removed_from_library")

    time = grade_time(days)
    i = GRADES.index(time) - (versions >= SCALE_VERSIONS) + (not active)
    grade = GRADES[max(0, min(4, i))]

    if ad.get("removed_from_library"):
        status = f"removed from the Ad Library {ad['removed_from_library']} (down one)"
    else:
        status = "still active" if active else f"stopped {ad.get('end_date')} (down one)"
    copies = f"{versions} version{'s' if versions != 1 else ''}"
    if versions >= SCALE_VERSIONS:
        copies += " (up one)"
    why = f"Grade {grade}: running {days} day{'s' if days != 1 else ''} ({time}), {status}, {copies}."
    return (4 - GRADES.index(grade)) * 25, why


def strength(ad: dict) -> float:
    """Tie-breaker inside a grade: how far an organic post beat its account's usual views,
    or how long a paid ad has run."""
    if ad.get("source") == "organic":
        return (ad.get("views") or 0) / max(1, ad.get("usual_views") or 1)
    return float(ad.get("days_running") or 0)
