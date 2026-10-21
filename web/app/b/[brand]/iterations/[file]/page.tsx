import Link from "next/link";
import { notFound } from "next/navigation";
import { newBriefs } from "@/app/actions";
import CreatorPicker from "@/app/CreatorPicker";
import FeedbackBox from "@/app/FeedbackBox";
import Markdown from "@/app/Markdown";
import { parseIterations, readDoc } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function IterationDoc({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string; file: string }>;
  searchParams: Promise<{ pick?: string }>;
}) {
  const { brand, file } = await params;
  const { pick } = await searchParams;
  let md: string | null = null;
  try {
    md = await readDoc(brand, "iterations", file);
  } catch {
    notFound();
  }
  if (!md) notFound();
  const its = parseIterations(md);

  return (
    <main className="page with-side">
      <div className="read">
        <p className="crumbs mono">
          <Link href={`/b/${brand}/iterations`}>Iterations</Link> / {file}
        </p>
        <Markdown text={md} />
      <FeedbackBox brand={brand} doc={`iterations/${file}`} about={`iteration ${file}`} back={`/b/${brand}/skills`} />
      </div>
      <aside className="side">
        <p className="mono muted">Step 3</p>
        <h2>Make creative briefs</h2>
        {its.length === 0 ? (
          <p className="empty">No numbered iterations in this file.</p>
        ) : (
          <form action={newBriefs} className="side-form">
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="iterations" value={file} />
            <p className="muted side-note">
              Pick the iterations to turn into full creative brief docs for a creator, editor or
              designer.
            </p>
            {pick && <p className="error">Pick at least one iteration.</p>}
            <div className="checks">
              {its.map((i) => (
                <label key={i.n} className="check">
                  <input type="checkbox" name="number" value={i.n} />
                  <span className="mono">{String(i.n).padStart(2, "0")}</span>
                  <span>{i.title}</span>
                </label>
              ))}
            </div>
            <CreatorPicker brand={brand} />
            <button type="submit" className="btn-primary ruby">
              Write creative briefs
            </button>
          </form>
        )}
        <span className="doc-links">
          <a href={`/api/gdoc?brand=${brand}&kind=iterations&file=${file}`} className="link-gdoc">
            Open in Google Docs ↗
          </a>
          <a href={`/api/doc?brand=${brand}&kind=iterations&file=${file}`} className="link-quiet">
            Download as Markdown
          </a>
        </span>
      </aside>
    </main>
  );
}
