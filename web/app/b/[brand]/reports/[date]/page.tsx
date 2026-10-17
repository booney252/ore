import Link from "next/link";
import { notFound } from "next/navigation";
import { fromIdeas } from "@/app/actions";
import Gem from "@/app/Gem";
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
          <Link href="/">Brands</Link> / <Link href={`/b/${brand}`}>{name}</Link>
        </p>
        <Markdown text={md} />
      </div>
      <aside className="card side" data-gem="diamond">
        <div className="hero" style={{ marginBottom: 6, gap: 12 }}>
          <Gem kind="diamond" size={30} />
          <h2>Turn ideas into ads</h2>
        </div>
        {ideas.length === 0 ? (
          <p className="empty">No numbered ideas in this report.</p>
        ) : (
          <form action={fromIdeas} className="stack">
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="report" value={date} />
            <p className="muted" style={{ margin: 0 }}>
              Pick the ideas you want to make.
            </p>
            {pick && <p className="error" style={{ margin: 0 }}>Pick at least one idea.</p>}
            <div className="checks">
              {ideas.map((i) => (
                <label key={i.n} className="check">
                  <input type="checkbox" name="idea" value={i.n} />
                  <span>
                    <strong>{i.n}</strong>
                    {i.title}
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" name="type" value="scripts" data-gem="emerald">
              Get scripts
            </button>
            <button type="submit" name="type" value="briefs" data-gem="ruby">
              Get creative briefs
            </button>
          </form>
        )}
      </aside>
    </main>
  );
}
