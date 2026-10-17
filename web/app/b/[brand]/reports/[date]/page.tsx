import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { readDoc } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Report({ params }: { params: Promise<{ brand: string; date: string }> }) {
  const { brand, date } = await params;
  let md: string | null = null;
  try {
    md = await readDoc(brand, "reports", date);
  } catch {
    notFound();
  }
  if (!md) notFound();

  return (
    <main className="page with-side">
      <div className="read">
        <p className="crumbs mono">
          <Link href={`/b/${brand}/reports`}>Reports</Link> / {date}
        </p>
        <Markdown text={md} />
      </div>
      <aside className="side">
        <p className="mono muted">Step 2</p>
        <h2>Make it yours</h2>
        <p className="muted side-note">
          Pick the winners you want to iterate on, choose UGC, B-roll or static, and get ready-to-make
          iterations for your product.
        </p>
        <Link href={`/b/${brand}/iterations?report=${date}`} className="btn-primary emerald btn-link">
          Make iterations →
        </Link>
        <a href={`/api/doc?brand=${brand}&kind=reports&file=${date}`} className="link-quiet">
          Download as Markdown
        </a>
      </aside>
    </main>
  );
}
