import { createHash, randomBytes, randomInt } from "node:crypto";
import { checkSlug, listDocs, readDoc, type Kind } from "./brands";
import { readText, writeText } from "./storage";

/**
 * Creator portal: each creator gets a private link plus a password the brand gives them. Inside they
 * see every script written for them (files with "-for-<creator id>") and mark each one
 * To film -> Filmed -> Edited -> Done, with a link to the video.
 *
 * brands/<brand>/portals.json   {<creator id>: {token, password, created_at}}  (the brand can see the password)
 * portals/<token>.json          {brand, creator, pw: sha256}                   (what the link resolves to)
 * brands/<brand>/creator-status.json  {<creator id>: {<script key>: {status, video, note, updated_at}}}
 */

export const STATUSES = [
  { key: "todo", label: "To film" },
  { key: "filmed", label: "Filmed" },
  { key: "edited", label: "Edited" },
  { key: "done", label: "Done" },
] as const;
export type Status = (typeof STATUSES)[number]["key"];
export const isStatus = (s: string): s is Status => STATUSES.some((x) => x.key === s);

export type PortalInfo = { token: string; password: string; created_at: string };
export type ScriptStatus = { status: Status; video?: string; note?: string; updated_at?: string };
export type Script = { key: string; kind: Kind; file: string; n: number; title: string; body: string; intro: string };

const TOKEN = /^[A-Za-z0-9_-]{10,40}$/;
const WORDS = ["sunny", "river", "maple", "coral", "cedar", "olive", "amber", "frost", "lucky", "pixel", "mango", "orbit", "tulip", "velvet", "zesty", "breeze", "cobalt", "honey", "lemon", "meadow"];

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const pwHash = (token: string, pw: string) => sha(`ore:portal:${token}:${pw}`);
const portalsKey = (brand: string) => `brands/${checkSlug(brand)}/portals.json`;
const statusKey = (brand: string) => `brands/${checkSlug(brand)}/creator-status.json`;

function newPassword(): string {
  const w = () => WORDS[randomInt(WORDS.length)];
  return `${w()}-${w()}-${randomInt(10, 100)}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await readText(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function portalsFor(brand: string): Promise<Record<string, PortalInfo>> {
  return readJson(portalsKey(brand), {});
}

/** The creator's portal link + password, made on first use. `reset` gives a new password (logs them out). */
export async function ensurePortal(brand: string, creator: string, reset = false): Promise<PortalInfo> {
  const all = await portalsFor(brand);
  let p = all[creator];
  if (p && !reset) return p;
  const token = p?.token ?? randomBytes(12).toString("base64url");
  p = { token, password: newPassword(), created_at: p?.created_at ?? new Date().toISOString() };
  await writeText(`portals/${token}.json`, JSON.stringify({ brand, creator, pw: pwHash(token, p.password) }));
  await writeText(portalsKey(brand), JSON.stringify({ ...all, [creator]: p }, null, 2));
  return p;
}

/** What a portal link points at, or null. */
export async function portalByToken(token: string): Promise<{ brand: string; creator: string; pw: string } | null> {
  if (!TOKEN.test(token)) return null;
  const p = await readJson<{ brand?: string; creator?: string; pw?: string } | null>(`portals/${token}.json`, null);
  if (!p?.brand || !p.creator || !p.pw) return null;
  try {
    return { brand: checkSlug(p.brand), creator: p.creator, pw: p.pw };
  } catch {
    return null;
  }
}

export const portalCookie = (token: string) => `ore_cp_${token}`;
/** The cookie value that proves the password; changes when the password is reset. */
export const portalPass = (token: string, pw: string) => sha(`ore:portal-session:${token}:${pw}:${process.env.SITE_PASSWORD ?? ""}`);
export const checkPassword = (token: string, pw: string, typed: string) => pwHash(token, typed.trim()) === pw;

/** Strategist-only lines that creators don't need to see. */
const NOTE = /^\s*[-*]\s+\*\*(Built on|Why it should work for us|Why it works|Write it like this|Source ads?|Taken from)\b/i;
const HEAD = /^#{2,4}\s*(?:Iteration|Brief|Script|Idea)?\s*(\d{1,2})\s*[:.\-)]\s*(.+)$/gm;

/** One file can hold several scripts ("### Iteration 2: Fridge", "## 1. The Hair"); split them. */
export function splitScripts(md: string): { n: number; title: string; body: string; intro: string }[] {
  const heads = [...md.matchAll(HEAD)];
  const clean = (s: string) => s.split("\n").filter((l) => !NOTE.test(l)).join("\n").trim();
  if (!heads.length) {
    const h1 = md.match(/^#\s+(.+)$/m);
    return [{ n: 1, title: h1?.[1].replace(/[*_`]/g, "") ?? "Your script", body: clean(h1 ? md.slice(h1.index! + h1[0].length) : md), intro: "" }];
  }
  // What comes before the first script (minus the doc title): notes for every script in the file, e.g. "Before you film".
  // Only the "Before you film" part: notes about the creator above it are for the brand.
  const pre = md.slice(0, heads[0].index!);
  const at = pre.search(/\*\*Before you film[^*]*\*\*/i);
  const intro = at < 0 ? "" : clean(pre.slice(at).replace(/^\*\*Before you film[^*]*\*\*:?\s*/i, "").replace(/^\s*-{3,}\s*$/gm, ""));
  return heads.map((h, i) => ({
    intro,
    n: Number(h[1]),
    title: h[2].replace(/[*_`]/g, "").trim(),
    body: clean(md.slice(h.index! + h[0].length, heads[i + 1]?.index ?? md.length)),
  }));
}

/** Every script written for this creator, newest file first. */
export async function scriptsFor(brand: string, creator: string): Promise<Script[]> {
  const re = new RegExp(`-for-${creator.replace(/[^a-z0-9-]/g, "")}(?:-|$)`);
  const files = (await Promise.all((["briefs", "iterations"] as Kind[]).map(async (kind) => (await listDocs(brand, kind)).filter((f) => re.test(f)).map((file) => ({ kind, file }))))).flat();
  const docs = await Promise.all(files.map(async (d) => ({ ...d, md: (await readDoc(brand, d.kind, d.file)) ?? "" })));
  const out: Script[] = docs.flatMap((d) => splitScripts(d.md).map((s) => ({ ...s, kind: d.kind, file: d.file, key: `${d.kind}~${d.file}~${s.n}` })));
  return out;
}

export async function statusesFor(brand: string): Promise<Record<string, Record<string, ScriptStatus>>> {
  return readJson(statusKey(brand), {});
}

export async function setScriptStatus(brand: string, creator: string, key: string, patch: Partial<ScriptStatus>) {
  const all = await statusesFor(brand);
  const mine = (all[creator] ??= {});
  const prev = mine[key] ?? { status: "todo" as Status };
  mine[key] = { ...prev, ...patch, updated_at: new Date().toISOString() };
  await writeText(statusKey(brand), JSON.stringify(all, null, 2));
}

export function portalUrl(host: string, proto: string, token: string): string {
  return `${proto}://${host}/c/p/${token}`;
}
