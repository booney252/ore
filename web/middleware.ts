import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, session } from "./lib/auth";

export async function middleware(req: NextRequest) {
  if (!process.env.SITE_PASSWORD) {
    return new NextResponse("SITE_PASSWORD is not set.", { status: 500 });
  }
  const who = await session(req.cookies.get(COOKIE)?.value);
  if (!who) return redirect(req, "/login");
  if (who.owner) return NextResponse.next();

  // A guest sees one brand and nothing else.
  const path = req.nextUrl.pathname;
  const home = `/b/${who.brand}`;
  if (path === home || path.startsWith(`${home}/`)) return NextResponse.next();
  if (path === "/api/logout" || path === "/api/gdoc/callback") return NextResponse.next();
  if (path === "/api/doc" || path === "/api/gdoc") {
    return req.nextUrl.searchParams.get("brand") === who.brand
      ? NextResponse.next()
      : new NextResponse("Not found", { status: 404 });
  }
  if (path.startsWith("/api/")) return new NextResponse("Not found", { status: 404 });
  return redirect(req, home);
}

function redirect(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|ore$|ore/|_next/static|_next/image|favicon.ico).*)"],
};
