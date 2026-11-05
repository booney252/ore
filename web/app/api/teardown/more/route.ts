import { NextResponse, type NextRequest } from "next/server";
import { createJob } from "@/lib/jobs";
import { loadReport, saveReport } from "@/lib/teardown";

const COUNTS = ["0", "1-10", "10+"];

/** The report page's optional step: how many creators they run, and a line on up to 3 of them. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const r = await loadReport(token);
  if (!r) return NextResponse.redirect(new URL("/ore", req.url), 303);
  const count = String(form.get("count") ?? "");
  const creators = String(form.get("creators") ?? "").trim().slice(0, 2000);
  const next = { ...r, creator_count: COUNTS.includes(count) ? count : r.creator_count, creators: creators || r.creators };
  await saveReport(next);
  // the report is already built: write their scripts now (the build skips everything else)
  if (creators && !r.scripts?.length && r.status === "ready" && !r.scripts_queued) {
    await createJob({ type: "teardown", brand: `td-${r.app.id}`, token });
    await saveReport({ ...next, scripts_queued: true });
  }
  return NextResponse.redirect(new URL(`/t/${token}#creators`, req.url), 303);
}
