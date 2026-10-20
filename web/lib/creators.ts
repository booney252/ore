import { checkSlug } from "./brands";
import { readText, writeText } from "./storage";

/** Who's speaking in an ad. Same fields as cse/creators.py. */
export type Creator = {
  id: string;
  name: string;
  handle?: string;
  platforms?: string;
  about?: string;
  story?: string;
  audience?: string;
  can_film?: string;
  voice?: string;
  can_claim?: string;
  avoid?: string;
};

export const CREATOR_FIELDS: { key: keyof Creator; label: string; hint: string; long?: boolean }[] = [
  { key: "handle", label: "Handle", hint: "@maya.makes.ai" },
  { key: "platforms", label: "Platforms", hint: "TikTok, Instagram Reels" },
  { key: "about", label: "Who they are", hint: "24, college student in Austin, ex-barista, camera-shy at first", long: true },
  { key: "story", label: "Their story with this offer", hint: "Why they joined or use it, and what's happened since", long: true },
  { key: "audience", label: "Their audience", hint: "Who follows them and why" },
  { key: "can_film", label: "What they can film", hint: "Their room, car, laptop screen, a coffee shop; no face on camera?" },
  { key: "voice", label: "How they talk", hint: "Fast and funny, says 'okay so'. Paste a caption or two.", long: true },
  { key: "can_claim", label: "What they can honestly claim", hint: "Real results only, e.g. 'one $500 brand deal in month 3'", long: true },
  { key: "avoid", label: "Avoid", hint: "Topics or words they won't say" },
];

const key = (slug: string) => `brands/${checkSlug(slug)}/creators.json`;
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

export async function listCreators(slug: string): Promise<Creator[]> {
  const raw = await readText(key(slug));
  return raw ? (JSON.parse(raw).creators as Creator[]) : [];
}

async function save(slug: string, creators: Creator[]) {
  await writeText(
    key(slug),
    JSON.stringify({ brand: slug, creators, updated_at: new Date().toISOString() }, null, 2) + "\n",
  );
}

function idFor(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "creator";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** Add a creator, or update one when `id` is given. Returns its id. */
export async function saveCreator(slug: string, data: Omit<Creator, "id">, id?: string): Promise<string> {
  const all = await listCreators(slug);
  const clean = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "").trim().slice(0, k === "name" ? 80 : 1500)]),
  ) as Omit<Creator, "id">;
  if (id && ID.test(id) && all.some((c) => c.id === id)) {
    await save(slug, all.map((c) => (c.id === id ? { ...clean, id } : c)));
    return id;
  }
  const newId = idFor(clean.name, all.map((c) => c.id));
  await save(slug, [...all, { ...clean, id: newId }]);
  return newId;
}

export async function removeCreator(slug: string, id: string): Promise<void> {
  await save(slug, (await listCreators(slug)).filter((c) => c.id !== id));
}

export async function creatorExists(slug: string, id: string): Promise<boolean> {
  return ID.test(id) && (await listCreators(slug)).some((c) => c.id === id);
}
