const FORMAT_NAMES: Record<string, string> = { "": "UGC", broll: "B-roll", static: "Static" };

/**
 * File name -> label parts. A report is "<date>[-format]"; scripts and briefs are
 * "<report name>-ideas-<n>-<n>[-format]", and their own format is the one after "-ideas-".
 * No format suffix means UGC, the default.
 *   "2026-10-17-ideas-1-4"           -> { date: "Oct 17, 2026", ideas: "1, 4", format: "UGC" }
 *   "2026-10-17-static-ideas-2-broll" -> { ideas: "2", format: "B-roll" }
 */
export function docLabel(file: string): { date: string; ideas?: string; format?: string } {
  const [, y, m, d, raw] = file.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/) ?? [];
  if (!y) return { date: file };
  const date = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const [before, after] = raw.split("-ideas-");
  const own = (after ?? before).match(/-?(broll|static)$/)?.[1] ?? "";
  const ideas = after?.replace(/-?(broll|static)$/, "").split("-").join(", ");
  return { date, ideas, format: FORMAT_NAMES[own] };
}
