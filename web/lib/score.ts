import type { Ad } from "./ads";

/**
 * The winner grade, like school. Same rules as cse/score.py: time live sets the grade
 * (nobody keeps paying for an ad that loses money), then stopped = down one grade and
 * 5+ versions = up one grade.
 */

export type Grade = "A" | "B" | "C" | "D" | "F";
export type Part = { label: string; value: string; effect: string; grade?: Grade; note: string };
export type Explained = { grade: Grade; verdict: string; meaning: string; reason: string; parts: Part[] };

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];
const SCALE_VERSIONS = 5;
const RISING_DAYS = 30;
const RISING_RATIO = 2;
const RISING_MIN_DAYS = 7;

export const VERDICTS: { grade: Grade; verdict: string; meaning: string }[] = [
  { grade: "A", verdict: "Proven winner", meaning: "Months of paid spend and still running. Almost certainly making them money." },
  { grade: "B", verdict: "Strong signal", meaning: "Ran well past testing. Very likely a winner." },
  { grade: "C", verdict: "Early signal", meaning: "Got through its first weeks. Promising, not proven." },
  { grade: "D", verdict: "Too early to tell", meaning: "Under two weeks and still being tested. Could go either way." },
  { grade: "F", verdict: "Didn't make it", meaning: "Stopped within two weeks. Probably a test that lost." },
];

export const PART_SCALES = [
  { label: "Time live", effect: "sets the grade", scale: "A 90+ days · B 30+ · C 14+ · D under 2 weeks" },
  { label: "Still running", effect: "if stopped, down one grade", scale: "a stopped D becomes an F" },
  { label: "Versions", effect: "5+ versions, up one grade", scale: "lots of copies means they're scaling it" },
  {
    label: "Rising",
    effect: "new ads can jump to B or A",
    scale: "under 30 days and still running: outliving 2x the brand's usual ad life (a week+) or 5+ versions = B, both = A",
  },
];

function gradeTime(days: number): Grade {
  return days >= 90 ? "A" : days >= 30 ? "B" : days >= 14 ? "C" : "D";
}

/** Colour family for a grade. */
export function tone(g: Grade): "diamond" | "emerald" | "ruby" | "dim" {
  return g === "A" ? "diamond" : g === "B" ? "emerald" : g === "C" ? "ruby" : "dim";
}

function span(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export const ORGANIC_VERDICTS: { grade: Grade; verdict: string; meaning: string }[] = [
  { grade: "A", verdict: "Breakout", meaning: "5x+ the account's usual views. Something in it hit far beyond their audience." },
  { grade: "B", verdict: "Strong signal", meaning: "2x+ the account's usual views. It beat their normal clearly." },
  { grade: "C", verdict: "About normal", meaning: "Around the account's usual views, or too few views to call." },
  { grade: "D", verdict: "Below usual", meaning: "Fewer views than the account normally gets." },
  { grade: "F", verdict: "Missed", meaning: "Below the account's usual views, and few people commented." },
];

export function short(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
}

/** Organic posts: views vs the account's usual, then comments per view. Same rules as cse/organic.py. */
export const ORGANIC_SCALES = [
  { label: "Outlier", effect: "sets the grade", scale: "views vs the account's usual: A 5x+ · B 2x+ · C about normal · D below" },
  { label: "Reach", effect: "can raise it", scale: "beating the usual by 1.5x+: B at 50K+ views · A at 250K+" },
  { label: "Comments per view", effect: "up one", scale: "2x the account's usual: up one (10+ comments). Never down" },
  { label: "Views", effect: "under 10,000", scale: "not a breakout yet: stops at C" },
];

export function commentRate(ad: Ad): number {
  return ad.views ? (ad.comments ?? 0) / ad.views : 0;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : n >= 0.01 ? 1 : 2)}%`;
}

function explainOrganic(ad: Ad): Explained {
  const views = ad.views ?? 0;
  if (ad.on_topic === false) {
    return {
      grade: "F",
      verdict: "Off topic",
      meaning: "It blew up, but it isn't about the niche, so there's nothing to copy from it.",
      reason: `${short(views)} views, but not about the niche${ad.topic_why ? ` (${ad.topic_why})` : ""}.`,
      parts: [],
    };
  }
  const usual = ad.usual_views ?? 0;
  const ratio = usual ? views / usual : 1;
  const outlier: Grade = ratio >= 5 ? "A" : ratio >= 2 ? "B" : ratio >= 1 ? "C" : "D";
  const reach: Grade | null = ratio < 1.5 ? null : views >= 250_000 ? "A" : views >= 50_000 ? "B" : null;
  const base: Grade = reach && GRADES.indexOf(reach) < GRADES.indexOf(outlier) ? reach : outlier;
  const rate = commentRate(ad);
  const usualRate = ad.usual_comment_rate ?? 0;
  const move = (ad.comments ?? 0) < 10 || !usualRate ? 0 : rate >= 2 * usualRate ? -1 : 0;
  let grade = GRADES[Math.max(0, Math.min(4, GRADES.indexOf(base) + move))];
  const floor = ad.min_views ?? 10_000;
  const capped = views < floor && (grade === "A" || grade === "B");
  if (capped) grade = "C";
  const { verdict, meaning } = ORGANIC_VERDICTS.find((v) => v.grade === grade)!;
  const parts: Part[] = [
    {
      label: "Outlier",
      value: `${ratio.toFixed(1)}x`,
      grade: outlier,
      effect: capped ? `capped at C: under ${floor.toLocaleString("en-US")} views` : "sets the grade",
      note: `${views.toLocaleString("en-US")} views vs @${ad.handle}'s usual ${usual.toLocaleString("en-US")}.`,
    },
    {
      label: "Comments",
      value: pct(rate),
      effect: move < 0 ? "up one grade" : "no change",
      note: `${(ad.comments ?? 0).toLocaleString("en-US")} comments, ${pct(rate)} of views; @${ad.handle}'s usual is ${pct(usualRate)}.`,
    },
  ];
  if (reach && reach === base && base !== outlier) {
    parts.splice(1, 0, {
      label: "Reach",
      value: short(views),
      grade: reach,
      effect: "raised the grade",
      note: `${views.toLocaleString("en-US")} views and beating the usual by ${ratio.toFixed(1)}x: big reach counts on its own.`,
    });
  }
  const bits = [`${short(views)} views, ${ratio.toFixed(1)}x usual`];
  if (usualRate) bits.push(`comments ${pct(rate)} vs usual ${pct(usualRate)}`);
  const reason = `${bits.join(", ")}${capped ? " (too few views to call)" : ""}.`;
  return { grade, verdict, meaning, reason, parts };
}

export function explain(ad: Ad): Explained {
  if (ad.source === "organic") return explainOrganic(ad);
  const days = ad.days_running ?? 0;
  const versions = Math.max(1, ad.versions ?? 1);
  const live = Boolean(ad.is_active) && !ad.removed_from_library;

  const time: Part = {
    label: "Time live",
    value: `${days} day${days === 1 ? "" : "s"}`,
    grade: gradeTime(days),
    effect: "sets the grade",
    note:
      days >= 90
        ? "3+ months of paid spend. Brands don't keep losing ads running this long."
        : days >= 30
          ? "Over a month. It made it past the first round of cuts."
          : days >= 14
            ? "Two weeks in. Past the first test, still early."
            : "Under two weeks. Still being tested; most ads get cut around now.",
  };
  const status: Part = {
    label: "Still running",
    value: ad.removed_from_library ? "Removed" : live ? "Yes" : "Stopped",
    effect: live ? "no change" : "down one grade",
    note: live ? "They're still paying for it today." : "They've stopped paying for it.",
  };
  const copies: Part = {
    label: "Versions",
    value: String(versions),
    effect: versions >= SCALE_VERSIONS ? "up one grade" : "no change",
    note:
      versions >= 10
        ? "10+ copies with new captions, sizes or hooks: they're pouring money in."
        : versions >= 5
          ? "Lots of copies: they're scaling it."
          : versions >= 2
            ? "They've remade it a little. Not enough to count as scaling."
            : "One version. Plenty of winners only ever have one.",
  };

  const i = GRADES.indexOf(time.grade!) - (versions >= SCALE_VERSIONS ? 1 : 0) + (live ? 0 : 1);
  let grade = GRADES[Math.max(0, Math.min(4, i))];
  let { verdict, meaning } = VERDICTS.find((v) => v.grade === grade)!;
  const parts = [time, status, copies];

  // Rising: a new ad judged against how long this advertiser usually keeps its ads.
  const usual = ad.usual_days ?? null;
  const outlived = usual !== null && days >= Math.max(RISING_RATIO * usual, RISING_MIN_DAYS);
  const scaling = versions >= SCALE_VERSIONS;
  const risingGrade: Grade | null =
    live && days < RISING_DAYS && (outlived || scaling) ? (outlived && scaling ? "A" : "B") : null;
  if (risingGrade && GRADES.indexOf(risingGrade) < GRADES.indexOf(grade)) {
    grade = risingGrade;
    verdict = grade === "A" ? "Rising fast" : "Rising";
    meaning = "New, still running, and already outlasting how long this brand usually keeps ads. What's working right now.";
    const bits = [];
    if (outlived) bits.push(`most ${ad.brand} ads stop by day ${usual}`);
    if (scaling) bits.push(`${versions} versions already`);
    parts.push({
      label: "Rising",
      value: usual !== null ? `${(days / Math.max(1, usual)).toFixed(1)}x usual` : `${versions} versions`,
      grade: risingGrade,
      effect: "raised the grade",
      note: `Running ${days} days; ${bits.join(", ")}.`,
    });
    return { grade, verdict, meaning, reason: `New and rising: running ${days} days, ${bits.join(", ")}.`, parts };
  }

  const bits = [`Live ${span(days)}`, live ? "still running" : "now stopped"];
  if (versions > 1) bits.push(`${versions} versions`);
  const so =
    live && days >= 60 && versions >= 5
      ? "they're scaling it"
      : live && days >= 30
        ? "they keep paying for it"
        : live
          ? "still being tested"
          : days >= 30
            ? "it ran for a long time, so it likely worked"
            : "it may not have won";

  return { grade, verdict, meaning, reason: `${bits.join(", ")}: ${so}.`, parts };
}
