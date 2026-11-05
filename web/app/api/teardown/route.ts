import { NextResponse, type NextRequest } from "next/server";
import { readText, writeText } from "@/lib/storage";
import { SITE, admit, hash, lookupApp, mailOn, newToken, saveReport, sendMail, today, type Report } from "@/lib/teardown";

const IP_DAILY = 3; // requests per IP address per day
const REPEAT_DAYS = 30; // one teardown per email (and per app, for the same email) this often

/** The landing page's free teardown form (public). Checks the request, then sends them to their report page. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const get = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const back = (q: string) => NextResponse.redirect(new URL(`/ore?${q}#teardown`, req.url), 303);
  if (get("website", 200)) return back("sent=1"); // honeypot: bots fill every field
  const email = get("email", 200);
  const input = get("app", 300);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !input) return back("err=1");

  // one per email: send a repeat back to the report they already have
  const emailKey = `leads/index/email-${hash(email)}.json`;
  const prior = await readText(emailKey);
  if (prior) {
    const p = JSON.parse(prior) as { token: string; at: string };
    if (Date.now() - Date.parse(p.at) < REPEAT_DAYS * 86400_000) return NextResponse.redirect(new URL(`/t/${p.token}`, req.url), 303);
  }

  // a few per IP address a day
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipKey = `leads/ip/${today()}/${hash(ip)}.json`;
  const ipCount = Number(JSON.parse((await readText(ipKey)) ?? "{}").count || 0);
  if (ipCount >= IP_DAILY) return back("err=2");
  await writeText(ipKey, JSON.stringify({ count: ipCount + 1 }));

  const app = await lookupApp(input);
  if (!app) return back("err=3");

  const at = new Date().toISOString();
  const id = `${at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${newToken().slice(0, 6)}`;
  const token = newToken();
  let r: Report = { id, token, status: "confirm", at, email, app, creators: "", creator_count: "" };

  if (mailOn()) {
    // confirm first: nothing costs money until they click
    const link = `${SITE}/api/teardown/confirm?t=${token}`;
    await sendMail(email, `Confirm your teardown for ${app.name}`,
      `<p>Click to start your free teardown for ${app.name}:</p><p><a href="${link}">Start my teardown</a></p><p>If you didn't ask for this, ignore this email.</p><p>Ore</p>`);
  } else {
    r = await admit(r);
  }
  await saveReport(r);
  await writeText(`leads/${id}.json`, JSON.stringify({ id, token, app: input, app_id: app.id, name: app.name, email, at, from: req.headers.get("referer") ?? "" }, null, 2));
  await writeText(emailKey, JSON.stringify({ token, at }));
  return NextResponse.redirect(new URL(`/t/${token}`, req.url), 303);
}
