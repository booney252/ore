import { checkSlug, listBrands } from "./brands";
import { listKeys, readText, writeText } from "./storage";

/**
 * Copy feedback and what Ore learned from it (cse/lessons.py reads and writes the same files):
 * brands/<brand>/feedback/<id>.json, brands/<brand>/copy-lessons.md (the rules Ore follows for this
 * brand) and workspace/copy-lessons.md (Ore's playbook, every brand). Rules Ore thinks belong in the
 * playbook wait in brands/<brand>/craft-suggestions.json until the owner reviews them.
 */

export type Feedback = {
  id: string;
  added: string;
  who: string;
  about: string;
  doc: string;
  text: string;
  learned: string | null;
  reply?: string;
};

/** One rule: a bullet in a lessons file, split from its "[source]" tag. */
export type Rule = { index: number; raw: string; text: string; source: string };

/** A markdown bullet list -> one string per bullet (continuation lines kept), like cse/lessons.py bullets. */
export function bullets(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    if (/^\s*[-*]\s+/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, "").trim());
    else if (line.trim() && out.length) out[out.length - 1] += " " + line.trim();
  }
  return out.filter((b) => b && b !== "...");
}

export function rules(md: string): Rule[] {
  return bullets(md).map((raw, index) => {
    const m = raw.match(/^(.*?)\s*\[([^\]]+)\]\s*$/s);
    return { index, raw, text: (m ? m[1] : raw).trim(), source: m ? m[2].trim() : "" };
  });
}

export const CRAFT_KEY = "workspace/copy-lessons.md";
const brandKey = (slug: string) => `brands/${checkSlug(slug)}/copy-lessons.md`;

export async function readLessons(slug: string): Promise<{ brand: string; craft: string }> {
  const [brand, craft] = await Promise.all([readText(brandKey(slug)), readText(CRAFT_KEY)]);
  return { brand: (brand ?? "").trim(), craft: (craft ?? "").trim() };
}

/**
 * Change one rule (one bullet) in the brand's rules or the shared playbook: replace it with `next`,
 * or remove it when `next` is null. `expected` must still match, so a stale page can't clobber a
 * rule that changed underneath it. Returns false when it didn't.
 */
export async function changeRule(
  slug: string,
  which: "brand" | "craft",
  index: number,
  expected: string,
  next: string | null,
): Promise<boolean> {
  const key = which === "brand" ? brandKey(slug) : CRAFT_KEY;
  const list = bullets((await readText(key)) ?? "");
  if (index === list.length && expected === "" && next) list.push(next); // a new rule
  else if (list[index] !== expected) return false;
  else if (next === null) list.splice(index, 1);
  else list[index] = next;
  const clean = list.map((b) => b.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  await writeText(key, clean.map((b) => `- ${b}`).join("\n") + (clean.length ? "\n" : ""), "text/markdown");
  return true;
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

export type CraftSuggestion = { id: string; text: string; feedback: string; status: "pending" | "approved" | "dismissed" };

export async function craftSuggestions(slug: string): Promise<CraftSuggestion[]> {
  const raw = await readText(`brands/${checkSlug(slug)}/craft-suggestions.json`);
  return raw ? (JSON.parse(raw).suggestions as CraftSuggestion[]) : [];
}

/** Reword a suggested craft lesson before deciding on it. */
export async function editSuggestion(slug: string, id: string, text: string): Promise<void> {
  const key = `brands/${checkSlug(slug)}/craft-suggestions.json`;
  const items = await craftSuggestions(slug);
  const s = items.find((x) => x.id === id && x.status === "pending");
  if (!s) return;
  s.text = text.replace(/\s*\n\s*/g, " ").trim();
  await writeText(key, JSON.stringify({ suggestions: items }, null, 2) + "\n");
}

/** Approved suggestions join the shared craft lessons (same as cse/lessons.py decide_craft). */
export async function decideCraft(slug: string, approve: string[], dismiss: string[]): Promise<number> {
  const key = `brands/${checkSlug(slug)}/craft-suggestions.json`;
  const items = await craftSuggestions(slug);
  const added = items.filter((s) => s.status === "pending" && approve.includes(s.id)).map((s) => s.text);
  for (const s of items) {
    if (s.status !== "pending") continue;
    if (approve.includes(s.id)) s.status = "approved";
    else if (dismiss.includes(s.id)) s.status = "dismissed";
  }
  await writeText(key, JSON.stringify({ suggestions: items }, null, 2) + "\n");
  if (added.length) {
    const craft = ((await readText(CRAFT_KEY)) ?? "").trim();
    await writeText(CRAFT_KEY, [craft, ...added.map((t) => `- ${t}`)].filter(Boolean).join("\n") + "\n", "text/markdown");
  }
  return added.length;
}

/** Every brand's suggestions still waiting for the owner, newest brand activity first. */
export async function playbookInbox(): Promise<(CraftSuggestion & { brand: string; brandName: string })[]> {
  const brands = await listBrands();
  const all = await Promise.all(
    brands.map(async (b) =>
      (await craftSuggestions(b.slug))
        .filter((s) => s.status === "pending")
        .map((s) => ({ ...s, brand: b.slug, brandName: b.name })),
    ),
  );
  return all.flat();
}
