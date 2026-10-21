"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  brandExists,
  checkFile,
  checkSlug,
  createBrand,
  deleteDoc,
  savePaste,
  saveChosenMechanisms,
  setBrandFields,
  slugify,
  splitIngredients,
} from "@/lib/brands";
import { addCompetitor, removeCompetitor, RINGS, type Ring } from "@/lib/competitors";
import { creatorExists, CREATOR_FIELDS, removeCreator, saveCreator } from "@/lib/creators";
import { addBrainItem, fileText, MAX_FILE_BYTES, removeBrainItem } from "@/lib/brain";
import { cancelJob, createJob } from "@/lib/jobs";
import { addFeedback, changeRule, decideCraft, editSuggestion } from "@/lib/lessons";
import { createSession, readSession, saveMe, studioBrand, updateSession } from "@/lib/studio";
import { requireBrand, requireOwner } from "@/lib/session";

function formatOf(form: FormData): string {
  const f = String(form.get("format") ?? "ugc");
  return ["ugc", "broll", "static", "talking"].includes(f) ? f : "ugc";
}

export async function newReport(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  await createJob({ type: "report", brand });
  redirect(`/b/${brand}/reports?queued=1`);
}

/** The creator picked on an iterations or briefs form, if any (and only if it exists). */
async function creatorOf(brand: string, form: FormData): Promise<{ creator?: string }> {
  const id = String(form.get("creator") ?? "");
  return id && (await creatorExists(brand, id)) ? { creator: id } : {};
}

function numbers(form: FormData, field: string): number[] {
  return form
    .getAll(field)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n < 100);
}

export async function newIterations(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const report = checkFile(String(form.get("report")));
  const ads = numbers(form, "ad");
  const idea = String(form.get("idea") ?? "").trim().slice(0, 2000);
  if (ads.length === 0 && !idea) redirect(`/b/${brand}/iterations?report=${report}&pick=1`);
  const perAd = Math.min(3, Math.max(1, Number(form.get("per_ad")) || 1));
  await createJob({
    type: "iterations",
    brand,
    report,
    ads,
    format: formatOf(form),
    per_ad: perAd,
    ...(idea && { idea }),
    ...(await creatorOf(brand, form)),
  });
  redirect(`/b/${brand}/iterations?queued=1`);
}

export async function newBriefs(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  // "file:3" from the Creative briefs picker, or a file + numbers from an iterations page.
  const picks = form
    .getAll("pick")
    .map((v) => String(v).match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}[a-z0-9-]*):(\d{1,2})$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ iterations: checkFile(m[1]), number: Number(m[2]) }));
  const single = form.get("iterations");
  if (single) {
    const file = checkFile(String(single));
    for (const n of numbers(form, "number")) picks.push({ iterations: file, number: n });
  }
  if (picks.length === 0) {
    redirect(single ? `/b/${brand}/iterations/${String(single)}?pick=1` : `/b/${brand}/briefs?pick=1`);
  }
  await createJob({ type: "briefs", brand, picks, ...(await creatorOf(brand, form)) });
  redirect(`/b/${brand}/briefs?queued=1`);
}

export async function newBrand(form: FormData) {
  await requireOwner();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const about = String(form.get("about") ?? "").trim().slice(0, 600);
  let website = String(form.get("website") ?? "").trim().slice(0, 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const competitors = String(form.get("competitors") ?? "")
    .split(/[,\n]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 30);
  const slug = slugify(name);
  if (!slug || !about) redirect("/?missing=1");
  if (await brandExists(slug)) redirect(`/?taken=${slug}`);
  const ingredients = splitIngredients(String(form.get("ingredients") ?? "").slice(0, 3000));
  const mechanism = String(form.get("mechanism") ?? "").trim().slice(0, 1500);
  await createBrand({ slug, name, about, website, competitors, ingredients, mechanism });
  await createJob({ type: "setup", brand: slug });
  redirect(`/b/${slug}?queued=setup`);
}

export async function refreshResearch(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  await createJob({ type: "research", brand });
  redirect(`/b/${brand}/research?queued=1`);
}

export async function pasteQuotes(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const text = String(form.get("text") ?? "").slice(0, 200_000);
  const source = String(form.get("source") ?? "").trim().slice(0, 500);
  if (!text.trim()) redirect(`/b/${brand}/research`);
  await savePaste(brand, /^https?:\/\//i.test(source) ? source : "", text);
  redirect(`/b/${brand}/research?step=quotes&pasted=1`);
}

export async function cancelRequest(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const { brandRemoved } = await cancelJob(brand, String(form.get("id")));
  const back = String(form.get("back") ?? "");
  if (brandRemoved) redirect("/?cancelled=1");
  redirect(`${back.startsWith(`/b/${brand}`) ? back.split("?")[0] : `/b/${brand}`}?cancelled=1`);
}

export async function addCompetitorAction(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const ring = String(form.get("ring")) as Ring;
  if (!name || !RINGS.includes(ring)) redirect(`/b/${brand}?competitor=missing#competitors`);
  let website = String(form.get("website") ?? "").trim().slice(0, 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const adLibrary = String(form.get("ad_library") ?? "").trim().slice(0, 500);
  const result = await addCompetitor(brand, {
    name,
    ring,
    website,
    adLibrary: /^https?:\/\//i.test(adLibrary) ? adLibrary : "",
    instagram: String(form.get("instagram") ?? "").trim().slice(0, 60),
    why: String(form.get("why") ?? "").trim().slice(0, 300),
  });
  redirect(`/b/${brand}?competitor=${result}&name=${encodeURIComponent(name)}#competitors`);
}

export async function removeCompetitorAction(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const name = String(form.get("name") ?? "");
  await removeCompetitor(brand, name);
  redirect(`/b/${brand}?competitor=removed&name=${encodeURIComponent(name)}#competitors`);
}

export async function deleteDocAction(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const kind = String(form.get("kind"));
  if (kind !== "iterations" && kind !== "briefs") redirect(`/b/${brand}`);
  await deleteDoc(brand, kind, checkFile(String(form.get("file"))));
  revalidatePath(`/b/${brand}`, "layout");
  redirect(`/b/${brand}/${kind}?deleted=1`);
}

export async function saveIngredients(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const ingredients = splitIngredients(String(form.get("ingredients") ?? "").slice(0, 3000));
  await setBrandFields(brand, { ingredients });
  if (ingredients.length) await createJob({ type: "ingredients", brand });
  revalidatePath(`/b/${brand}`, "layout");
  redirect(`/b/${brand}/research?step=ingredients${ingredients.length ? "&queued=ingredients" : "&saved=1"}`);
}

export async function findMechanisms(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  await createJob({ type: "mechanisms", brand });
  redirect(`/b/${brand}/research?step=mechanisms&queued=mechanisms`);
}

export async function chooseMechanisms(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const picked = await saveChosenMechanisms(brand, numbers(form, "pick"));
  if (picked > 1) await createJob({ type: "rank_mechanisms", brand });
  revalidatePath(`/b/${brand}`, "layout");
  redirect(`/b/${brand}/research?step=mechanisms&chosen=1${picked > 1 ? "&queued=rank" : ""}`);
}

export async function saveCreatorAction(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect(`/b/${brand}/creators?missing=1`);
  const data = Object.fromEntries(CREATOR_FIELDS.map((f) => [f.key, String(form.get(f.key) ?? "")]));
  const id = await saveCreator(brand, { name, ...data }, String(form.get("id") ?? "") || undefined);
  revalidatePath(`/b/${brand}`, "layout");
  redirect(`/b/${brand}/creators?saved=${id}#${id}`);
}

export async function removeCreatorAction(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await requireBrand(brand);
  await removeCreator(brand, String(form.get("id") ?? ""));
  revalidatePath(`/b/${brand}`, "layout");
  redirect(`/b/${brand}/creators?removed=1`);
}

// --- Creator Studio ---

export async function saveMeAction(form: FormData) {
  await requireOwner();
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect("/studio/me?missing=1");
  const data = Object.fromEntries(CREATOR_FIELDS.map((f) => [f.key, String(form.get(f.key) ?? "")]));
  await saveMe({ name, ...data });
  revalidatePath("/studio", "layout");
  redirect("/studio?saved=1");
}

export async function startSession(form: FormData) {
  await requireOwner();
  const brand = checkSlug(String(form.get("brand") ?? ""));
  const b = await studioBrand(brand);
  if (!b) redirect("/studio");
  const ad = String(form.get("ad") ?? "");
  const adId = b.winners.some((w) => w.ad_id === ad) ? ad : null;
  const id = await createSession(brand, adId);
  await createJob({ type: "angles", brand, session: id });
  redirect(`/studio/s/${id}`);
}

export async function pickAngles(form: FormData) {
  await requireOwner();
  const id = String(form.get("session") ?? "");
  const found = await readSession(id);
  if (!found) redirect("/studio");
  const valid = (found.session.angles ?? []).map((a) => a.n);
  const picked = numbers(form, "angle").filter((n) => valid.includes(n));
  if (!picked.length) redirect(`/studio/s/${id}?pick=1`);
  const length = ["15s", "30s", "45s", "60s"].includes(String(form.get("length"))) ? String(form.get("length")) : "30s";
  await updateSession(id, {
    picked,
    format: formatOf(form),
    length,
    per_angle: Math.min(3, Math.max(1, Number(form.get("per_angle")) || 1)),
    notes: String(form.get("notes") ?? "").trim().slice(0, 500),
    status: "writing",
  });
  await createJob({ type: "scripts", brand: found.session.brand, session: id });
  redirect(`/studio/s/${id}`);
}

export async function tweakScript(form: FormData) {
  await requireOwner();
  const id = String(form.get("session") ?? "");
  const found = await readSession(id);
  const script = String(form.get("script") ?? "");
  const action = String(form.get("action") ?? "");
  if (!found || !/^\d+(\.\d+)?$/.test(script) || !["more", "hooks", "shorter"].includes(action)) {
    redirect(id ? `/studio/s/${id}` : "/studio");
  }
  await createJob({ type: "tweak", brand: found!.session.brand, session: id, script, action });
  redirect(`/studio/s/${id}?tweaking=1#script-${script}`);
}


/** Research page: add a note or a document to the brand brain. */
export async function addToBrain(form: FormData) {
  const brand = String(form.get("brand") ?? "");
  await requireBrand(brand);
  const note = String(form.get("note") ?? "").trim();
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const file = form.get("file");
  let result = "added";
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) redirect(`/b/${brand}/research?step=notes&brainerror=size`);
    let text = "";
    try {
      text = (await fileText(file)).replace(/\n{3,}/g, "\n\n").trim();
    } catch {
      redirect(`/b/${brand}/research?step=notes&brainerror=type`);
    }
    if (!text) redirect(`/b/${brand}/research?step=notes&brainerror=empty`);
    await addBrainItem(brand, {
      title: title || file.name.replace(/\.[^.]+$/, ""),
      kind: "doc",
      filename: file.name,
      text: note ? `${note}\n\n${text}` : text,
    });
  } else if (note) {
    await addBrainItem(brand, { title: title || note.split(/\s+/).slice(0, 6).join(" "), kind: "note", text: note });
  } else {
    result = "nothing";
  }
  revalidatePath(`/b/${brand}/research`);
  redirect(`/b/${brand}/research?step=notes&brain=${result}`);
}

export async function removeFromBrain(form: FormData) {
  const brand = String(form.get("brand") ?? "");
  await requireBrand(brand);
  await removeBrainItem(brand, String(form.get("id") ?? ""));
  revalidatePath(`/b/${brand}/research`);
  redirect(`/b/${brand}/research?step=notes&brain=removed`);
}


/** Feedback on Ore's copy (from a doc page or the Research page's "What Ore learned" tab): saved, then Ore learns from it. */
export async function giveFeedback(form: FormData) {
  const brand = String(form.get("brand") ?? "");
  await requireBrand(brand);
  const text = String(form.get("text") ?? "").trim().slice(0, 20000);
  const learned = `/b/${brand}/research?step=learned`;
  const back = String(form.get("back") ?? learned);
  const safeBack = back.startsWith(`/b/${brand}/`) ? back : learned;
  const join = safeBack.includes("?") ? "&" : "?";
  if (!text) redirect(`${safeBack}${join}feedback=empty`);
  const doc = String(form.get("doc") ?? "");
  const id = await addFeedback(brand, {
    text,
    who: String(form.get("who") ?? "").trim().slice(0, 80),
    about: String(form.get("about") ?? "").trim().slice(0, 200),
    doc: /^(briefs|iterations|reports|studio)\/[A-Za-z0-9._-]+$/.test(doc) ? doc : "",
  });
  await createJob({ type: "lessons", brand, feedback: id });
  revalidatePath(`/b/${brand}/research`);
  redirect(`${safeBack}${join}feedback=sent#feedback`);
}

/** "What Ore learned" tab: edit or remove one of the rules Ore follows for this brand. */
export async function brandRuleAction(form: FormData) {
  const brand = String(form.get("brand") ?? "");
  await requireBrand(brand);
  const back = `/b/${brand}/research?step=learned`;
  const op = String(form.get("op") ?? "");
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const source = String(form.get("source") ?? "");
  const next = op === "delete" ? null : text ? `${text}${source ? ` [${source}]` : ""}` : undefined;
  if (next === undefined) redirect(back);
  const ok = await changeRule(brand, "brand", Number(form.get("index")), String(form.get("raw") ?? ""), next);
  revalidatePath(`/b/${brand}/research`);
  redirect(`${back}&rule=${ok ? op : "stale"}`);
}

/**
 * Playbook page (owner only): Ore's rules for every brand. op = edit | delete | new for a playbook
 * rule; add | reword | skip for a rule a brand's feedback suggested.
 */
export async function playbookAction(form: FormData) {
  await requireOwner();
  const op = String(form.get("op") ?? "");
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const back = "/playbook";
  let done = op;
  if (op === "add" || op === "reword" || op === "skip") {
    const brand = String(form.get("brand") ?? "");
    const id = String(form.get("id") ?? "");
    checkSlug(brand);
    if (!/^[a-f0-9]{8}$/.test(id)) redirect(back);
    if (op === "reword" && text) await editSuggestion(brand, id, text);
    if (op === "skip") await decideCraft(brand, [], [id]);
    else await decideCraft(brand, [id], []);
  } else {
    const source = String(form.get("source") ?? "");
    const next = op === "delete" ? null : text ? `${text}${source ? ` [${source}]` : ""}` : undefined;
    if (next === undefined) redirect(back);
    const index = Number(form.get("index"));
    if (!(await changeRule("", "craft", index, String(form.get("raw") ?? ""), next))) done = "stale";
  }
  revalidatePath(back);
  redirect(`${back}?done=${done}`);
}
