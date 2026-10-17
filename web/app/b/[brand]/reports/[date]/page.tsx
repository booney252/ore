import Link from "next/link";
import { notFound } from "next/navigation";
import { fromIdeas } from "@/app/actions";
import FormatPicker from "@/app/FormatPicker";
import Markdown from "@/app/Markdown";
import { parseIdeas, readDoc } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Report({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string; date: string }>;
  searchParams: Promise<{ pick?: string }>;
}) {
  const { brand, date } = await params;
  const { pick } = await searchParams;
  let md: string | null = null;
  try {
    md = await readDoc(brand, "reports", date);
  } catch {
    notFound();
  }
  if (!md) notFound();
  const ideas = parseIdeas(md);

  return (
    <main className="page with-side">
      <div className="read">
        <p className="crumbs mono">
          <Link href={`/b/${brand}/reports`}>Reports</Link> / {date}
        </p>
        <Markdown text={md} />
      </div>
      <aside className="side">
        <p className="mono muted">Next step</p>
        <h2>Turn ideas into ads</h2>
        {ideas.length === 0 ? (
          <p className="empty">No numbered ideas in this report.</p>
        ) : (
          <form action={fromIdeas} className="side-form">
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="report" value={date} />
            {pick && <p className="error">Pick at least one idea.</p>}
            <div className="checks">
              {ideas.map((i) => (
                <label key={i.n} className="check">
                  <input type="checkbox" name="idea" value={i.n} />
                  <span className="mono">{String(i.n).padStart(2, "0")}</span>
                  <span>{i.title}</span>
                </label>
              ))}
            </div>
            <FormatPicker />
            <button type="submit" name="type" value="scripts" className="btn-primary emerald">
              Get scripts
            </button>
            <button type="submit" name="type" value="briefs" className="btn-primary ruby">
              Get creative briefs
            </button>
          </form>
        )}
      </aside>
    </main>
  );
}
