import { NextResponse, type NextRequest } from "next/server";
import { admit, loadReport, saveReport } from "@/lib/teardown";

/** The link in the confirm email: start the teardown (or put it on tomorrow's list). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const r = await loadReport(token);
  if (!r) return NextResponse.redirect(new URL("/ore", req.url), 303);
  if (r.status === "confirm") await saveReport(await admit(r));
  return NextResponse.redirect(new URL(`/t/${token}`, req.url), 303);
}
