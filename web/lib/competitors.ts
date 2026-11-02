import { checkSlug } from "./brands";
import { readText, readTextCached, writeText } from "./storage";

export type Ring = "direct" | "adjacent" | "relative";
export const RINGS: Ring[] = ["direct", "adjacent", "relative"];

export type Competitor = {
  name: string;
  ring?: string;
  website?: string;
  facebook_page?: string;
  why?: string;
  source?: string;
  status?: string;
  fb_page_id?: string;
  fb_page_name?: string;
  fb_page_match?: string;
  instagram?: string;
  app_store_url?: string;
};

type Doc = { competitors: Competitor[]; [k: string]: unknown };

const key = (slug: string) => `brands/${checkSlug(slug)}/competitors.json`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function load(slug: string): Promise<Doc> {
  const raw = await readText(key(slug));
  return raw ? (JSON.parse(raw) as Doc) : { brand: slug, competitors: [] };
}

async function save(slug: string, doc: Doc) {
  doc.updated_at = new Date().toISOString();
  await writeText(key(slug), JSON.stringify(doc, null, 2) + "\n");
}

export async function listCompetitors(slug: string): Promise<Competitor[]> {
  return (await load(slug)).competitors.filter((c) => c.status !== "removed");
}

/** "…ads/library/?…view_all_page_id=123…", "…?id=123", "…/profile.php?id=123" or a bare page id -> "123" */
export function pageIdFrom(url: string): string {
  const u = url.trim();
  return u.match(/[?&]view_all_page_id=(\d+)/)?.[1] ?? u.match(/[?&]id=(\d{6,})/)?.[1] ?? (/^\d{6,}$/.test(u) ? u : "");
}

/** Point a competitor at the Ad Library page you pasted. Ads pulled from its old page are dropped,
 *  and the next pull uses this page. */
export async function setCompetitorPage(slug: string, name: string, link: string): Promise<boolean> {
  const pageId = pageIdFrom(link);
  if (!pageId) return false;
  const doc = await load(slug);
  const c = doc.competitors.find((x) => x.name === name);
  if (!c) return false;
  const old = c.fb_page_id;
  c.fb_page_id = pageId;
  c.fb_page_match = "set by you";
  delete c.fb_page_name;
  await save(slug, doc);
  if (old && old !== pageId) {
    const adsKey = `brands/${checkSlug(slug)}/ads.json`;
    const raw = await readText(adsKey);
    if (raw) {
      const ads = JSON.parse(raw);
      for (const [id, a] of Object.entries(ads.ads as Record<string, { brand?: string; page_id?: string }>)) {
        if (a.brand === name && a.page_id && a.page_id !== pageId) delete ads.ads[id];
      }
      await writeText(adsKey, JSON.stringify(ads, null, 2) + "\n");
    }
  }
  return true;
}

/** How many ads Ore has for each competitor. */
export async function adCounts(slug: string): Promise<Record<string, number>> {
  const raw = await readTextCached(`brands/${checkSlug(slug)}/ads.json`);
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const a of Object.values(JSON.parse(raw).ads as Record<string, { brand?: string }>)) if (a.brand) out[a.brand] = (out[a.brand] ?? 0) + 1;
  return out;
}

/**
 * Add a competitor you found (or bring back one you removed). Marked as yours and approved;
 * the next ads pull finds its Ad Library page, unless you gave the page link.
 */
export async function addCompetitor(
  slug: string,
  c: { name: string; ring: Ring; website: string; adLibrary: string; instagram: string; why: string },
): Promise<"added" | "updated"> {
  const doc = await load(slug);
  const existing = doc.competitors.find((x) => norm(x.name) === norm(c.name));
  const pageId = pageIdFrom(c.adLibrary);
  const fields: Competitor = {
    name: c.name,
    ring: c.ring,
    ...(c.website && { website: c.website }),
    ...(c.why && { why: c.why }),
    ...(c.instagram && { instagram: c.instagram.replace(/^@/, "") }),
    ...(pageId && { fb_page_id: pageId, fb_page_match: "set by you" }),
    ...(!pageId && c.adLibrary && { facebook_page: c.adLibrary }),
    source: "you",
    status: "approved",
  };
  if (existing) {
    // A competitor checked earlier and marked "no page" gets searched again if you add it back.
    if (!pageId && existing.fb_page_id === "none") delete existing.fb_page_id;
    Object.assign(existing, fields);
  } else {
    doc.competitors.push(fields);
  }
  await save(slug, doc);
  return existing ? "updated" : "added";
}

export async function removeCompetitor(slug: string, name: string): Promise<void> {
  const doc = await load(slug);
  for (const c of doc.competitors) if (c.name === name) c.status = "removed";
  await save(slug, doc);
}
