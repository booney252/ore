"use server";

import { redirect } from "next/navigation";
import { brandExists, checkFile, checkSlug, createBrand, savePaste, slugify } from "@/lib/brands";
import { addCompetitor, removeCompetitor, RINGS, type Ring } from "@/lib/competitors";
import { cancelJob, createJob } from "@/lib/jobs";

function formatOf(form: FormData): string {
  const f = String(form.get("format") ?? "ugc");
  return ["ugc", "broll", "static"].includes(f) ? f : "ugc";
}

export async function newReport(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await createJob({ type: "report", brand });
  redirect(`/b/${brand}/reports?queued=1`);
}

function numbers(form: FormData, field: string): number[] {
  return form
    .getAll(field)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n < 100);
}

export async function newIterations(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const report = checkFile(String(form.get("report")));
  const ads = numbers(form, "ad");
  if (ads.length === 0) redirect(`/b/${brand}/iterations?report=${report}&pick=1`);
  const perAd = Math.min(3, Math.max(1, Number(form.get("per_ad")) || 1));
  await createJob({ type: "iterations", brand, report, ads, format: formatOf(form), per_ad: perAd });
  redirect(`/b/${brand}/iterations?queued=1`);
}

export async function newBriefs(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const iterations = checkFile(String(form.get("iterations")));
  const picked = numbers(form, "number");
  if (picked.length === 0) redirect(`/b/${brand}/iterations/${iterations}?pick=1`);
  await createJob({ type: "briefs", brand, iterations, numbers: picked });
  redirect(`/b/${brand}/briefs?queued=1`);
}

export async function newBrand(form: FormData) {
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
  await createBrand({ slug, name, about, website, competitors });
  await createJob({ type: "setup", brand: slug });
  redirect(`/b/${slug}?queued=setup`);
}

export async function refreshResearch(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  await createJob({ type: "research", brand });
  redirect(`/b/${brand}/research?queued=1`);
}

export async function pasteQuotes(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const text = String(form.get("text") ?? "").slice(0, 200_000);
  const source = String(form.get("source") ?? "").trim().slice(0, 500);
  if (!text.trim()) redirect(`/b/${brand}/research`);
  await savePaste(brand, /^https?:\/\//i.test(source) ? source : "", text);
  redirect(`/b/${brand}/research?pasted=1`);
}

export async function cancelRequest(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const { brandRemoved } = await cancelJob(brand, String(form.get("id")));
  const back = String(form.get("back") ?? "");
  if (brandRemoved) redirect("/?cancelled=1");
  redirect(`${back.startsWith(`/b/${brand}`) ? back.split("?")[0] : `/b/${brand}`}?cancelled=1`);
}

export async function addCompetitorAction(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
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
  const name = String(form.get("name") ?? "");
  await removeCompetitor(brand, name);
  redirect(`/b/${brand}?competitor=removed&name=${encodeURIComponent(name)}#competitors`);
}
