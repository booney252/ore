import { deleteKey, exists, listFolders, listKeys, readText, writeText } from "./storage";

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

export type Segment = { key: string; label: string };

/** brand.md `segments`: the audiences a brand writes for separately ("key | Label | who | handles"). */
export async function brandSegments(slug: string): Promise<Segment[]> {
  const md = (await readText(`brands/${checkSlug(slug)}/brand.md`)) ?? "";
  const block = md.match(/^segments:\s*\n((?:[ \t]+-.*\n?)+)/m)?.[1] ?? "";
  return [...block.matchAll(/^[ \t]+-\s*["']?([a-z0-9-]{1,20})\s*\|\s*([^|"'\n]+)/gm)].map((m) => ({
    key: m[1],
    label: m[2].trim(),
  }));
}

/** brand.md `campaign_type`: "organic" (affiliates or creators posting on their own pages) or "paid" (Meta ads). */
export async function campaignType(slug: string): Promise<"organic" | "paid"> {
  const md = (await readText(`brands/${checkSlug(slug)}/brand.md`)) ?? "";
  return /^campaign_type:\s*"?organic/m.test(md) ? "organic" : "paid";
}

/** The format a brand's writing defaults to (brand.md `default_format`), e.g. "talking" for organic. */
export async function defaultFormat(slug: string): Promise<string> {
  const md = (await readText(`brands/${checkSlug(slug)}/brand.md`)) ?? "";
  return md.match(/^default_format:\s*"?([a-z]+)/m)?.[1] ?? "ugc";
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

/** Names of the briefs or iterations inside a doc: "### Brief 2: Fridge" -> "Fridge". */
export async function docTitles(slug: string, kind: Kind, files: string[]): Promise<Record<string, string[]>> {
  const word = kind === "briefs" ? "Brief" : "Iteration";
  const re = new RegExp(`^#{2,4}\\s*${word}\\s+\\d+\\s*[:.\\-]?\\s*(.*)$`, "gm");
  const entries = await Promise.all(
    files.map(async (f) => {
      const md = (await readDoc(slug, kind, f)) ?? "";
      return [f, [...md.matchAll(re)].map((m) => m[1].trim()).filter(Boolean)] as const;
    }),
  );
  return Object.fromEntries(entries);
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
  ingredients?: string[];
  mechanism?: string;
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
ingredients: ${v(b.ingredients ?? [])}
unique_mechanism: ${v(b.mechanism ?? "")}
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
  const keys = new Set(await listKeys(`${base}research/`));
  const dates = [...new Set([...keys].map((k) => k.slice(base.length + 9).split("/")[0]))]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  // each step from the newest run that has it (a later run, e.g. unique mechanisms, may not redo 1-3)
  const latest = (file: string) => [...dates].reverse().find((d) => keys.has(`${base}research/${d}/${file}.md`)) ?? null;
  const stepDates = RESEARCH_STEPS.map((s) => latest(s.file));
  const [brief, ...steps] = await Promise.all([
    readText(`${base}research-brief.md`),
    ...RESEARCH_STEPS.map((s, i) => (stepDates[i] ? readText(`${base}research/${stepDates[i]}/${s.file}.md`) : null)),
  ]);
  const date = stepDates.filter(Boolean).sort().at(-1) ?? dates.at(-1) ?? null;
  return { brief, date, steps: RESEARCH_STEPS.map((s, i) => ({ ...s, text: steps[i], date: stepDates[i] })) };
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

/**
 * Delete an iteration set or brief doc from the site. It's moved to brands/<slug>/trash/<kind>/
 * rather than erased, so it can be brought back by hand if it was a mistake.
 */
export async function deleteDoc(slug: string, kind: "iterations" | "briefs", file: string): Promise<void> {
  const key = `brands/${checkSlug(slug)}/${kind}/${checkFile(file)}.md`;
  const md = await readText(key);
  if (md === null) return;
  await writeText(`brands/${slug}/trash/${kind}/${file}.md`, md, "text/markdown; charset=utf-8");
  await deleteKey(key);
}

/** Ingredients list from the form: one per line, or comma-separated if it's all on one line. */
export function splitIngredients(text: string): string[] {
  return text
    .split(text.includes("\n") ? /\n/ : /,(?![^(]*\))/)
    .map((i) => i.replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

/** The brand's ingredients, unique mechanism and (once run) the claims doc. */
export async function readIngredients(slug: string) {
  const base = `brands/${checkSlug(slug)}/`;
  const [md, claims, mechanisms, chosen, ranked] = await Promise.all([
    readText(`${base}brand.md`),
    readText(`${base}ingredient-claims.md`),
    readText(`${base}unique-mechanisms.md`),
    readText(`${base}unique-mechanisms-chosen.md`),
    readText(`${base}unique-mechanisms-ranked.md`),
  ]);
  const head = md?.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const field = (name: string) => head.match(new RegExp(`^${name}:\\s*(.*?)\\s*(?:#.*)?$`, "m"))?.[1] ?? "";
  const parse = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.replace(/^["']|["']$/g, "");
    }
  };
  const rawItems = parse(field("ingredients") || "[]");
  const items = Array.isArray(rawItems) ? rawItems.map(String) : splitIngredients(String(rawItems));
  return {
    items,
    mechanism: String(parse(field("unique_mechanism") || '""')),
    claims,
    mechanisms,
    chosen: chosen ? parseMechanisms(chosen).ideas.map((i) => i.name) : [],
    ranked,
  };
}

/** Set front-matter fields in brand.md (values written as JSON, which YAML reads as-is). */
export async function setBrandFields(slug: string, values: Record<string, unknown>): Promise<void> {
  const key = `brands/${checkSlug(slug)}/brand.md`;
  const md = await readText(key);
  if (!md) throw new Error("no brand.md");
  const end = md.indexOf("\n---", 4);
  let head = md.slice(0, end);
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}: ${JSON.stringify(value)}`;
    const re = new RegExp(`^${name}:.*$`, "m");
    head = re.test(head) ? head.replace(re, line) : `${head}\n${line}`;
  }
  await writeText(key, head + md.slice(end), "text/markdown; charset=utf-8");
}

export type Mechanism = { n: number; name: string; body: string };

/** Split the unique-mechanisms report into its numbered ideas ("### 3. The Memory Gap") and the rest. */
export function parseMechanisms(md: string): { ideas: Mechanism[]; after: string } {
  const heads = [...md.matchAll(/^#{2,4}\s*(\d+)[.)]\s*(.+)$/gm)];
  const ideas: Mechanism[] = [];
  let end = md.length;
  const tail = md.search(/^##\s+(?!\d)/m);
  heads.forEach((m, i) => {
    const start = m.index! + m[0].length;
    let stop = i + 1 < heads.length ? heads[i + 1].index! : md.length;
    if (tail > start && tail < stop) stop = tail;
    ideas.push({ n: Number(m[1]), name: m[2].trim(), body: md.slice(start, stop).trim() });
  });
  if (tail > (heads.at(-1)?.index ?? -1)) end = tail;
  return { ideas, after: end < md.length ? md.slice(end).trim() : "" };
}

/** Save the mechanisms the user picked: their full write-ups, and a short version in brand.md. */
export async function saveChosenMechanisms(slug: string, numbers: number[]): Promise<number> {
  const base = `brands/${checkSlug(slug)}/`;
  const md = await readText(`${base}unique-mechanisms.md`);
  if (!md) return 0;
  await deleteKey(`${base}unique-mechanisms-ranked.md`); // a new pick needs a new ranking
  const picked = parseMechanisms(md).ideas.filter((i) => numbers.includes(i.n));
  if (!picked.length) {
    await deleteKey(`${base}unique-mechanisms-chosen.md`);
    await setBrandFields(slug, { unique_mechanism: "" });
    return 0;
  }
  const doc = picked.map((i) => `### ${i.n}. ${i.name}\n\n${i.body}`).join("\n\n");
  await writeText(`${base}unique-mechanisms-chosen.md`, doc + "\n", "text/markdown; charset=utf-8");
  const short = picked
    .map((i) => {
      const line = i.body.match(/two-part connection[^:]*:\**\s*(.+)/i)?.[1]?.trim();
      return line ? `${i.name}: ${line}` : i.name;
    })
    .join(" | ");
  await setBrandFields(slug, { unique_mechanism: short });
  return picked.length;
}

