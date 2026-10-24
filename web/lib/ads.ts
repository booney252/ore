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
  /** Organic posts (Reels, TikToks, Shorts) are graded on views vs the account's usual. */
  source?: "organic";
  platform?: string;
  handle?: string;
  url?: string;
  views?: number;
  likes?: number;
  comments?: number;
  usual_views?: number;
  usual_comment_rate?: number;
  rising?: boolean; // new (under 30 days), still running, already beating its advertiser's usual (cse/score.py)
  usual_days?: number | null; // the advertiser's usual ad life: median days its stopped ads ran
  min_views?: number; // views a post needs to count as a winner (A or B)
  on_topic?: boolean; // false: blew up, but not about the niche (cse/organic.py check_topics)
  topic_why?: string;
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

/**
 * Best winner grade first, still in the Ad Library, at most `perBrand` per advertiser.
 * Ads not broken down yet are included (shown as "not taken apart yet") as long as there's
 * something to look at: key frames, or the image itself for a static.
 */
export function winners(ads: Ad[], perBrand = 3): Ad[] {
  const pool = ads
    .filter((a) => !a.removed_from_library && (a.breakdown || viewable(a)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || strength(b) - strength(a));
  const counts = new Map<string, number>();
  return pool.filter((a) => {
    const n = (counts.get(a.brand) ?? 0) + 1;
    counts.set(a.brand, n);
    return n <= perBrand;
  });
}

export const KINDS = [
  { key: "ugc", label: "UGC" },
  { key: "broll", label: "B-roll" },
  { key: "lfs", label: "LFS" },
  { key: "static", label: "Static" },
] as const;
export type Kind = (typeof KINDS)[number]["key"];

/** Ad copy this long or longer (in words) makes it LFS: long-form copy that reads like a letter in the feed. */
export const LFS_WORDS = 400;

const words = (text?: string) => (text ?? "").split(/\s+/).filter(Boolean).length;

/**
 * Which pile an ad sorts into. LFS (long-form copy: 400+ words of ad text, with any image or video)
 * comes first; then static (an image), UGC (a person on camera) or B-roll (footage, voiceover,
 * screen recordings, slideshows). Null for a short-copy video that hasn't been taken apart yet,
 * since we can't tell UGC from B-roll without the breakdown.
 */
export function kind(ad: Ad): Kind | null {
  if (words(ad.body) >= LFS_WORDS) return "lfs";
  const format = String(ad.breakdown?.format ?? "").toLowerCase();
  if (ad.media_type === "image" || ad.media_type === "slideshow" || format.startsWith("static")) return "static";
  if (!format) return null;
  if (/ugc|talking.head|selfie|skit|creator|testimonial|interview|podcast/.test(format)) return "ugc";
  // "mixed" and other loose labels: UGC when someone talks to the camera (selfie, green screen...).
  // Only an explicit b-roll, voiceover, slideshow, screen recording or animation stays B-roll.
  if (/b-roll|broll|voiceover|slideshow|screen recording|animation|montage/.test(format)) return "broll";
  const camera = String(ad.breakdown?.camera ?? "").toLowerCase();
  const creator = String(ad.breakdown?.creator ?? "").toLowerCase().trim();
  const onCamera = /talking.head|selfie|front.facing|to.camera|green.screen|webcam|propped phone/.test(camera);
  return onCamera && !/^(none|no |n\/a|faceless)/.test(creator) ? "ugc" : "broll";
}

/** Tie-breaker inside a grade: views vs the account's usual for organic posts, days live for ads. */
export function strength(ad: Ad): number {
  // within a grade: an organic post's views (the grade already says it beat its usual), a paid ad's days live
  return ad.source === "organic" ? (ad.views ?? 0) : ad.days_running ?? 0;
}

export function stats(ads: Ad[]) {
  return {
    total: ads.length,
    advertisers: new Set(ads.map((a) => a.brand)).size,
    brokenDown: ads.filter((a) => a.breakdown).length,
    active: ads.filter((a) => a.is_active && !a.removed_from_library).length,
  };
}


/** The opening line, without the analyst's notes: '"best way?" (on-screen text, no speech)' -> 'best way?' */
export function hook(ad: Ad): string {
  return String(ad.breakdown?.hook_line || ad.analysis?.hook_line || ad.headline || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
}

/** "Oct 10" (this year) or "Oct 10, 2025". */
export function posted(ad: Ad): string {
  if (!ad.start_date) return "";
  const d = new Date(`${ad.start_date}T12:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** Where to see it: the post itself, or the Ad Library. */
export function link(ad: Ad): { href: string; label: string } | null {
  if (ad.source === "organic" && ad.url) {
    const where = ad.platform === "tiktok" ? "TikTok" : ad.platform === "youtube" ? "YouTube" : "Instagram";
    return { href: ad.url, label: where };
  }
  if (ad.removed_from_library || !ad.ad_library_url) return null;
  return { href: ad.ad_library_url, label: "the Ad Library" };
}

export function viewable(ad: Ad): boolean {
  return Boolean(ad.analysis?.frames?.length || (ad.media_type === "image" && ad.media_key));
}

export async function posterUrl(ad: Ad): Promise<string | null> {
  const key = ad.analysis?.frames?.[0]?.key ?? (ad.media_type === "image" ? ad.media_key : undefined);
  return key ? signedUrl(key) : null;
}
