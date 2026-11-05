import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { writeText } from "@/lib/storage";

/** The landing page's free teardown form. Public: saves the request to leads/ and sends the visitor back. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const get = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const back = (q: string) => NextResponse.redirect(new URL(`/ore?${q}#teardown`, req.url), 303);
  if (get("website", 200)) return back("sent=1"); // honeypot: bots fill every field
  const email = get("email", 200);
  const app = get("app", 300);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !app) return back("err=1");
  const lead = {
    app,
    email,
    creators: get("creators", 2000),
    notes: get("notes", 1000),
    at: new Date().toISOString(),
    from: req.headers.get("referer") ?? "",
  };
  const id = `${lead.at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
  await writeText(`leads/${id}.json`, JSON.stringify(lead, null, 2));
  return back("sent=1");
}
