import { checkSlug } from "./brands";
import { listKeys, readText, signedUrl } from "./storage";

/** A day of rendered TikTok slides (cse/slides.py publishes them). */
export type SlidePost = {
  id: string;
  bucket: "copy" | "plug" | "tweak" | "rerun" | "test";
  hook: string;
  product?: string;
  caption?: string;
  source?: { handle?: string; code?: string; views?: number } | null;
  slides: string[];
};
export type SlideDay = { date: string; updated: string; posts: SlidePost[]; needs_photos: string[] };

export const BUCKETS: { key: SlidePost["bucket"]; label: string; help: string }[] = [
  { key: "copy", label: "Copy what's winning", help: "A breakout copied directly, our pictures" },
  { key: "plug", label: "Iterate on what's winning", help: "A breakout with our product plugged in" },
  { key: "tweak", label: "Iterate on my winners", help: "Our winners with a small tweak" },
  { key: "rerun", label: "Reruns", help: "Our winners redone" },
  { key: "test", label: "New tests", help: "Our own ideas from what's winning" },
];

const base = (brand: string) => `brands/${checkSlug(brand)}/slides`;

export async function slideDays(brand: string): Promise<string[]> {
  const keys = await listKeys(`${base(brand)}/days/`);
  return [...new Set(keys.map((k) => k.split("/days/")[1]?.split("/")[0]).filter((d): d is string => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "")))]
    .sort()
    .reverse();
}

export async function loadSlideDay(brand: string, date?: string): Promise<SlideDay | null> {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (await readText(`${base(brand)}/latest.txt`))?.trim();
  if (!d) return null;
  const raw = await readText(`${base(brand)}/days/${d}/plan.json`);
  return raw ? (JSON.parse(raw) as SlideDay) : null;
}

export async function signAll(keys: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await signedUrl(k)] as const)));
}
