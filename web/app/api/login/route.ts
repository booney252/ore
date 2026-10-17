import { NextResponse } from "next/server";
import { COOKIE, token } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const ok = process.env.SITE_PASSWORD && form.get("password") === process.env.SITE_PASSWORD;
  const res = NextResponse.redirect(new URL(ok ? "/" : "/login?wrong=1", req.url), 303);
  if (ok) {
    res.cookies.set(COOKIE, await token(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return res;
}
