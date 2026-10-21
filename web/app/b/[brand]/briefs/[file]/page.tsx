import Link from "next/link";
import { notFound } from "next/navigation";
import FeedbackBox from "@/app/FeedbackBox";
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
    <main className="page with-side doc-side">
      <div className="read">
        <div className="doc-bar">
          <p className="crumbs mono">
            <Link href={`/b/${brand}/briefs`}>Creative briefs</Link> / {file}
          </p>
          <span className="doc-links">
            <a href={`/api/gdoc?brand=${brand}&kind=briefs&file=${file}`} className="link-gdoc">
              Open in Google Docs ↗
            </a>
            <a href={`/api/doc?brand=${brand}&kind=briefs&file=${file}`} className="link-quiet">
              Download as Markdown
            </a>
          </span>
        </div>
        <Markdown text={md} />
      </div>
      <aside className="side">
        <FeedbackBox brand={brand} doc={`briefs/${file}`} about={`creative brief ${file}`} />
      </aside>
    </main>
  );
}
