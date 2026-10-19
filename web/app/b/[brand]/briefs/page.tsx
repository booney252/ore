import Link from "next/link";
import { newBriefs } from "@/app/actions";
import { docLabel } from "@/app/dates";
import DocRows from "@/app/DocRows";
import Requests from "@/app/Requests";
import { brandName, docTitles, listDocs, parseIterations, readDoc } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const FORMAT_TONE: Record<string, string> = { UGC: "diamond", "B-roll": "emerald", Static: "ruby" };

export default async function Briefs({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string; cancelled?: string; deleted?: string; pick?: string }>;
}) {
  const { brand } = await params;
  const { queued, cancelled, deleted, pick } = await searchParams;
  const [name, files, iterationFiles, jobs] = await Promise.all([
    brandName(brand),
    listDocs(brand, "briefs"),
    listDocs(brand, "iterations"),
    listJobs(brand, 6, ["briefs"]),
  ]);
  const sets = (
    await Promise.all(
      iterationFiles.slice(0, 12).map(async (file) => ({
        file,
        label: docLabel(file),
        idea: /-idea-[0-9a-f]{6}/.test(file),
        its: parseIterations((await readDoc(brand, "iterations", file)) ?? ""),
      })),
    )
  ).filter((s) => s.its.length > 0);

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">Step 3 · {name}</p>
        <h1 className="display tone-ruby">Creative briefs</h1>
        <p className="lede">
          Pick any iterations, from any set and in any format, and get one creative brief doc with a
          brief for each: objective, the winners it's built from, hooks, the script or spec, notes,
          deliverables and a compliance check.
        </p>
      </header>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Queued. Your brief doc shows up below when it's written.
        </p>
      )}
      {deleted && <p className="notice quiet">Brief deleted.</p>}
      {cancelled && (
        <p className="notice quiet">
          <span className="dot" aria-hidden="true" />
          Cancelled. If it was already running, it stops at its next step.
        </p>
      )}

      {sets.length === 0 ? (
        <section className="panel">
          <h2 className="panel-title">No iterations yet</h2>
          <p className="muted">
            Briefs are built from iterations. <Link href={`/b/${brand}/iterations`}>Make some in Iterations</Link>.
          </p>
        </section>
      ) : (
        <form action={newBriefs} className="brief-pick">
          <input type="hidden" name="brand" value={brand} />
          <p className="mono muted pick-label">Pick the iterations to brief</p>
          {pick && <p className="error">Pick at least one iteration.</p>}
          <div className="brief-sets">
            {sets.map((set) => (
              <fieldset key={set.file} className="brief-set">
                <legend>
                  <span className={`tag ${FORMAT_TONE[set.label.format ?? "UGC"] ?? ""}`}>
                    {set.label.format ?? "UGC"}
                  </span>
                  <Link href={`/b/${brand}/iterations/${set.file}`}>
                    {set.label.date} · {set.idea ? "your idea" : `winners ${set.file.match(/-ads-([\d-]+?)(?:-x\d|-broll|-static|$)/)?.[1]?.split("-").map((n) => `#${n}`).join(", ") ?? ""}`}
                  </Link>
                </legend>
                {set.its.map((it) => (
                  <label key={it.n} className="check">
                    <input type="checkbox" name="pick" value={`${set.file}:${it.n}`} />
                    <span className="mono">{String(it.n).padStart(2, "0")}</span>
                    <span>{it.title}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <div className="brief-foot">
            <p className="muted">Each brief is written in its own iteration's format, all in one doc.</p>
            <button type="submit" className="btn-primary ruby">
              Write creative brief
            </button>
          </div>
        </form>
      )}

      <Requests brand={brand} jobs={jobs} back={`/b/${brand}/briefs`} />

      <section className="block">
        <h2>Your briefs</h2>
        <DocRows
          base={`/b/${brand}/briefs`}
          files={files}
          tone="ruby"
          empty="No briefs yet."
          titles={await docTitles(brand, "briefs", files)}
          remove={{ brand, kind: "briefs" }}
        />
      </section>
    </main>
  );
}
