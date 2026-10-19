import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { canSee, COOKIE, session, type Session } from "./auth";

/** The current visitor, for server components and actions. */
export async function current(): Promise<Session | null> {
  return session((await cookies()).get(COOKIE)?.value);
}

/** Stop a guest from reading or changing another brand (actions take the brand from the form). */
export async function requireBrand(brand: string): Promise<void> {
  if (!canSee(await current(), brand)) notFound();
}

export async function requireOwner(): Promise<void> {
  if (!(await current())?.owner) notFound();
}
