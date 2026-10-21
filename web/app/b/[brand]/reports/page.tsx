import { newReport } from "@/app/actions";
import DocRows from "@/app/DocRows";
import Requests from "@/app/Requests";
import { brandName, listDocs, setupState } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Reports({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string; cancelled?: string }>;
}) {
  const { brand } = await params;
  const { queued, cancelled } = await searchParams;
  const [name, files, jobs, setup] = await Promise.all([
    brandName(brand),
    listDocs(brand, "reports"),
    listJobs(brand, 6, ["report"]),
    setupState(brand),
  ]);
  const running = jobs.some((j) => ["pending", "running"].includes(j.status ?? ""));

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">Step 1 · {name}</p>
        <h1 className="display tone-diamond">Reports</h1>
        <p className="lede">
          The Winning Ads Report finds what's winning right now, videos and statics, and takes each
          winner apart: every line and every frame, why it works, why the long-runners still work,
          and the patterns across them. Pick winners from it in Iterations.
        </p>
      </header>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Queued. It pulls new ads, breaks down the winners and writes the report.
        </p>
      )}
      {cancelled && (
        <p className="notice quiet">
          <span className="dot" aria-hidden="true" />
          Cancelled. If it was already running, it stops at its next step.
        </p>
      )}

      <section className="panel run run-wide">
        <div>
          <p className="mono muted">This week</p>
          <h2>Run the Winning {setup.organic ? "Posts" : "Ads"} Report</h2>
          <p className="muted">
            {setup.organic
              ? "Pulls the newest posts from every account you track, grades them against each account's usual, transcribes and breaks down the winners, then writes the report."
              : "Pulls new ads from every competitor (and you), scores them, transcribes and breaks down the top ones, re-checks they're still live, then writes the report."}
          </p>
        </div>
        <form action={newReport}>
          <input type="hidden" name="brand" value={brand} />
          <button type="submit" className="btn-primary" disabled={!setup.ready || running}>
            {running ? "Running…" : "Run report"}
          </button>
          {!setup.ready && <p className="mono muted">Available once setup is done</p>}
        </form>
      </section>

      <Requests brand={brand} jobs={jobs} back={`/b/${brand}/reports`} />

      <section className="block">
        <h2>Your reports</h2>
        <DocRows base={`/b/${brand}/reports`} files={files} tone="diamond" empty="No reports yet." />
      </section>
    </main>
  );
}
