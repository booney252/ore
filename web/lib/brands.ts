import { exists, listFolders, listKeys, readText, writeText } from "./storage";

export type Kind = "reports" | "iterations" | "briefs";

export const KIND_LABEL: Record<Kind, string> = {
  reports: "Reports",
  iterations: "Iterations",
  briefs: "Creative briefs",
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const FILE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z0-9-]*$/;

export function checkSlug(slug: string): string {
  if (!SLUG.test(slug)) throw new Error("bad brand");
  return slug;
}

export function checkFile(name: string): string {
  if (!FILE.test(name)) throw new Error("bad file");
  return name;
}

export async function listBrands(): Promise<{ slug: string; name: string }[]> {
  const slugs = (await listFolders("brands/")).filter((s) => SLUG.test(s));
  return Promise.all(slugs.map(async (slug) => ({ slug, name: await brandName(slug) })));
}

export async function brandName(slug: string): Promise<string> {
  const md = await readText(`brands/${checkSlug(slug)}/brand.md`);
  const m = md?.match(/^name:\s*"?([^"\n]+)"?\s*$/m);
  return m ? m[1].trim() : slug;
}

/** File names (without .md) for one kind, newest first. */
export async function listDocs(slug: string, kind: Kind): Promise<string[]> {
  const prefix = `brands/${checkSlug(slug)}/${kind}/`;
  return (await listKeys(prefix))
    .filter((k) => k.endsWith(".md"))
    .map((k) => k.slice(prefix.length, -3))
    .filter((n) => FILE.test(n))
    .reverse();
}

export async function readDoc(slug: string, kind: Kind, file: string): Promise<string | null> {
  return readText(`brands/${checkSlug(slug)}/${kind}/${checkFile(file)}.md`);
}

/** "### Iteration 3: Fridge" -> {n: 3, title: "Fridge"} */
export function parseIterations(md: string): { n: number; title: string }[] {
  const out: { n: number; title: string }[] = [];
  for (const m of md.matchAll(/^#{2,4}\s*Iteration\s+(\d+)\s*[:.\-]?\s*(.*)$/gm)) {
    out.push({ n: Number(m[1]), title: m[2].trim() });
  }
  return out;
}

/** A report's ranked winners (reports/<date>.json), or null for a report without one. */
export async function reportTop(
  slug: string,
  file: string,
): Promise<{ rank: number; ad_id: string }[] | null> {
  const raw = await readText(`brands/${checkSlug(slug)}/reports/${checkFile(file)}.json`);
  return raw ? (JSON.parse(raw).top as { rank: number; ad_id: string }[]) : null;
}

/** "Peptide Pal!" -> "peptide-pal" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** Same fields as the Python template (cse/brand.py); the setup job fills in the empty ones. */
export async function createBrand(b: {
  slug: string;
  name: string;
  about: string;
  website: string;
  competitors: string[];
}): Promise<void> {
  const v = (x: unknown) => JSON.stringify(x);
  const md = `---
# Brand brain for ${b.name}. Drafted by Ore's setup from what you typed; edit anything.
name: ${v(b.name)}
website: ${v(b.website)}
product: ${v(b.about)}
niche: ""
audience: ""
age_range: ""
problem: ""
country: "US"
communities: []
category_examples: []
offer: ""
app_store_url: ""
play_store_url: ""
known_competitors: ${v(b.competitors)}
health_product: false
ad_format: "UGC: a real creator talking to camera, shot on a phone, 20-60s full video with a word-for-word script"
---

# ${b.name}

## Product

${b.about}

## Notes
`;
  await writeText(`brands/${checkSlug(b.slug)}/brand.md`, md, "text/markdown; charset=utf-8");
}

export async function brandExists(slug: string): Promise<boolean> {
  return exists(`brands/${checkSlug(slug)}/brand.md`);
}

/** What a brand still needs before the weekly report can run. */
export async function setupState(slug: string) {
  const base = `brands/${checkSlug(slug)}/`;
  const [md, competitors, voc, ads, brief] = await Promise.all([
    readText(`${base}brand.md`),
    exists(`${base}competitors.json`),
    exists(`${base}voc.json`),
    exists(`${base}ads.json`),
    exists(`${base}research-brief.md`),
  ]);
  const profile = /^audience:\s*"?[^"\s#]/m.test(md ?? "");
  return { profile, competitors, voc, ads, brief, ready: profile && competitors && ads && brief };
}

export const RESEARCH_STEPS = [
  { file: "01-competitors", label: "Competitors" },
  { file: "02-psychographics", label: "Psychographics" },
  { file: "03-awareness", label: "Awareness" },
] as const;

/** The research brief plus the latest run's step outputs (research/<date>/0N-*.md). */
export async function readResearch(slug: string) {
  const base = `brands/${checkSlug(slug)}/`;
  const keys = await listKeys(`${base}research/`);
  const dates = [...new Set(keys.map((k) => k.slice(base.length + 9).split("/")[0]))]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const date = dates.at(-1) ?? null;
  const [brief, ...steps] = await Promise.all([
    readText(`${base}research-brief.md`),
    ...RESEARCH_STEPS.map((s) => (date ? readText(`${base}research/${date}/${s.file}.md`) : null)),
  ]);
  return { brief, date, steps: RESEARCH_STEPS.map((s, i) => ({ ...s, text: steps[i] })) };
}

export async function vocCounts(slug: string): Promise<{ total: number; pasted: number } | null> {
  const raw = await readText(`brands/${checkSlug(slug)}/voc.json`);
  if (!raw) return null;
  const doc = JSON.parse(raw) as { quotes: { source: string }[] };
  return {
    total: doc.quotes.length,
    pasted: doc.quotes.filter((q) => q.source === "pasted").length,
  };
}

export async function savePaste(slug: string, source: string, text: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const body = (source ? `source: ${source}\n\n` : "") + text.trim() + "\n";
  await writeText(`brands/${checkSlug(slug)}/voc-paste/${stamp}.md`, body, "text/markdown; charset=utf-8");
}
