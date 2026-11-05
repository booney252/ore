import { createHash, randomBytes } from "node:crypto";
import { createJob } from "./jobs";
import { readText, writeText } from "./storage";

/** Free teardowns (the landing page's lead magnet). The Python side builds them: cse/teardown.py. */

export const DAILY_CAP = Number(process.env.TEARDOWN_DAILY_CAP || 20);
export const SITE = (process.env.ORE_SITE_URL || "https://ore-web-eight.vercel.app").replace(/\/$/, "");

export type App = {
  id: string;
  name: string;
  icon: string;
  genre: string;
  rating: number;
  ratings: number;
  url: string;
  seller: string;
  website: string;
  description: string;
};
export type Card = {
  ad_id: string;
  brand: string;
  via: string;
  rank: number | null;
  days: number | null;
  hook: string;
  hook_text: string;
  frame: string | null;
  format: string;
  angle: string;
  why: string;
  elements: { element: string; what: string }[];
  library: string;
  broken_down: boolean;
  found?: string;
};
export type Script = {
  creator: string;
  based_on: string;
  hook: string;
  text_hook: string;
  lines: { t: string; say: string; show?: string }[];
  why: string;
};
export type Status = "confirm" | "waitlist" | "queued" | "building" | "ready" | "paused";
export type Report = {
  id: string;
  token: string;
  status: Status;
  at: string;
  email: string;
  app: App;
  creators: string;
  creator_count: string;
  competitors?: { name: string; page: string; website: string }[];
  breakouts?: Card[];
  new?: Card[];
  scripts?: Script[];
  scripts_queued?: boolean;
  built?: string;
  tracking_until?: string;
  updated?: string;
};

const TOKEN = /^[a-f0-9]{32}$/;
const key = (token: string) => {
  if (!TOKEN.test(token)) throw new Error("bad token");
  return `teardowns/${token}.json`;
};
export const hash = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex").slice(0, 32);
export const today = () => new Date().toISOString().slice(0, 10);

export async function loadReport(token: string): Promise<Report | null> {
  if (!TOKEN.test(token)) return null;
  const raw = await readText(key(token));
  return raw ? (JSON.parse(raw) as Report) : null;
}

export async function saveReport(r: Report): Promise<void> {
  await writeText(key(r.token), JSON.stringify({ ...r, updated: new Date().toISOString() }, null, 2));
}

/** The app from an App Store link (or, failing that, the top App Store search result for a name). */
export async function lookupApp(input: string): Promise<App | null> {
  const id = input.match(/id(\d{6,})/)?.[1];
  const url = id
    ? `https://itunes.apple.com/lookup?id=${id}&country=us`
    : `https://itunes.apple.com/search?term=${encodeURIComponent(input.slice(0, 100))}&entity=software&country=us&limit=1`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    const a = ((await r.json()) as { results?: Record<string, unknown>[] }).results?.[0];
    if (!a || !a.trackId) return null;
    return {
      id: String(a.trackId),
      name: String(a.trackName ?? ""),
      icon: String(a.artworkUrl512 ?? a.artworkUrl100 ?? ""),
      genre: String(a.primaryGenreName ?? ""),
      rating: Number(a.averageUserRating ?? 0),
      ratings: Number(a.userRatingCount ?? 0),
      url: String(a.trackViewUrl ?? "").split("?")[0],
      seller: String(a.sellerName ?? ""),
      website: String(a.sellerUrl ?? ""),
      description: String(a.description ?? "").slice(0, 2000),
    };
  } catch {
    return null;
  }
}

/** Today's count of teardowns started (the same file cse/teardown.daily uses). */
async function dayCount(): Promise<number> {
  const raw = await readText(`teardowns/day/${today()}.json`);
  return raw ? Number(JSON.parse(raw).count || 0) : 0;
}

/** Start building if today has room, else put it on tomorrow's list. */
export async function admit(r: Report): Promise<Report> {
  const n = await dayCount();
  if (n >= DAILY_CAP) return { ...r, status: "waitlist" };
  await writeText(`teardowns/day/${today()}.json`, JSON.stringify({ count: n + 1 }));
  await createJob({ type: "teardown", brand: `td-${r.app.id}`, token: r.token });
  return { ...r, status: "queued" };
}

export const newToken = () => randomBytes(16).toString("hex");

/** Email through Resend. Off (returns false) until RESEND_API_KEY and ORE_MAIL_FROM are set. */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const k = process.env.RESEND_API_KEY;
  const from = process.env.ORE_MAIL_FROM;
  if (!k || !from) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return r.ok;
}
export const mailOn = () => Boolean(process.env.RESEND_API_KEY && process.env.ORE_MAIL_FROM);
