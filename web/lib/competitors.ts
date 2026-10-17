import { checkSlug } from "./brands";
import { readText, writeText } from "./storage";

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

/** "…ads/library/?…view_all_page_id=123…" or "…?id=123" -> "123" */
export function pageIdFrom(url: string): string {
  return url.match(/[?&]view_all_page_id=(\d+)/)?.[1] ?? "";
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
