import { createHash } from "node:crypto";
import { checkSlug, listDocs, parseIterations, readDoc } from "./brands";
import { readText, writeText } from "./storage";

/* Creator results from a Meta Ads Manager export.
 * Every brief has a short code (ORE-JEN-7F3A-1). The brand puts it in the ad's name when they
 * launch it; an Ads Manager CSV export then tells Ore how each creator's ad did. */

export type AdResult = {
  ad_name: string;
  code: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
  hook: number | null; // 3-second video plays / impressions
  thruplay: number | null;
  // retention: share of 3-second viewers still watching at 25/50/75/95/100% of the video
  ret?: number[] | null;
  avg_watch?: number | null; // seconds
};
export type Results = { uploaded_at: string; period: string; rows: AdResult[] };

const CODE_RE = /ORE-[A-Z0-9]{2,4}-[A-Z0-9]{4}(?:-\d{1,2})?/i;
const key = (slug: string) => `brands/${checkSlug(slug)}/results.json`;

/** "2026-10-25-idea-bc957b-for-jenny", iteration 1 -> "ORE-JEN-7F3A-1" */
export function briefCode(file: string, n?: number): string {
  const who = (file.match(/-for-([a-z0-9]+)/)?.[1] ?? "all").slice(0, 3).toUpperCase();
  const h = parseInt(createHash("sha1").update(file).digest("hex").slice(0, 8), 16).toString(36).toUpperCase().padStart(4, "0").slice(-4);
  return `ORE-${who}-${h}${n ? `-${n}` : ""}`;
}

/** The codes of every script in a doc: one per iteration (or one for the doc). */
export function docCodes(file: string, md: string): { code: string; title: string; n?: number }[] {
  const its = parseIterations(md);
  if (!its.length) return [{ code: briefCode(file), title: md.match(/^#\s+(.+)$/m)?.[1] ?? file }];
  return its.map((it) => ({ code: briefCode(file, it.n), title: it.title, n: it.n }));
}

/** Every code in the brand -> the doc and script it belongs to. */
export async function codeIndex(slug: string): Promise<Record<string, { kind: "iterations" | "briefs"; file: string; title: string }>> {
  const out: Record<string, { kind: "iterations" | "briefs"; file: string; title: string }> = {};
  for (const kind of ["iterations", "briefs"] as const) {
    const files = (await listDocs(slug, kind)).slice(0, 200);
    const mds = await Promise.all(files.map((f) => readDoc(slug, kind, f)));
    files.forEach((f, i) => {
      for (const c of docCodes(f, mds[i] ?? "")) out[c.code] = { kind, file: f, title: c.title };
      out[briefCode(f)] = out[briefCode(f)] ?? { kind, file: f, title: f };
    });
  }
  return out;
}

/** A small CSV parser: quoted fields, commas and newlines inside quotes, "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const num = (v: string | undefined) => {
  const n = parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Ads Manager column names vary by account and report: find each by what it contains. */
function col(header: string[], ...tests: ((h: string) => boolean)[]): number {
  const hs = header.map((h) => h.toLowerCase().trim());
  for (const t of tests) {
    const i = hs.findIndex(t);
    if (i >= 0) return i;
  }
  return -1;
}

export function parseExport(text: string): { rows: AdResult[]; unmatched: number; period: string; error?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], unmatched: 0, period: "", error: "That file is empty." };
  const h = table[0];
  const c = {
    name: col(h, (x) => x === "ad name", (x) => x.includes("ad name")),
    spend: col(h, (x) => x.startsWith("amount spent")),
    imp: col(h, (x) => x === "impressions"),
    clicks: col(h, (x) => x.startsWith("link clicks"), (x) => x.startsWith("clicks (all)")),
    buys: col(h, (x) => x === "purchases", (x) => x.startsWith("purchases"), (x) => x === "results"),
    value: col(h, (x) => x.startsWith("purchases conversion value"), (x) => x.includes("conversion value")),
    roas: col(h, (x) => x.includes("purchase roas"), (x) => x.includes("roas")),
    plays3: col(h, (x) => x.startsWith("3-second video plays"), (x) => x.includes("3-second")),
    thru: col(h, (x) => x.startsWith("thruplays")),
    p25: col(h, (x) => x.startsWith("video plays at 25%")),
    p50: col(h, (x) => x.startsWith("video plays at 50%")),
    p75: col(h, (x) => x.startsWith("video plays at 75%")),
    p95: col(h, (x) => x.startsWith("video plays at 95%")),
    p100: col(h, (x) => x.startsWith("video plays at 100%")),
    avg: col(h, (x) => x.startsWith("video average play time")),
    start: col(h, (x) => x.startsWith("reporting starts")),
    end: col(h, (x) => x.startsWith("reporting ends")),
  };
  if (c.name < 0) return { rows: [], unmatched: 0, period: "", error: "No \"Ad name\" column. Export at the ad level in Ads Manager." };
  const rows: AdResult[] = [];
  let unmatched = 0;
  for (const r of table.slice(1)) {
    const name = (r[c.name] ?? "").trim();
    const code = name.match(CODE_RE)?.[0]?.toUpperCase();
    if (!code) { if (name) unmatched++; continue; }
    const spend = num(r[c.spend]), imp = num(r[c.imp]), clicks = num(r[c.clicks]), buys = num(r[c.buys]);
    const revenue = c.value >= 0 ? num(r[c.value]) : 0;
    const roas = c.roas >= 0 && r[c.roas] ? num(r[c.roas]) : revenue && spend ? revenue / spend : null;
    rows.push({
      ad_name: name, code, spend, impressions: imp, clicks, purchases: buys, revenue,
      roas: roas || roas === 0 ? roas : null,
      cpa: buys ? spend / buys : null,
      ctr: imp ? clicks / imp : null,
      hook: c.plays3 >= 0 && imp ? num(r[c.plays3]) / imp : null,
      thruplay: c.thru >= 0 && imp ? num(r[c.thru]) / imp : null,
      ret: (() => {
        const base = c.plays3 >= 0 ? num(r[c.plays3]) : 0;
        if (!base || c.p25 < 0) return null;
        return [c.p25, c.p50, c.p75, c.p95, c.p100].map((i) => (i >= 0 ? Math.min(1, num(r[i]) / base) : NaN)).filter((v) => !Number.isNaN(v));
      })(),
      avg_watch: c.avg >= 0 && r[c.avg] ? num(r[c.avg]) : null,
    });
  }
  const s = table[1]?.[c.start] ?? "", e = table[1]?.[c.end] ?? "";
  return { rows, unmatched, period: s && e ? `${s} to ${e}` : "" };
}

export async function readResults(slug: string): Promise<Results | null> {
  const raw = await readText(key(slug));
  return raw ? (JSON.parse(raw) as Results) : null;
}

/** Save an upload. A newer export replaces the same ad's numbers; other ads are kept. */
export async function saveResults(slug: string, rows: AdResult[], period: string): Promise<void> {
  const prev = await readResults(slug);
  const byName = new Map((prev?.rows ?? []).map((r) => [r.ad_name, r]));
  for (const r of rows) byName.set(r.ad_name, r);
  await writeText(key(slug), JSON.stringify({ uploaded_at: new Date().toISOString(), period, rows: [...byName.values()] }, null, 2) + "\n");
}

/** Totals for a group of ads, with blended ROAS / CPA / hook rate. */
export function sum(rows: AdResult[]) {
  const t = rows.reduce((a, r) => ({ spend: a.spend + r.spend, imp: a.imp + r.impressions, clicks: a.clicks + r.clicks, buys: a.buys + r.purchases, rev: a.rev + r.revenue, hookPlays: a.hookPlays + (r.hook ?? 0) * r.impressions, hookImp: a.hookImp + (r.hook != null ? r.impressions : 0) }), { spend: 0, imp: 0, clicks: 0, buys: 0, rev: 0, hookPlays: 0, hookImp: 0 });
  const roasRows = rows.filter((r) => r.roas != null);
  const roasSpend = roasRows.reduce((a, r) => a + r.spend, 0);
  return {
    ads: rows.length,
    spend: t.spend,
    roas: t.rev && t.spend ? t.rev / t.spend : roasSpend ? roasRows.reduce((a, r) => a + (r.roas ?? 0) * r.spend, 0) / roasSpend : null,
    cpa: t.buys ? t.spend / t.buys : null,
    ctr: t.imp ? t.clicks / t.imp : null,
    hook: t.hookImp ? t.hookPlays / t.hookImp : null,
  };
}

export const money = (n: number | null) => (n == null ? "–" : `$${n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2)}`);
export const pct = (n: number | null) => (n == null ? "–" : `${(n * 100).toFixed(1)}%`);
export const x = (n: number | null) => (n == null ? "–" : `${n.toFixed(2)}x`);


/** The spoken opening line of script n in a doc: the first row of its script table. */
export function openingLine(md: string, n?: number): string {
  let part = md;
  if (n) {
    const heads = [...md.matchAll(/^#{2,4}\s*Iteration\s+(\d+)\b.*$/gm)];
    const i = heads.findIndex((h) => Number(h[1]) === n);
    if (i >= 0) part = md.slice(heads[i].index!, heads[i + 1]?.index ?? md.length);
  }
  for (const line of part.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length >= 4 && /^\d|^0/.test(cells[1]) && !/^-+$/.test(cells[1])) return cells[2].replace(/^"|"$/g, "");
  }
  return "";
}

/** A plain-words summary of what's working, saved for every future brief prompt to read. */
export async function writePerformanceNotes(slug: string, notes: string): Promise<void> {
  await writeText(`brands/${checkSlug(slug)}/performance.md`, notes, "text/markdown");
}

/** Where a script lives on the site: its master script's page for a creator version, else the old brief page. */
export function scriptHref(brand: string, kind: string, file: string): string {
  const mid = file.match(/-m-([a-z0-9-]+)-for-/)?.[1];
  return mid ? `/app/${brand}/scripts/${mid}` : `/app/${brand}/briefs/${kind}/${file}`;
}
