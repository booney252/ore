import { checkSlug } from "./brands";
import { listKeys, readText, writeText } from "./storage";

/**
 * Copy feedback and what Ore learned from it (cse/lessons.py reads and writes the same files):
 * brands/<brand>/feedback/<id>.json, brands/<brand>/copy-lessons.md (this brand) and
 * workspace/copy-lessons.md (craft, every brand).
 */

export type Feedback = {
  id: string;
  added: string;
  who: string;
  about: string;
  doc: string;
  text: string;
  learned: string | null;
};

export const CRAFT_KEY = "workspace/copy-lessons.md";
const brandKey = (slug: string) => `brands/${checkSlug(slug)}/copy-lessons.md`;

export async function readLessons(slug: string): Promise<{ brand: string; craft: string }> {
  const [brand, craft] = await Promise.all([readText(brandKey(slug)), readText(CRAFT_KEY)]);
  return { brand: (brand ?? "").trim(), craft: (craft ?? "").trim() };
}

export async function saveLessons(slug: string, which: "brand" | "craft", text: string): Promise<void> {
  await writeText(which === "brand" ? brandKey(slug) : CRAFT_KEY, text.trim() + "\n", "text/markdown");
}

export async function listFeedback(slug: string): Promise<Feedback[]> {
  const keys = (await listKeys(`brands/${checkSlug(slug)}/feedback/`)).filter((k) => k.endsWith(".json")).sort().reverse();
  const items = await Promise.all(keys.map(async (k) => JSON.parse((await readText(k)) ?? "null") as Feedback | null));
  return items.filter((f): f is Feedback => Boolean(f));
}

export async function addFeedback(
  slug: string,
  f: { text: string; who: string; about: string; doc: string },
): Promise<string> {
  const now = new Date();
  const id = `${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(16).slice(2, 8)}`;
  const item: Feedback = { id, added: now.toISOString().slice(0, 19) + "+00:00", learned: null, ...f };
  await writeText(`brands/${checkSlug(slug)}/feedback/${id}.json`, JSON.stringify({ ...item, copy: "" }, null, 2));
  return id;
}
