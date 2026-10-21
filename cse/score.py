"""Winner grade: simple and explainable, graded like school.

Time live sets the grade, because nobody keeps paying for an ad that loses money:
  A 90+ days, B 30+ days, C 14+ days, D under 2 weeks.
Then two adjustments:
- Stopped (or removed from the Ad Library): down one grade (a stopped D is an F).
- 5+ versions (they're making copies to scale it): up one grade, A at most.
Rising (recency): a still-running ad under 30 days old can't have months behind it yet, so it's
judged against how long its advertiser usually keeps ads (the median life of their stopped ads).
Outliving that by 2x (and at least a week), or 5+ versions, makes it a rising B; both make it A.
`score` (grade x 25: A=100 ... F=0) is kept only for sorting; people see the letter.
"""

from __future__ import annotations

from datetime import date

GRADES = "ABCDF"
SCALE_VERSIONS = 5
RISING_DAYS = 30     # younger than this (and still running) can be judged as rising
RISING_RATIO = 2     # ...once it has outlived 2x the advertiser's usual ad life
RISING_MIN_DAYS = 7  # ...and at least a week
USUAL_MIN_ADS = 5    # stopped ads an advertiser needs before we know its usual ad life


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
    rising = rising_grade(ad, days, versions, active)
    ad["rising"] = bool(rising and GRADES.index(rising) < GRADES.index(grade))
    if ad["rising"]:
        grade = rising

    if ad.get("removed_from_library"):
        status = f"removed from the Ad Library {ad['removed_from_library']} (down one)"
    else:
        status = "still active" if active else f"stopped {ad.get('end_date')} (down one)"
    copies = f"{versions} version{'s' if versions != 1 else ''}"
    if versions >= SCALE_VERSIONS:
        copies += " (up one)"
    why = f"Grade {grade}: running {days} day{'s' if days != 1 else ''} ({time}), {status}, {copies}."
    if ad["rising"]:
        usual = ad.get("usual_days")
        bits = []
        if usual is not None and days >= max(RISING_RATIO * usual, RISING_MIN_DAYS):
            bits.append(f"most {ad.get('brand') or 'of their'} ads stop by day {usual}")
        if versions >= SCALE_VERSIONS:
            bits.append(f"{versions} versions already")
        why = (f"Grade {grade} (rising): new, running {days} day{'s' if days != 1 else ''} and still active; "
               f"{' and '.join(bits)}.")
    return (4 - GRADES.index(grade)) * 25, why


def rising_grade(ad: dict, days: int, versions: int, active: bool) -> str | None:
    """B (or A) for a new ad that's already outliving its advertiser's usual ad, or being scaled."""
    if not active or days >= RISING_DAYS:
        return None
    usual = ad.get("usual_days")
    outlived = usual is not None and days >= max(RISING_RATIO * usual, RISING_MIN_DAYS)
    scaling = versions >= SCALE_VERSIONS
    return "A" if outlived and scaling else "B" if outlived or scaling else None


def usual_days(ads) -> dict[str, int]:
    """Each advertiser's usual ad life: the median days its stopped ads ran (5+ stopped ads)."""
    import statistics
    lives: dict[str, list[int]] = {}
    for a in ads:
        if a.get("source") != "organic" and not a.get("is_active"):
            lives.setdefault(a.get("brand") or "", []).append(int(a.get("days_running") or 0))
    return {b: int(statistics.median(v)) for b, v in lives.items() if len(v) >= USUAL_MIN_ADS}


def regrade_paid(ads, today: date) -> None:
    """Refresh every paid ad's days live, its advertiser's usual ad life, and its grade."""
    ads = [a for a in ads if a.get("source") != "organic"]
    for a in ads:
        a["days_running"] = days_running(a, today)
    usual = usual_days(ads)
    for a in ads:
        a["usual_days"] = usual.get(a.get("brand") or "")
        a["score"], a["score_why"] = winner_score(a, today)


def strength(ad: dict) -> float:
    """Tie-breaker inside a grade: an organic post's views (the grade already says it beat its
    account's usual; within a grade, more people reached wins), or how long a paid ad has run."""
    if ad.get("source") == "organic":
        return float(ad.get("views") or 0)
    return float(ad.get("days_running") or 0)
