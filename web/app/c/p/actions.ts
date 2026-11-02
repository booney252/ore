"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, isStatus, portalByToken, portalCookie, portalPass, setScriptStatus } from "@/lib/portal";

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

/** Log a creator into their portal with the password the brand gave them. */
export async function portalLogin(form: FormData) {
  const token = text(form, "token", 60);
  const p = await portalByToken(token);
  if (!p) redirect("/ore");
  if (!checkPassword(token, p!.pw, text(form, "password", 100))) redirect(`/c/p/${token}?wrong=1`);
  (await cookies()).set(portalCookie(token), portalPass(token, p!.pw), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/c/p/${token}`,
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(`/c/p/${token}`);
}

/** The logged-in portal for a token, or a redirect to its login. */
export async function portalSession(token: string) {
  const p = await portalByToken(token);
  if (!p) return null;
  const ok = (await cookies()).get(portalCookie(token))?.value === portalPass(token, p.pw);
  return ok ? p : { ...p, locked: true as const };
}

/** Mark a script To film / Filmed / Edited / Done, and save the video link or a note. */
export async function portalUpdate(form: FormData) {
  const token = text(form, "token", 60);
  const s = await portalSession(token);
  if (!s || "locked" in s) redirect(`/c/p/${token}`);
  const key = text(form, "key", 300);
  if (!/^(briefs|iterations)~[A-Za-z0-9._-]+~\d{1,2}$/.test(key)) redirect(`/c/p/${token}`);
  const patch: Record<string, string> = {};
  const status = text(form, "status", 20);
  if (status && isStatus(status)) patch.status = status;
  if (form.has("video")) {
    const v = text(form, "video", 500);
    patch.video = /^https?:\/\//i.test(v) ? v : "";
  }
  if (form.has("note")) patch.note = text(form, "note", 1500);
  await setScriptStatus(s!.brand, s!.creator, key, patch);
  revalidatePath(`/c/p/${token}`, "layout");
  revalidatePath(`/app/${s!.brand}/creators`);
  const back = text(form, "back", 300);
  redirect(back.startsWith(`/c/p/${token}`) ? `${back}${back.includes("?") ? "&" : "?"}saved=1` : `/c/p/${token}`);
}

/** A status tap from the Steps buttons: save it, refresh in the background, no page change. */
export async function portalStatus(form: FormData): Promise<void> {
  const token = text(form, "token", 60);
  const s = await portalSession(token);
  if (!s || "locked" in s) return;
  const key = text(form, "key", 300);
  const status = text(form, "status", 20);
  if (!/^(briefs|iterations)~[A-Za-z0-9._-]+~\d{1,2}$/.test(key) || !isStatus(status)) return;
  await setScriptStatus(s.brand, s.creator, key, { status });
  revalidatePath(`/c/p/${token}`, "layout");
  revalidatePath(`/app/${s.brand}/creators`);
}

export async function portalLogout(form: FormData) {
  const token = text(form, "token", 60);
  (await cookies()).delete({ name: portalCookie(token), path: `/c/p/${token}` });
  redirect(`/c/p/${token}`);
}
