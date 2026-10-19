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

export function explain(ad: Ad): Explained {
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
  const grade = GRADES[Math.max(0, Math.min(4, i))];
  const { verdict, meaning } = VERDICTS.find((v) => v.grade === grade)!;

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

  return { grade, verdict, meaning, reason: `${bits.join(", ")}: ${so}.`, parts: [time, status, copies] };
}
