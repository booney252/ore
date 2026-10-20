import { checkSlug } from "./brands";
import { deleteKey, listKeys, readText, writeText } from "./storage";

/**
 * What the brand adds to its brain by hand (cse/brain.py reads the same files): notes typed on
 * the Research page and documents attached there, each brands/<brand>/brain/<id>.json.
 */

export type BrainItem = {
  id: string;
  title: string;
  kind: "note" | "doc";
  filename?: string;
  /** the full original file, when Ore reads a shorter digest of it */
  source_key?: string;
  added: string;
  text: string;
};

const ID_RE = /^\d{14}-[a-z0-9]{4,8}$/;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function brainItems(slug: string): Promise<BrainItem[]> {
  const keys = (await listKeys(`brands/${checkSlug(slug)}/brain/`)).filter((k) => k.endsWith(".json")).sort();
  const items = await Promise.all(keys.map(async (k) => JSON.parse((await readText(k)) ?? "null") as BrainItem | null));
  return items.filter((i): i is BrainItem => Boolean(i)).reverse();
}

export async function addBrainItem(slug: string, item: Omit<BrainItem, "id" | "added">): Promise<BrainItem> {
  const now = new Date();
  const id = `${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
  const full: BrainItem = { ...item, id, added: now.toISOString() };
  await writeText(`brands/${checkSlug(slug)}/brain/${id}.json`, JSON.stringify(full, null, 2));
  return full;
}

export async function removeBrainItem(slug: string, id: string): Promise<void> {
  if (!ID_RE.test(id)) throw new Error("bad id");
  await deleteKey(`brands/${checkSlug(slug)}/brain/${id}.json`);
}

/** Plain text out of an attached file: PDF, Word (.docx), or any text file (md, txt, csv, json). */
export async function fileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text);
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  }
  if (/\.(md|markdown|txt|csv|json|html?)$/.test(name) || file.type.startsWith("text/")) {
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Attach a PDF, a Word doc (.docx), or a text, Markdown or CSV file.");
}
