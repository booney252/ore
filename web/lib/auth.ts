export const COOKIE = "ore_auth";

/** Cookie value: a hash of the site password, so the password itself never sits in a cookie. */
export async function token(): Promise<string> {
  const data = new TextEncoder().encode(`ore:${process.env.SITE_PASSWORD ?? ""}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
