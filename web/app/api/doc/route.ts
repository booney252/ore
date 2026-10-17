import { NextResponse } from "next/server";
import { readDoc, type Kind } from "@/lib/brands";

const KINDS: Kind[] = ["reports", "iterations", "briefs"];

/** A report, iteration set or brief as a .md download. Behind the site password (middleware). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const brand = url.searchParams.get("brand") ?? "";
  const kind = url.searchParams.get("kind") as Kind;
  const file = url.searchParams.get("file") ?? "";
  if (!KINDS.includes(kind)) return new NextResponse("Not found", { status: 404 });
  let md: string | null = null;
  try {
    md = await readDoc(brand, kind, file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!md) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${brand}-${kind}-${file}.md"`,
    },
  });
}
