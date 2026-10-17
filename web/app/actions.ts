"use server";

import { redirect } from "next/navigation";
import { checkFile, checkSlug } from "@/lib/brands";
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
