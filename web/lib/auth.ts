export const COOKIE = "ore_auth";

/**
 * Who's logged in: the owner (SITE_PASSWORD, sees every brand) or a guest who sees one brand.
 * Guests come from GUEST_PASSWORDS, e.g. "peptidepal:pw-for-michael,peptidepal:pw-for-vik".
 * Removing a guest's entry logs them out, since their cookie no longer matches anything.
 */
export type Session = { owner: true } | { owner: false; brand: string };

async function hash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Owner cookie value: a hash of the site password, so the password itself never sits in a cookie. */
export async function token(): Promise<string> {
  return hash(`ore:${process.env.SITE_PASSWORD ?? ""}`);
}

function guests(): { brand: string; password: string }[] {
  // Forgiving about how it's pasted into Vercel: quotes, new lines or spaces between entries,
  // and the brand in capitals ("AICL:pw") all still work.
  return (process.env.GUEST_PASSWORDS ?? "")
    .replace(/^\s*["']|["']\s*$/g, "")
    .split(/[,\n]/)
    .map((entry) => {
      const i = entry.indexOf(":");
      if (i < 0) return { brand: "", password: "" };
      return { brand: entry.slice(0, i).trim().toLowerCase(), password: entry.slice(i + 1).trim() };
    })
    .filter((g) => g.brand && g.password);
}

async function guestToken(brand: string, password: string): Promise<string> {
  return `g.${brand}.${await hash(`ore:guest:${brand}:${password}`)}`;
}

/** The cookie value for a password, or null if it isn't one. */
export async function login(password: string): Promise<string | null> {
  if (!password) return null;
  if (process.env.SITE_PASSWORD && password === process.env.SITE_PASSWORD) return token();
  const guest = guests().find((g) => g.password === password);
  return guest ? guestToken(guest.brand, guest.password) : null;
}

export async function session(cookie: string | undefined): Promise<Session | null> {
  if (!cookie || !process.env.SITE_PASSWORD) return null;
  if (cookie === (await token())) return { owner: true };
  if (!cookie.startsWith("g.")) return null;
  for (const g of guests()) {
    if (cookie === (await guestToken(g.brand, g.password))) return { owner: false, brand: g.brand };
  }
  return null;
}

export function canSee(s: Session | null, brand: string): boolean {
  return Boolean(s && (s.owner || s.brand === brand));
}
