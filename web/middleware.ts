import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, token } from "./lib/auth";

export async function middleware(req: NextRequest) {
  if (!process.env.SITE_PASSWORD) {
    return new NextResponse("SITE_PASSWORD is not set.", { status: 500 });
  }
  if (req.cookies.get(COOKIE)?.value === (await token())) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
