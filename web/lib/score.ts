import type { Ad } from "./ads";

/**
 * The winner score in plain words. Same formula as cse/score.py:
 * time live (up to 50) + still running (25) + versions (up to 25).
 * Nobody keeps paying for an ad that loses money, so time live and copies made
 * are the best public signs that an ad is working.
 */

export type Part = { label: string; value: string; points: number; max: number; note: string };
export type Explained = { verdict: string; meaning: string; reason: string; parts: Part[] };

export const VERDICTS = [
  { min: 75, verdict: "Proven winner", meaning: "Months of paid spend and still running. Almost certainly making them money." },
  { min: 50, verdict: "Strong signal", meaning: "They've kept paying for it well past testing. Very likely working." },
  { min: 25, verdict: "Early signal", meaning: "Survived its first weeks. Promising, not proven." },
  { min: 0, verdict: "Too early to tell", meaning: "New or already stopped. Could be a test that never won." },
];

function months(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export function explain(ad: Ad): Explained {
  const score = ad.score ?? 0;
  const days = ad.days_running ?? 0;
  const versions = Math.max(1, ad.versions ?? 1);
  const live = Boolean(ad.is_active) && !ad.removed_from_library;
  const { verdict, meaning } = VERDICTS.find((v) => score >= v.min)!;

  const time: Part = {
    label: "Time live",
    value: `${days} day${days === 1 ? "" : "s"}`,
    points: Math.round((Math.min(days, 90) / 90) * 50),
    max: 50,
    note:
      days >= 90
        ? "3+ months of paid spend. Brands don't keep losing ads running this long."
        : days >= 30
          ? "Over a month. It made it past the first round of cuts."
          : days >= 7
            ? "Past its first test week, still early."
            : "Brand new. Most ads get cut in the first week.",
  };
  const status: Part = {
    label: "Still running",
    value: ad.removed_from_library ? "Removed" : live ? "Yes" : "Stopped",
    points: live ? 25 : 0,
    max: 25,
    note: live ? "They're still paying for it today." : "They've stopped paying for it.",
  };
  const copies: Part = {
    label: "Versions",
    value: String(versions),
    points: Math.round(((Math.min(versions, 10) - 1) / 9) * 25),
    max: 25,
    note:
      versions >= 5
        ? "Lots of copies with new captions, sizes or hooks: they're scaling it."
        : versions >= 2
          ? "They've remade it, a sign they want more of it."
          : "Only one version so far.",
  };

  const bits = [`Live ${months(days)}`, live ? "still running" : "now stopped"];
  if (versions > 1) bits.push(`${versions} versions`);
  const so =
    live && days >= 60 && versions >= 5
      ? "they're scaling it"
      : live && days >= 30
        ? "they keep paying for it"
        : live
          ? "still being tested"
          : "it may not have won";
  const reason = `${bits.join(", ")}: ${so}.`;

  return { verdict, meaning, reason, parts: [time, status, copies] };
}
