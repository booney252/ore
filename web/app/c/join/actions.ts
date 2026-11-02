"use server";

import { redirect } from "next/navigation";
import { inviteBrand } from "@/lib/invites";
import { saveCreator } from "@/lib/creators";

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

/** A creator fills in their own profile from the brand's invite link. No account. */
export async function joinAsCreator(form: FormData) {
  const token = text(form, "token", 60);
  const brand = await inviteBrand(token);
  if (!brand) redirect("/ore");
  const name = text(form, "name", 80);
  if (!name) redirect(`/c/join/${token}?missing=1`);
  if (text(form, "website", 200)) redirect(`/c/join/${token}?done=1`); // bots fill the hidden field
  await saveCreator(brand!, {
    name,
    handle: text(form, "handle", 200),
    platforms: text(form, "platforms", 200),
    about: text(form, "about", 1500),
    story: text(form, "story", 1500),
    audience: text(form, "audience", 200),
    can_film: text(form, "can_film", 200),
    voice: text(form, "voice", 1500),
    can_claim: text(form, "can_claim", 1500),
    avoid: text(form, "avoid", 200),
  });
  redirect(`/c/join/${token}?done=1`);
}
