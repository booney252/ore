import { NextResponse } from "next/server";
import { authUrl, configured, KINDS } from "@/lib/gdoc";
import type { Kind } from "@/lib/brands";

/** Start "Open in Google Docs": send the user to Google sign-in. Behind the site password. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const brand = url.searchParams.get("brand") ?? "";
  const kind = url.searchParams.get("kind") as Kind;
  const file = url.searchParams.get("file") ?? "";
  if (!KINDS.includes(kind) || !brand || !file) return new NextResponse("Not found", { status: 404 });
  if (!configured()) {
    return new NextResponse(
      "Google Docs export isn't set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the site's environment (see docs/google-docs.md).",
      { status: 503 },
    );
  }
  return NextResponse.redirect(authUrl(req, { brand, kind, file }));
}
