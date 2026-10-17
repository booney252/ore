import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { readDoc } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function BriefDoc({ params }: { params: Promise<{ brand: string; file: string }> }) {
  const { brand, file } = await params;
  let md: string | null = null;
  try {
    md = await readDoc(brand, "briefs", file);
  } catch {
    notFound();
  }
  if (!md) notFound();
  return (
    <main className="page read">
      <div className="doc-bar">
        <p className="crumbs mono">
          <Link href={`/b/${brand}/briefs`}>Creative briefs</Link> / {file}
        </p>
        <a href={`/api/doc?brand=${brand}&kind=briefs&file=${file}`} className="link-quiet">
          Download as Markdown
        </a>
      </div>
      <Markdown text={md} />
    </main>
  );
}
