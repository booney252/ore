import { loadAds, posterUrl, type Ad } from "./ads";
import { brandName, checkSlug, listBrands } from "./brands";
import type { Creator } from "./creators";
import { listKeys, readText, writeText } from "./storage";

/** Creator Studio: the creator-facing side. Brands opt in with `studio: true` in brand.md. */

export type StudioBrand = { slug: string; name: string; product: string; winners: Ad[]; poster: string | null };

const field = (md: string, name: string) =>
  md.match(new RegExp(`^${name}:\\s*"?(.*?)"?\\s*(?:#.*)?$`, "m"))?.[1] ?? "";

export async function studioBrands(): Promise<StudioBrand[]> {
  const out: StudioBrand[] = [];
  for (const b of await listBrands()) {
    const md = (await readText(`brands/${b.slug}/brand.md`)) ?? "";
    if (!/^studio:\s*true/m.test(md)) continue;
    const ads = await loadAds(b.slug);
    const winners = ads
      .filter((a) => a.breakdown && !a.removed_from_library)
      .sort((a, b2) => (b2.score ?? 0) - (a.score ?? 0) || (b2.days_running ?? 0) - (a.days_running ?? 0));
    out.push({
      slug: b.slug,
      name: b.name,
      product: field(md, "product"),
      winners,
      poster: winners[0] ? await posterUrl(winners[0]) : null,
    });
  }
  return out;
}

export async function isStudioBrand(slug: string): Promise<boolean> {
  const md = await readText(`brands/${checkSlug(slug)}/brand.md`);
  return Boolean(md && /^studio:\s*true/m.test(md));
}

// --- studio creators (account-level, not per brand) ---

const CREATORS = "studio/creators.json";

export async function studioCreators(): Promise<Creator[]> {
  const raw = await readText(CREATORS);
  return raw ? (JSON.parse(raw).creators as Creator[]) : [];
}

export async function saveStudioCreator(data: Omit<Creator, "id">, id?: string): Promise<string> {
  const all = await studioCreators();
  const clean = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "").trim().slice(0, k === "name" ? 80 : 1500)]),
  ) as Omit<Creator, "id">;
  let newId = id && all.some((c) => c.id === id) ? id : "";
  if (!newId) {
    const base =
      clean.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "creator";
    newId = base;
    for (let n = 2; all.some((c) => c.id === newId); n++) newId = `${base}-${n}`;
  }
  const next = all.some((c) => c.id === newId)
    ? all.map((c) => (c.id === newId ? { ...clean, id: newId } : c))
    : [...all, { ...clean, id: newId }];
  await writeText(CREATORS, JSON.stringify({ creators: next }, null, 2) + "\n");
  return newId;
}

// --- scripts ---

export type ScriptMeta = {
  file: string;
  brand: string;
  creator: string | null;
  format: string;
  count: number;
  notes?: string;
  ads: string[];
  created: string;
};

const FILE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z0-9-]*$/;

export async function listScripts(limit = 20): Promise<ScriptMeta[]> {
  const keys = (await listKeys("studio/scripts/")).filter((k) => k.endsWith(".json")).reverse().slice(0, limit);
  const metas = await Promise.all(
    keys.map(async (k) => {
      const raw = await readText(k);
      return raw ? ({ ...JSON.parse(raw), file: k.slice(15, -5) } as ScriptMeta) : null;
    }),
  );
  return metas.filter((m): m is ScriptMeta => Boolean(m));
}

export async function readScript(file: string): Promise<{ md: string; meta: ScriptMeta } | null> {
  if (!FILE.test(file)) return null;
  const [md, raw] = await Promise.all([
    readText(`studio/scripts/${file}.md`),
    readText(`studio/scripts/${file}.json`),
  ]);
  return md && raw ? { md, meta: { ...JSON.parse(raw), file } } : null;
}

export { brandName };
