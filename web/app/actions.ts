"use server";

import { redirect } from "next/navigation";
import { brandExists, checkFile, checkSlug, createBrand, slugify } from "@/lib/brands";
import { createJob } from "@/lib/jobs";

export async function newReport(form: FormData) {
  const brand = checkSlug(String(form.get("brand")));
  const ideaCount = Math.min(50, Math.max(1, Number(form.get("idea_count")) || 10));
  await createJob({ type: "report", brand, idea_count: ideaCount });
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
  await createJob({ type, brand, ideas, report });
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
