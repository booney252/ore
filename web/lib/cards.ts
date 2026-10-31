import { listDocs } from "./brands";
import { readText } from "./storage";

export type Card = { title: string; why: string; ranks: number[]; example: string; idea: string };
export type Cards = { report: string; patterns: Card[]; gaps: Card[]; byRank: Record<number, string> };

/** The latest report's top patterns and open lanes (reports/<date>-cards.json), with each rank's ad id. */
export async function readCards(brand: string): Promise<Cards | null> {
  const [report] = await listDocs(brand, "reports");
  if (!report) return null;
  const [raw, index] = await Promise.all([
    readText(`brands/${brand}/reports/${report}-cards.json`),
    readText(`brands/${brand}/reports/${report}.json`),
  ]);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as { patterns?: Card[]; gaps?: Card[] };
    const byRank: Record<number, string> = {};
    for (const t of (index ? JSON.parse(index).top : []) as { rank: number; ad_id: string }[]) byRank[t.rank] = t.ad_id;
    return { report, patterns: c.patterns ?? [], gaps: c.gaps ?? [], byRank };
  } catch {
    return null;
  }
}

/** What Ore writes from when someone picks a card. */
export function cardIdea(c: Card, kind: "pattern" | "gap"): string {
  return kind === "pattern"
    ? `Use this pattern from this week's winning ads: ${c.title}. ${c.why} One of the winners opens: "${c.example}". ${c.idea}`
    : `Take this open lane nobody's ads are saying yet: ${c.title}. ${c.why} The buyer's words: "${c.example}". ${c.idea}`;
}
