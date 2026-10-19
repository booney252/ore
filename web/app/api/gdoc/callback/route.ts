import { NextResponse } from "next/server";
import { decodeState, exportDoc } from "@/lib/gdoc";

/** Google sends the user back here: create the Doc and open it. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = decodeState(url.searchParams.get("state") ?? "");
  if (!ref) return new NextResponse("That link expired. Go back and click Open in Google Docs again.", { status: 400 });
  const back = `/b/${ref.brand}/${ref.kind}/${ref.file}`;
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(back, url.origin));
  try {
    return NextResponse.redirect(await exportDoc(req, code, ref));
  } catch (e) {
    return new NextResponse(`Couldn't create the Google Doc. ${(e as Error).message}`, { status: 502 });
  }
}
