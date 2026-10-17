import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { brandName, readDoc } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Doc({
  params,
}: {
  params: Promise<{ brand: string; kind: string; file: string }>;
}) {
  const { brand, kind, file } = await params;
  if (kind !== "scripts" && kind !== "briefs") notFound();
  let md: string | null = null;
  try {
    md = await readDoc(brand, kind, file);
  } catch {
    notFound();
  }
  if (!md) notFound();
  return (
    <main>
      <p className="crumbs">
        <Link href="/">Brands</Link> / <Link href={`/b/${brand}`}>{await brandName(brand)}</Link> /
      </p>
      <Markdown text={md} />
    </main>
  );
}
