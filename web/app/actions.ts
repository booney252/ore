"use server";

import { redirect } from "next/navigation";
import { brandExists, checkFile, checkSlug, createBrand, savePaste, slugify } from "@/lib/brands";
import { cancelJob, createJob } from "@/lib/jobs";

function formatOf(form: FormData): string {
  const f = String(form.get("format") ?? "ugc");
  return ["ugc", "broll", "static"].includes(f) ? f : "ugc";
}

export async function newReport(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const ideaCount = Math.min(50, Math.max(1, Number(form.get("idea_count")) || 10));
  await createJob({ type: "report", brand, idea_count: ideaCount, format: formatOf(form) });
  redirect(`/b/${brand}?queued=report`);
}

export async function fromIdeas(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const report = checkFile(String(form.get("report")));
  const type = form.get("type") === "briefs" ? "briefs" : "scripts";
  const ideas = form
    .getAll("idea")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ideas.length === 0) redirect(`/b/${brand}/reports/${report}?pick=1`);
  await createJob({ type, brand, ideas, report, format: formatOf(form) });
  redirect(`/b/${brand}?queued=${type}`);
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
  redirect(brandRemoved ? "/?cancelled=1" : `/b/${brand}?cancelled=1`);
}
