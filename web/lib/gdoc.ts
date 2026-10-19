import { createHmac, timingSafeEqual } from "node:crypto";
import { marked } from "marked";
import { readDoc, type Kind } from "./brands";

/**
 * "Open in Google Docs": Google sign-in with the drive.file scope (Ore can only touch files it
 * creates), then the doc goes up to Drive as HTML and Google converts it to a real Doc.
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a free Google Cloud OAuth client).
 */

export const KINDS: Kind[] = ["reports", "iterations", "briefs"];
const SCOPE = "https://www.googleapis.com/auth/drive.file";

export type DocRef = { brand: string; kind: Kind; file: string };

export function configured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(req: Request): string {
  return process.env.GOOGLE_REDIRECT_URI || `${new URL(req.url).origin}/api/gdoc/callback`;
}

function sign(body: string): string {
  return createHmac("sha256", `ore-gdoc:${process.env.SITE_PASSWORD ?? ""}`).update(body).digest("base64url");
}

/** The doc to export rides through Google's redirect in `state`, signed so it can't be swapped. */
export function encodeState(ref: DocRef): string {
  const body = Buffer.from(JSON.stringify({ ...ref, t: Date.now() })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeState(state: string): DocRef | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  if (Date.now() - data.t > 15 * 60 * 1000 || !KINDS.includes(data.kind)) return null;
  return { brand: data.brand, kind: data.kind, file: data.file };
}

export function authUrl(req: Request, ref: DocRef): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: SCOPE,
    state: encodeState(ref),
    include_granted_scopes: "true",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function accessToken(req: Request, code: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

const KIND_LABEL: Record<Kind, string> = {
  reports: "Winning Ads Report",
  iterations: "Iterations",
  briefs: "Creative brief",
};

export function title(ref: DocRef): string {
  return `${ref.brand} · ${KIND_LABEL[ref.kind]} · ${ref.file}`;
}

/** Markdown to HTML Google Docs imports cleanly: headings, lists, bold, bordered tables. */
export function toHtml(md: string, heading: string): string {
  const body = marked.parse(md.replace(/<!--[\s\S]*?-->/g, ""), { gfm: true, async: false }) as string;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(heading)}</title>
<style>
body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
table { border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
th { background: #f1f1f1; }
blockquote { color: #555; border-left: 3px solid #ccc; padding-left: 8pt; }
code { font-family: "Courier New", monospace; }
</style></head><body>${body}</body></html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Exchange the code, upload the doc as a Google Doc, and return its URL. */
export async function exportDoc(req: Request, code: string, ref: DocRef): Promise<string> {
  const md = await readDoc(ref.brand, ref.kind, ref.file);
  if (!md) throw new Error("That doc doesn't exist.");
  const token = await accessToken(req, code);
  const name = title(ref);
  const boundary = `ore${Date.now()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, mimeType: "application/vnd.google-apps.document" }) +
    `\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n` +
    toHtml(md, name) +
    `\r\n--${boundary}--`;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) throw new Error(`Google Drive upload failed (${res.status}): ${await res.text()}`);
  const file = await res.json();
  return file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`;
}
