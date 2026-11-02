import { listCreators } from "./creators";
import { readDoc } from "./brands";
import { codeIndex, openingLine, pct, readResults, sum, x, money, type AdResult } from "./results";

export type AdView = AdResult & { title: string; creator: string; creatorId: string; opening: string; kind: string; file: string; n?: number };

/** Everything the Performance tab shows, plus plain-words findings Ore also feeds into future briefs. */
export async function performance(brand: string) {
  const [results, codes, creators] = await Promise.all([readResults(brand), codeIndex(brand), listCreators(brand)]);
  if (!results?.rows.length) return null;
  const names = Object.fromEntries(creators.map((c) => [c.id, c.name]));
  const mds: Record<string, string> = {};
  const ads: AdView[] = [];
  for (const r of results.rows) {
    const doc = codes[r.code];
    if (!doc) continue;
    const key = `${doc.kind}/${doc.file}`;
    mds[key] ??= (await readDoc(brand, doc.kind, doc.file)) ?? "";
    const n = Number(r.code.match(/-(\d{1,2})$/)?.[1]) || undefined;
    const id = doc.file.match(/-for-([a-z0-9-]+)/)?.[1] ?? "";
    ads.push({ ...r, title: doc.title, creatorId: id, creator: names[id] ?? (id ? id : "Any creator"), opening: openingLine(mds[key], n), kind: doc.kind, file: doc.file, n });
  }
  const all = sum(ads);
  const byCreator = Object.entries(
    ads.reduce<Record<string, AdView[]>>((a, ad) => ((a[ad.creator] ??= []).push(ad), a), {}),
  )
    .map(([creator, list]) => ({ creator, id: list[0].creatorId, ...sum(list) }))
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  const ranked = [...ads].sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1) || b.spend - a.spend);
  return { uploaded_at: results.uploaded_at, period: results.period, all, ads: ranked, byCreator, findings: findings(ranked, all, byCreator) };
}

export type Finding = {
  kind: "best" | "worst" | "creator" | "stops" | "hook" | "retention";
  /** Plain words, also written into performance.md for the brief prompts. */
  text: string;
  ad?: AdView;
  creator?: { name: string; id: string; roas: number | null; ads: number; spend: number };
  value?: number;
};

function findings(ads: AdView[], all: ReturnType<typeof sum>, byCreator: { creator: string; id: string; roas: number | null; spend: number; ads: number }[]): Finding[] {
  const out: Finding[] = [];
  const real = ads.filter((a) => a.spend >= Math.max(50, all.spend * 0.03));
  const best = real[0];
  if (best && best.roas != null && all.roas) {
    out.push({ kind: "best", ad: best, text: `Best script: "${best.title}" by ${best.creator}, ${x(best.roas)} ROAS on ${money(best.spend)} (your average is ${x(all.roas)}). It opens: "${best.opening || best.title}"` });
  }
  if (byCreator.length > 1 && byCreator[0].roas && all.roas) {
    const c = byCreator[0];
    out.push({ kind: "creator", creator: { name: c.creator, id: c.id, roas: c.roas, ads: c.ads, spend: c.spend }, text: `${c.creator}'s ads return ${x(c.roas)} vs ${x(all.roas)} overall. Give ${c.creator} more of the next briefs.` });
  }
  const last = real.length > 2 ? real[real.length - 1] : null;
  const worst = last && last.roas != null && all.roas && last.roas < all.roas * 0.7 ? last : null;
  if (worst && worst.roas != null) {
    out.push({ kind: "worst", ad: worst, text: `Weakest: "${worst.title}" by ${worst.creator}, ${x(worst.roas)} ROAS. Opens: "${worst.opening || worst.title}"` });
  }
  if (all.hook != null) {
    for (const a of real) {
      if (a.hook == null || a.roas == null || !all.roas || a === worst) continue;
      if (a.hook >= all.hook * 1.2 && a.roas < all.roas) out.push({ kind: "stops", ad: a, text: `"${a.title}" stops the scroll (${pct(a.hook)} hook rate) but doesn't sell: keep the opening, fix the middle or the offer.` });
      else if (a.hook <= all.hook * 0.75) out.push({ kind: "hook", ad: a, text: `"${a.title}" loses people in the first 3 seconds (${pct(a.hook)} hook rate vs ${pct(all.hook)}): test a new first line.` });
    }
  }
  const curves = real.filter((a) => a.ret && a.ret.length >= 2);
  if (curves.length) {
    const half = curves.map((a) => a.ret![1]).reduce((s, v) => s + v, 0) / curves.length;
    out.push({ kind: "retention", value: half, text: `On average ${pct(half)} of people who watch 3 seconds are still there halfway through.` });
  }
  return out.slice(0, 7);
}

/** The same findings, written for the brief prompts (brands/<brand>/performance.md). */
export function notesFor(p: NonNullable<Awaited<ReturnType<typeof performance>>>): string {
  const lines = [
    "# How this brand's scripts performed in paid ads",
    "",
    `From the latest Ads Manager export${p.period ? ` (${p.period})` : ""}. ${p.ads.length} ads written by Ore, ${money(p.all.spend)} spent, ${x(p.all.roas)} ROAS, ${pct(p.all.hook)} hook rate.`,
    "Lean new scripts toward what's working here: the openings, angles and creators at the top. Avoid repeating the patterns at the bottom.",
    "",
    "## What the numbers say",
    ...p.findings.map((f) => `- ${f.text}`),
    "",
    "## Every ad, best first",
    ...p.ads.map((a) => `- ${a.creator} | "${a.title}" | ROAS ${x(a.roas)}, CPA ${money(a.cpa)}, hook ${pct(a.hook)}, spend ${money(a.spend)}${a.opening ? ` | opens: "${a.opening}"` : ""}`),
    "",
  ];
  return lines.join("\n");
}
