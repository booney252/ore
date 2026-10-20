import { loadAds, posterUrl, strength, type Ad } from "./ads";
import { checkSlug, listBrands } from "./brands";
import type { Creator } from "./creators";
import { listKeys, readText, writeText } from "./storage";

/** Creator Studio: the creator-facing side. Brands opt in with `studio: true` in brand.md. */

export type StudioBrand = {
  slug: string;
  name: string;
  product: string;
  format: string;
  winners: Ad[];
  poster: string | null;
};

const field = (md: string, name: string) =>
  md.match(new RegExp(`^${name}:\\s*"?(.*?)"?\\s*(?:#.*)?$`, "m"))?.[1] ?? "";

async function brandInfo(slug: string, name: string): Promise<StudioBrand | null> {
  const md = (await readText(`brands/${checkSlug(slug)}/brand.md`)) ?? "";
  if (!/^studio:\s*true/m.test(md)) return null;
  const ads = await loadAds(slug);
  const winners = ads
    .filter((a) => a.breakdown && !a.removed_from_library)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || strength(b) - strength(a));
  return {
    slug,
    name: field(md, "name") || name,
    product: field(md, "product"),
    format: field(md, "default_format") || "ugc",
    winners,
    poster: winners[0] ? await posterUrl(winners[0]) : null,
  };
}

export async function studioBrands(): Promise<StudioBrand[]> {
  const all = await Promise.all((await listBrands()).map((b) => brandInfo(b.slug, b.name)));
  return all.filter((b): b is StudioBrand => Boolean(b));
}

export async function studioBrand(slug: string): Promise<StudioBrand | null> {
  return brandInfo(slug, slug);
}

/** A few lines from the brand's research brief: who buys, their pains, objections and the rules. */
export async function brainSnapshot(slug: string): Promise<{ title: string; items: string[] }[]> {
  const md = (await readText(`brands/${checkSlug(slug)}/research-brief.md`)) ?? "";
  const sections = md.split(/^##\s+/m).slice(1);
  const pick = (re: RegExp, title: string) => {
    const s = sections.find((x) => re.test(x.split("\n")[0]));
    if (!s) return null;
    const items = s
      .split("\n")
      .slice(1)
      .filter((l) => /^\s*(-|\d+\.)\s+/.test(l))
      .map((l) => l.replace(/^\s*(-|\d+\.)\s+/, "").replace(/\*\*/g, ""))
      .map((l) => (l.length > 140 ? l.slice(0, 137).replace(/\s+\S*$/, "") + "…" : l))
      .slice(0, 3);
    return items.length ? { title, items } : null;
  };
  return [
    pick(/pain/i, "What hurts"),
    pick(/desire|want/i, "What they want"),
    pick(/objection/i, "What stops them"),
    pick(/rule/i, "Rules for your scripts"),
  ].filter((x): x is { title: string; items: string[] } => Boolean(x));
}

// --- the creator's own profile ---

export async function getMe(): Promise<Creator | null> {
  const raw = await readText("studio/me.json");
  if (raw) return JSON.parse(raw) as Creator;
  const old = await readText("studio/creators.json");
  return old ? ((JSON.parse(old).creators as Creator[])[0] ?? null) : null;
}

export async function saveMe(data: Omit<Creator, "id">): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "").trim().slice(0, k === "name" ? 80 : 1500)]),
  );
  await writeText("studio/me.json", JSON.stringify({ ...clean, id: "me" }, null, 2) + "\n");
}

// --- sessions ---

export type Angle = { n: number; title: string; body: string };
export type Session = {
  id: string;
  brand: string;
  ad_id?: string | null;
  status: "new" | "angles" | "writing" | "scripts";
  angles?: Angle[];
  picked?: number[];
  format?: string;
  length?: string;
  per_angle?: number;
  notes?: string;
  ads?: string[];
  created_at: string;
};

const SESSION = /^[0-9]{14}-[a-z0-9]{1,12}$/;

export async function createSession(brand: string, adId: string | null): Promise<string> {
  const now = new Date();
  const id = `${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
  const s: Session = { id, brand: checkSlug(brand), ad_id: adId, status: "new", created_at: now.toISOString() };
  await writeText(`studio/sessions/${id}.json`, JSON.stringify(s, null, 2) + "\n");
  return id;
}

export async function readSession(id: string): Promise<{ session: Session; md: string | null } | null> {
  if (!SESSION.test(id)) return null;
  const raw = await readText(`studio/sessions/${id}.json`);
  if (!raw) return null;
  return { session: JSON.parse(raw) as Session, md: await readText(`studio/sessions/${id}.md`) };
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<Session | null> {
  const found = await readSession(id);
  if (!found) return null;
  const next = { ...found.session, ...patch };
  await writeText(`studio/sessions/${id}.json`, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export async function listSessions(limit = 20): Promise<Session[]> {
  const keys = (await listKeys("studio/sessions/")).filter((k) => k.endsWith(".json")).reverse().slice(0, limit);
  const all = await Promise.all(keys.map(async (k) => readText(k)));
  return all.filter((r): r is string => Boolean(r)).map((r) => JSON.parse(r) as Session);
}
