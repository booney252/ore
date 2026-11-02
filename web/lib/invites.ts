import { randomBytes } from "node:crypto";
import { checkSlug } from "./brands";
import { readText, writeText } from "./storage";

const TOKEN = /^[A-Za-z0-9_-]{10,40}$/;

/** The brand's creator invite link token: one link the brand sends to every creator. Made on first use. */
export async function ensureInvite(brand: string): Promise<string> {
  const key = `brands/${checkSlug(brand)}/invite.json`;
  const raw = await readText(key);
  if (raw) {
    try {
      const t = JSON.parse(raw).token;
      if (TOKEN.test(t)) return t;
    } catch {}
  }
  const token = randomBytes(12).toString("base64url");
  await writeText(`invites/${token}.json`, JSON.stringify({ brand, created_at: new Date().toISOString() }));
  await writeText(key, JSON.stringify({ token }));
  return token;
}

/** Which brand an invite link belongs to, or null. */
export async function inviteBrand(token: string): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const raw = await readText(`invites/${token}.json`);
  if (!raw) return null;
  try {
    return checkSlug(JSON.parse(raw).brand);
  } catch {
    return null;
  }
}

export function inviteUrl(host: string, proto: string, token: string): string {
  return `${proto}://${host}/c/join/${token}`;
}
