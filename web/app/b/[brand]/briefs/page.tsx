import DocRows from "@/app/DocRows";
import Requests from "@/app/Requests";
import { brandName, listDocs } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Briefs({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string; cancelled?: string }>;
}) {
  const { brand } = await params;
  const { queued, cancelled } = await searchParams;
  const [name, files, iterations, jobs] = await Promise.all([
    brandName(brand),
    listDocs(brand, "briefs"),
    listDocs(brand, "iterations"),
    listJobs(brand, 6, ["briefs"]),
  ]);

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">Step 3 · {name}</p>
        <h1 className="display tone-ruby">Creative briefs</h1>
        <p className="lede">
          Full creative brief docs, ready to hand to a creator, editor or designer: the objective,
          the winners it's built from, hooks, the script or spec, notes, deliverables and a
          compliance check.
        </p>
      </header>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Queued. Your briefs show up below when they're written.
        </p>
      )}
      {cancelled && (
        <p className="notice quiet">
          <span className="dot" aria-hidden="true" />
          Cancelled. If it was already running, it stops at its next step.
        </p>
      )}

      <section className="block first">
        <h2>Your briefs</h2>
        <DocRows base={`/b/${brand}/briefs`} files={files} tone="ruby" empty="No briefs yet." />
      </section>

      <Requests brand={brand} jobs={jobs} back={`/b/${brand}/briefs`} />

      <section className="block">
        <h2>Make new briefs</h2>
        <p className="muted">Open a set of iterations and pick the ones to brief.</p>
        <DocRows
          base={`/b/${brand}/iterations`}
          files={iterations}
          tone="emerald"
          empty="No iterations yet. Make some in Iterations first."
        />
      </section>
    </main>
  );
}
