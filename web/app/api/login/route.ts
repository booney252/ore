import { NextResponse } from "next/server";
import { COOKIE, login } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const value = await login(String(form.get("password") ?? ""));
  const res = NextResponse.redirect(new URL(value ? "/" : "/login?wrong=1", req.url), 303);
  if (value) {
    res.cookies.set(COOKIE, value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return res;
}
