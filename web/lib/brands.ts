import { listFolders, listKeys, readText } from "./storage";

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
