import { checkSlug } from "./brands";
import { deleteKey, listKeys, readText, writeText } from "./storage";

/**
 * Master scripts (cse/masters.py): the brand reviews one script per idea; Ore makes each assigned
 * creator's version from it. Approving a version writes iterations/<date>-m-<id>-for-<creator>.md,
 * which the creator portal and the brief codes read.
 */
export type Version = { md: string; changes: string[]; rev: number; status: "ready" | "approved"; made_at?: string; approved_at?: string; file?: string };
export type Master = {
  id: string;
  title: string;
  idea: string;
  md: string;
  rev: number;
  status: "draft" | "approved";
  changes: string[];
  creators: string[];
  versions: Record<string, Version>;
  feedback?: { text: string; at: string }[];
  created_at: string;
  updated_at?: string;
};

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const keyFor = (brand: string, id: string) => {
  if (!ID.test(id)) throw new Error("bad master id");
  return `brands/${checkSlug(brand)}/masters/${id}.json`;
};

export async function listMasters(brand: string): Promise<Master[]> {
  const prefix = `brands/${checkSlug(brand)}/masters/`;
  const keys = (await listKeys(prefix)).filter((k) => k.endsWith(".json"));
  const all = await Promise.all(keys.map(async (k) => JSON.parse((await readText(k)) ?? "null") as Master | null));
  return all.filter((m): m is Master => Boolean(m)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getMaster(brand: string, id: string): Promise<Master | null> {
  if (!ID.test(id)) return null;
  const raw = await readText(keyFor(brand, id));
  return raw ? (JSON.parse(raw) as Master) : null;
}

export async function saveMaster(brand: string, m: Master): Promise<void> {
  m.updated_at = new Date().toISOString();
  await writeText(keyFor(brand, m.id), JSON.stringify(m, null, 2));
}

export const hookOf = (md: string) => md.match(/\*\*Hook:\*\*\s*"?([^"\n]+)"?/)?.[1]?.trim() ?? "";
export const textHookOf = (md: string) => md.match(/\*\*Text hook:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "";

/** The rows of a script table: [time, they say, on screen]. */
export function rows(md: string): string[][] {
  return md
    .split("\n")
    .filter((l) => /^\|\s*\d/.test(l))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which rows of a version differ from the master (by what's said or shown, not the timing). */
export function changedRows(master: string, version: string): boolean[] {
  const said = new Set(rows(master).map((r) => norm(r[1] ?? "")));
  const shown = new Set(rows(master).map((r) => norm(r[2] ?? "")));
  return rows(version).map((r) => !said.has(norm(r[1] ?? "")) || !shown.has(norm(r[2] ?? "")));
}

/** A version is out of date when the master changed after it was made. */
export const stale = (m: Master, v?: Version) => Boolean(v && v.rev < m.rev);

export function versionFile(m: Master, creator: string): string {
  const day = (m.created_at || new Date().toISOString()).slice(0, 10);
  return `${day}-m-${m.id}-for-${creator}`;
}

/** Approve a version: write it where the creator portal reads it. */
export async function approveVersion(brand: string, m: Master, creator: string, brandName: string): Promise<void> {
  const v = m.versions[creator];
  if (!v) return;
  const file = versionFile(m, creator);
  await writeText(
    `brands/${checkSlug(brand)}/iterations/${file}.md`,
    `# ${brandName}: ${m.title}\n\n### Iteration 1: ${m.title}\n\n${v.md.trim()}\n`,
    "text/markdown",
  );
  m.versions[creator] = { ...v, status: "approved", approved_at: new Date().toISOString(), file };
}

/** Take a creator off a script: their version (and portal copy) goes too. */
export async function unassign(brand: string, m: Master, creator: string): Promise<void> {
  const v = m.versions[creator];
  if (v?.file) await deleteKey(`brands/${checkSlug(brand)}/iterations/${v.file}.md`);
  delete m.versions[creator];
  m.creators = m.creators.filter((c) => c !== creator);
}

export type Progress = { creators: number; review: number; todo: number; filmed: number; edited: number; done: number };

/** Where a script's creators are: versions waiting for the brand, then each sent one's portal status. */
export function progress(m: Master, statuses: Record<string, Record<string, { status: string }>>): Progress {
  const p: Progress = { creators: m.creators.length, review: 0, todo: 0, filmed: 0, edited: 0, done: 0 };
  for (const c of m.creators) {
    const v = m.versions[c];
    if (!v || v.status !== "approved" || !v.file) {
      p.review += 1;
      continue;
    }
    const st = statuses[c]?.[`iterations~${v.file}~1`]?.status ?? "todo";
    if (st === "filmed" || st === "edited" || st === "done") p[st] += 1;
    else p.todo += 1;
  }
  return p;
}
