import { exists, listFolders, listKeys, readText, writeText } from "./storage";

export type Kind = "reports" | "scripts" | "briefs";

export const KIND_LABEL: Record<Kind, string> = {
  reports: "Winning Ads Reports",
  scripts: "Scripts",
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

/** "#### Idea 3: Fridge" -> {n: 3, title: "Fridge"} */
export function parseIdeas(reportMd: string): { n: number; title: string }[] {
  const out: { n: number; title: string }[] = [];
  for (const m of reportMd.matchAll(/^#{2,4}\s*Idea\s+(\d+)\s*[:.\-]?\s*(.*)$/gm)) {
    out.push({ n: Number(m[1]), title: m[2].trim() });
  }
  return out;
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
  const [md, competitors, ads, brief] = await Promise.all([
    readText(`${base}brand.md`),
    exists(`${base}competitors.json`),
    exists(`${base}ads.json`),
    exists(`${base}research-brief.md`),
  ]);
  const profile = /^audience:\s*"?[^"\s#]/m.test(md ?? "");
  return { profile, competitors, ads, brief, ready: profile && competitors && ads && brief };
}
