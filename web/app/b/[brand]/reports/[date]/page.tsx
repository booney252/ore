import Link from "next/link";
import { notFound } from "next/navigation";
import { fromIdeas } from "@/app/actions";
import Markdown from "@/app/Markdown";
import { brandName, parseIdeas, readDoc } from "@/lib/brands";

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
  const name = await brandName(brand);

  return (
    <main className="with-side">
      <div>
        <p className="crumbs">
          <Link href="/">Brands</Link> / <Link href={`/b/${brand}`}>{name}</Link> /
        </p>
        <Markdown text={md} />
      </div>
      <aside className="card side">
        <h2>Turn ideas into ads</h2>
        {ideas.length === 0 ? (
          <p className="muted">No numbered ideas found in this report.</p>
        ) : (
          <form action={fromIdeas} className="stack">
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="report" value={date} />
            {pick && <p className="error">Tick at least one idea.</p>}
            <div className="checks">
              {ideas.map((i) => (
                <label key={i.n} className="check">
                  <input type="checkbox" name="idea" value={i.n} />
                  <span>
                    <strong>{i.n}.</strong> {i.title}
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" name="type" value="scripts">
              Get scripts
            </button>
            <button type="submit" name="type" value="briefs" className="secondary">
              Get creative briefs
            </button>
          </form>
        )}
      </aside>
    </main>
  );
}
