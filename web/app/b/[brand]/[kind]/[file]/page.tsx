import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { KIND_LABEL, readDoc } from "@/lib/brands";

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
    <main className="page read">
      <p className="crumbs mono">
        <Link href={`/b/${brand}/${kind}`}>{KIND_LABEL[kind]}</Link> / {file}
      </p>
      <Markdown text={md} />
    </main>
  );
}
