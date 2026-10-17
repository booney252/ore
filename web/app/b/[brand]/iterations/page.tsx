import Link from "next/link";
import { newIterations } from "@/app/actions";
import { docLabel } from "@/app/dates";
import DocRows from "@/app/DocRows";
import FormatPicker from "@/app/FormatPicker";
import PickCard from "@/app/PickCard";
import Requests from "@/app/Requests";
import { loadAds } from "@/lib/ads";
import { brandName, listDocs, reportTop } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Iterations({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ report?: string; queued?: string; pick?: string; cancelled?: string }>;
}) {
  const { brand } = await params;
  const { report: wanted, queued, pick, cancelled } = await searchParams;
  const [name, reports, files, jobs, ads] = await Promise.all([
    brandName(brand),
    listDocs(brand, "reports"),
    listDocs(brand, "iterations"),
    listJobs(brand, 6, ["iterations"]),
    loadAds(brand),
  ]);
  const report = reports.includes(wanted ?? "") ? wanted! : reports[0];
  const top = report ? await reportTop(brand, report) : null;
  const byId = new Map(ads.map((a) => [a.ad_id, a]));

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">Step 2 · {name}</p>
        <h1 className="display tone-emerald">Iterations</h1>
        <p className="lede">
          Pick winners from a report and a format. Each one comes back as an iteration for {name}: a
          word-for-word script for UGC, a shot list with on-screen text for B-roll, or the image and
          copy for a static.
        </p>
      </header>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Queued. Your iterations show up below when they're written.
        </p>
      )}
      {cancelled && (
        <p className="notice quiet">
          <span className="dot" aria-hidden="true" />
          Cancelled. If it was already running, it stops at its next step.
        </p>
      )}

      {!report ? (
        <section className="panel">
          <h2 className="panel-title">No report yet</h2>
          <p className="muted">
            Iterations start from a Winning Ads Report. <Link href={`/b/${brand}/reports`}>Run one in Reports</Link>.
          </p>
        </section>
      ) : (
        <form action={newIterations} className="iterate">
          <input type="hidden" name="brand" value={brand} />
          <input type="hidden" name="report" value={report} />

          <div className="iterate-head">
            <div>
              <p className="mono muted">From the report of</p>
              <div className="report-pills">
                {reports.slice(0, 6).map((r) => (
                  <Link
                    key={r}
                    href={`/b/${brand}/iterations?report=${r}`}
                    className={r === report ? "on" : ""}
                  >
                    {docLabel(r).date}
                  </Link>
                ))}
              </div>
            </div>
            <Link href={`/b/${brand}/reports/${report}`} className="link-quiet">
              Read this report →
            </Link>
          </div>

          <p className="mono muted pick-label">1 · Pick the winners</p>
          {pick && <p className="error">Pick at least one winner.</p>}
          {top ? (
            <div className="pick-grid">
              {top
                .filter((t) => byId.has(t.ad_id))
                .map((t) => (
                  <PickCard key={t.ad_id} ad={byId.get(t.ad_id)!} rank={t.rank} name="ad" />
                ))}
            </div>
          ) : (
            <p className="empty">This report has no ranked winners list. Re-run the report to pick from it.</p>
          )}

          <div className="iterate-foot panel">
            <FormatPicker label="2 · Pick the format" />
            <label className="per-ad">
              <span className="mono muted">Per winner</span>
              <select name="per_ad" defaultValue="1">
                <option value="1">1 iteration</option>
                <option value="2">2 iterations</option>
                <option value="3">3 iterations</option>
              </select>
            </label>
            <button type="submit" className="btn-primary emerald" disabled={!top}>
              Write iterations
            </button>
          </div>
        </form>
      )}

      <Requests brand={brand} jobs={jobs} back={`/b/${brand}/iterations`} />

      <section className="block">
        <h2>Your iterations</h2>
        <DocRows base={`/b/${brand}/iterations`} files={files} tone="emerald" empty="No iterations yet." />
      </section>
    </main>
  );
}
