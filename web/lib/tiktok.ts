import { checkSlug, listBrands } from "./brands";
import { readText, readTextCached, signedUrl, writeText } from "./storage";

/** What cse/tiktok.py saves to brands/<brand>/tiktok/latest.json. */
export type Read = { product: string; category: string; hook: string; angle: string; format: string };
/** Kalodata grade for a product (cse/kalodata.py), and what a post sold. */
export type Kalo = { name: string; id: string; grade: string; why: string; revenue: number; price?: number };
export type Sold = { revenue: number; sales: number; ad: boolean };
export type TPost = {
  code: string;
  handle: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  date: string;
  ts: number;
  age_h: number;
  x: number;
  images: string[];
  read?: Read;
  shoppable?: boolean;
  kalo?: Kalo | null;
  sold?: Sold | null;
};
export type Board = { name: string; posts: number; avg: number; best: number; hits: number; flops: number; x: number };
export type LineupItem = {
  name: string;
  commission?: string;
  note?: string;
  added?: string;
  posts?: number;
  hits?: number;
  best?: number;
  avg?: number;
  status?: "hot" | "testing" | "cut";
  kalo?: Kalo | null;
};
export type Alert = { kind: "product" | "format"; name: string; accounts: string[]; views: number };
export type Daily = {
  updated: string;
  accounts: Record<string, { usual: number; posts: number; own: boolean }>;
  breakouts: TPost[];
  own: TPost[];
  angles: Board[];
  products: Board[];
  lineup: LineupItem[];
  alerts: Alert[];
  angle_help: Record<string, string>;
};

const key = (brand: string, name: string) => `brands/${checkSlug(brand)}/tiktok/${name}`;

export async function loadDaily(brand: string): Promise<Daily | null> {
  const raw = await readTextCached(key(brand, "latest.json"), 30_000);
  return raw ? (JSON.parse(raw) as Daily) : null;
}

/** The first TikTok Shop brand (brand.md `tiktok_shop: true`), for the /tiktok shortcut. */
export async function tiktokBrand(): Promise<string | null> {
  for (const b of await listBrands()) {
    const md = await readTextCached(`brands/${b.slug}/brand.md`, 60_000);
    if (md && /^tiktok_shop:\s*true/m.test(md)) return b.slug;
  }
  return null;
}

/** Signed links for each post's first slide (and the rest for breakouts). */
export async function slideUrls(posts: TPost[], all = false): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  await Promise.all(
    posts.map(async (p) => {
      out[p.code] = await Promise.all((all ? p.images : p.images.slice(0, 1)).map((k) => signedUrl(k)));
    }),
  );
  return out;
}

export async function readLineup(brand: string): Promise<LineupItem[]> {
  const raw = await readText(key(brand, "lineup.json"));
  return raw ? (JSON.parse(raw) as LineupItem[]) : [];
}

export async function saveLineup(brand: string, items: LineupItem[]): Promise<void> {
  const clean = items.map(({ name, commission, note, added }) => ({ name, commission, note, added }));
  await writeText(key(brand, "lineup.json"), JSON.stringify(clean, null, 2));
}

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
