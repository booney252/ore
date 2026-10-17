/** "2026-10-17-ideas-1-4" -> { date: "Oct 17, 2026", ideas: "1, 4" } */
export function docLabel(file: string): { date: string; ideas?: string } {
  const [, y, m, d, rest] = file.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/) ?? [];
  if (!y) return { date: file };
  const date = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { date, ideas: rest.match(/^-ideas-(.+)$/)?.[1].split("-").join(", ") };
}
