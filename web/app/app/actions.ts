"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { parseExport, saveResults, writePerformanceNotes } from "@/lib/results";
import { notesFor, performance } from "@/lib/performance";
import { brandExists, checkFile, checkSlug, createBrand, listDocs, slugify } from "@/lib/brands";
import { writeText } from "@/lib/storage";
import { addCompetitor, removeCompetitor, RINGS, type Ring, setCompetitorPage } from "@/lib/competitors";
import { creatorExists, CREATOR_FIELDS, removeCreator, saveCreator } from "@/lib/creators";
import { createJob } from "@/lib/jobs";
import { addFeedback } from "@/lib/lessons";
import { requireBrand, requireOwner } from "@/lib/session";

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

/** Step 1: "What do you sell?" Creates the brand and queues the full research run. */
export async function oaNewBrand(form: FormData) {
  await requireOwner();
  const name = text(form, "name", 80);
  const about = text(form, "about", 600);
  let website = text(form, "website", 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const competitors = String(form.get("competitors") ?? "")
    .split(/[,\n]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 30);
  const slug = slugify(name);
  if (!slug || !about) redirect("/app/new?missing=1");
  if (await brandExists(slug)) redirect(`/app/new?taken=${slug}`);
  await createBrand({ slug, name, about, website, competitors, ingredients: [], mechanism: "" });
  // creators from the last onboarding step: "Name, who they are" per line
  const people = String(form.get("creators") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
  for (const line of people) {
    const [first, ...rest] = line.split(/[,:]/);
    const who = first.trim().slice(0, 80);
    if (who) await saveCreator(slug, { name: who, about: rest.join(",").trim() || line });
  }
  await createJob({ type: "setup", brand: slug });
  redirect(`/app/${slug}/welcome`);
}

/** "Make this for <creator>": one breakout becomes a creator-fit brief. */
export async function oaMake(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const hook = text(form, "hook", 400);
  const advertiser = text(form, "advertiser", 120);
  const why = text(form, "why", 800);
  const proof = text(form, "proof", 300);
  const picked = form.getAll("creator").map((v) => String(v).trim()).filter(Boolean).slice(0, 12);
  const creators: string[] = [];
  for (const id of picked) if (await creatorExists(brand, id)) creators.push(id);
  // a pattern, an open lane or the user's own idea come as one written idea; a single winner as its parts
  const own = text(form, "idea", 2000);
  if (!own && !hook) redirect(`/app/${brand}?empty=1#own`);
  const idea =
    own ||
    `Rebuild this breakout for our product: ${advertiser ? advertiser + "'s " : ""}ad "${hook}"` +
      (proof ? ` (${proof})` : "") +
      (why ? `. Why it works: ${why}` : "") +
      ". Keep the parts that make it work and make it sound like the creator's own story.";
  // the report ads that show a pattern, as extra inspiration
  const ads = text(form, "ranks", 40).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100).slice(0, 5);
  const [latest] = await listDocs(brand, "reports");
  const base = { type: "iterations" as const, brand, ...(latest && { report: latest }), ads: latest ? ads : [], format: "ugc", per_ad: 1, idea };
  // one script per creator, each written for that creator's story and voice
  if (creators.length) for (const creator of creators) await createJob({ ...base, creator });
  else await createJob(base);
  redirect(`/app/${brand}/briefs?writing=${Math.max(creators.length, 1)}`);
}

/** "Send to creator": a private link the creator opens without an account. */
export async function oaShare(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const kind = text(form, "kind", 20);
  const file = checkFile(text(form, "file", 160));
  if (kind !== "iterations" && kind !== "briefs") redirect(`/app/${brand}/briefs`);
  const creator = text(form, "creator", 60);
  const token = randomBytes(12).toString("base64url");
  await writeText(`shares/${token}.json`, JSON.stringify({ brand, kind, file, creator, created_at: new Date().toISOString() }));
  redirect(`/app/${brand}/briefs/${kind}/${file}?shared=${token}#send`);
}

export async function oaSaveCreator(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const name = text(form, "name", 80);
  if (!name) redirect(`/app/${brand}/creators?missing=1`);
  const fields = Object.fromEntries(CREATOR_FIELDS.map((f) => [f.key, text(form, f.key, f.long ? 1500 : 200)]));
  const id = text(form, "id", 60);
  await saveCreator(brand, { name, ...fields } as Parameters<typeof saveCreator>[1], id || undefined);
  revalidatePath(`/app/${brand}/creators`);
  redirect(`/app/${brand}/creators?saved=1`);
}

export async function oaRemoveCreator(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  await removeCreator(brand, text(form, "id", 60));
  revalidatePath(`/app/${brand}/creators`);
  redirect(`/app/${brand}/creators`);
}

/** Feedback on a brief: saved, then the lessons job turns it into rules Ore follows. */
export async function oaFeedback(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const note = form.getAll("text").map((v) => String(v).trim()).filter(Boolean).join(". ").slice(0, 5000);
  const doc = text(form, "doc", 200);
  const back = `/app/${brand}/briefs/${doc}`;
  if (!note) redirect(`${back}?feedback=empty`);
  const id = await addFeedback(brand, {
    text: note,
    who: "",
    about: text(form, "about", 200),
    doc: /^(briefs|iterations)\/[A-Za-z0-9._-]+$/.test(doc) ? doc : "",
  });
  await createJob({ type: "lessons", brand, feedback: id });
  redirect(`${back}?feedback=sent`);
}

export async function oaAddCompetitor(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const name = text(form, "name", 80);
  const ring = (RINGS as string[]).includes(text(form, "ring", 20)) ? (text(form, "ring", 20) as Ring) : "direct";
  if (name) await addCompetitor(brand, { name, ring, website: "", adLibrary: "", instagram: "", why: "" });
  revalidatePath(`/app/${brand}/brand`);
  redirect(`/app/${brand}/brand`);
}

export async function oaRemoveCompetitor(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  await removeCompetitor(brand, text(form, "name", 80));
  revalidatePath(`/app/${brand}/brand`);
  redirect(`/app/${brand}/brand`);
}

/** "That's the wrong page": the brand pastes the competitor's Ad Library link. */
export async function oaSetPage(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const ok = await setCompetitorPage(brand, text(form, "name", 120), text(form, "link", 600));
  revalidatePath(`/app/${brand}/brand`);
  redirect(`/app/${brand}/brand?page=${ok ? "saved" : "bad"}#pages`);
}

/** An Ads Manager CSV export: each ad whose name carries a brief code gets its numbers saved. */
export async function oaUploadResults(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const file = form.get("file");
  const back = `/app/${brand}/performance`;
  if (!(file instanceof File) || !file.size) redirect(`${back}?results=empty`);
  if ((file as File).size > 8 * 1024 * 1024) redirect(`${back}?results=big`);
  const parsed = parseExport(await (file as File).text());
  if (parsed.error) redirect(`${back}?results=bad`);
  if (parsed.rows.length) {
    await saveResults(brand, parsed.rows, parsed.period);
    // what's working, in plain words: every future brief prompt reads it
    const p = await performance(brand);
    if (p) await writePerformanceNotes(brand, notesFor(p));
  }
  revalidatePath(back);
  redirect(`${back}?results=ok&matched=${parsed.rows.length}&other=${parsed.unmatched}`);
}

export async function oaRefreshResearch(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  await createJob({ type: "research", brand });
  redirect(`/app/${brand}/brand?started=1`);
}

export async function oaFindBreakouts(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  await createJob({ type: "report", brand });
  redirect(`/app/${brand}?checking=1`);
}
