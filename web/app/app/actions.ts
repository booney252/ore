"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { brandExists, checkSlug, createBrand, listDocs, slugify } from "@/lib/brands";
import { addCompetitor, removeCompetitor, RINGS, type Ring } from "@/lib/competitors";
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
  await createJob({ type: "setup", brand: slug });
  redirect(`/app/${slug}/brand?started=1`);
}

/** "Make this for <creator>": one breakout becomes a creator-fit brief. */
export async function oaMake(form: FormData) {
  const brand = checkSlug(text(form, "brand", 80));
  await requireBrand(brand);
  const hook = text(form, "hook", 400);
  const advertiser = text(form, "advertiser", 120);
  const why = text(form, "why", 800);
  const proof = text(form, "proof", 300);
  const creatorId = text(form, "creator", 60);
  const creator = creatorId && (await creatorExists(brand, creatorId)) ? { creator: creatorId } : {};
  const idea =
    `Rebuild this breakout for our product: ${advertiser ? advertiser + "'s " : ""}ad "${hook}"` +
    (proof ? ` (${proof})` : "") +
    (why ? `. Why it works: ${why}` : "") +
    ". Keep the parts that make it work and make it sound like the creator's own story.";
  const [latest] = await listDocs(brand, "reports");
  await createJob({ type: "iterations", brand, ...(latest && { report: latest }), ads: [], format: "ugc", per_ad: 1, idea, ...creator });
  redirect(`/app/${brand}/briefs?writing=1`);
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
