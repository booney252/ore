import { cache } from "react";
import { checkSlug } from "./brands";
import { readText, signedUrl } from "./storage";

export type Line = { start: number; end: number; text: string };
export type Ad = {
  ad_id: string;
  brand: string;
  ring?: string;
  is_own?: boolean;
  start_date?: string;
  is_active?: boolean;
  platforms?: string[];
  body?: string;
  headline?: string;
  cta?: string;
  media_type?: string;
  media_key?: string;
  ad_library_url?: string;
  days_running?: number;
  versions?: number;
  score?: number;
  score_why?: string;
  removed_from_library?: string;
  analysis?: {
    length_s?: number;
    cut_count?: number;
    cuts_per_second?: number;
    transcript?: Line[];
    hook_line?: string;
    frames?: { t: number; key: string }[];
  };
  breakdown?: Record<string, unknown> & { hook_line?: string; format?: string; angle?: string };
};

export const loadAds = cache(async (slug: string): Promise<Ad[]> => {
  const raw = await readText(`brands/${checkSlug(slug)}/ads.json`);
  if (!raw) return [];
  return Object.values(JSON.parse(raw).ads as Record<string, Ad>);
});

/** Same ranking the report uses: broken-down, still in the Ad Library, best score first. */
export function winners(ads: Ad[], perBrand = 3): Ad[] {
  const pool = ads
    .filter((a) => a.breakdown && !a.removed_from_library)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const counts = new Map<string, number>();
  return pool.filter((a) => {
    const n = (counts.get(a.brand) ?? 0) + 1;
    counts.set(a.brand, n);
    return n <= perBrand;
  });
}

export function stats(ads: Ad[]) {
  return {
    total: ads.length,
    advertisers: new Set(ads.map((a) => a.brand)).size,
    brokenDown: ads.filter((a) => a.breakdown).length,
    active: ads.filter((a) => a.is_active && !a.removed_from_library).length,
  };
}

export type Tier = "diamond" | "emerald" | "ruby";
export function tier(score = 0): Tier {
  return score >= 75 ? "diamond" : score >= 50 ? "emerald" : "ruby";
}

/** The opening line, without the analyst's notes: '"best way?" (on-screen text, no speech)' -> 'best way?' */
export function hook(ad: Ad): string {
  return String(ad.breakdown?.hook_line || ad.analysis?.hook_line || ad.headline || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
}

export async function posterUrl(ad: Ad): Promise<string | null> {
  const key = ad.analysis?.frames?.[0]?.key ?? (ad.media_type === "image" ? ad.media_key : undefined);
  return key ? signedUrl(key) : null;
}
