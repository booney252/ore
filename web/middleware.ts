import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, canPreview, session } from "./lib/auth";

export async function middleware(req: NextRequest) {
  if (!process.env.SITE_PASSWORD) {
    return new NextResponse("SITE_PASSWORD is not set.", { status: 500 });
  }
  const cookie = req.cookies.get(COOKIE)?.value;
  const path0 = req.nextUrl.pathname;
  // Pre-release: the landing page and teardown reports need the preview password (or any login).
  if (path0 === "/ore" || path0.startsWith("/ore/") || path0.startsWith("/t/") || path0.startsWith("/api/teardown")) {
    if (await canPreview(cookie)) return NextResponse.next();
    if (path0.startsWith("/api/")) return new NextResponse("Not found", { status: 404 });
    return redirect(req, "/login");
  }
  const who = await session(cookie);
  if (!who) return redirect(req, "/login");
  if (who.owner) return NextResponse.next();

  // A guest sees one brand and nothing else.
  const path = req.nextUrl.pathname;
  const home = `/b/${who.brand}`;
  if (path === home || path.startsWith(`${home}/`)) return NextResponse.next();
  // the customer app: the guest's own brand only
  const app = `/app/${who.brand}`;
  if (path === "/app" || path === app || path.startsWith(`${app}/`)) return NextResponse.next();
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
  matcher: ["/((?!login|api/login|c/|_next/static|_next/image|favicon.ico).*)"],
};
