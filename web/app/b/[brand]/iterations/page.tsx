import Link from "next/link";
import { newIterations } from "@/app/actions";
import { docLabel } from "@/app/dates";
import DocRows from "@/app/DocRows";
import CreatorPicker from "@/app/CreatorPicker";
import SegmentPicker from "@/app/SegmentPicker";
import FormatPicker from "@/app/FormatPicker";
import PickCard from "@/app/PickCard";
import Requests from "@/app/Requests";
import { loadAds } from "@/lib/ads";
import { brandName, brandSegments, defaultFormat, docTitles, listDocs, reportTop } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Iterations({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ report?: string; queued?: string; pick?: string; cancelled?: string; deleted?: string }>;
}) {
  const { brand } = await params;
  const { report: wanted, queued, pick, cancelled, deleted } = await searchParams;
  const [name, reports, files, jobs, ads, format] = await Promise.all([
    brandName(brand),
    listDocs(brand, "reports"),
    listDocs(brand, "iterations"),
    listJobs(brand, 6, ["iterations"]),
    loadAds(brand),
    defaultFormat(brand),
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
          Pick winners from a report, or bring your own idea, and choose a format. You get iterations
          for {name}: a word-for-word script for UGC, a shot list with on-screen text for B-roll, or
          the image and copy for a static.
        </p>
      </header>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Queued. Your iterations show up below when they're written.
        </p>
      )}
      {deleted && <p className="notice quiet">Iterations deleted.</p>}
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

          <p className="mono muted pick-label">1 · Pick winners to iterate on</p>
          {pick && <p className="error">Pick a winner or write your own idea.</p>}
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

          <div className="or-rule" aria-hidden="true">
            <span>or</span>
          </div>

          <section className="panel own-idea">
            <div>
              <p className="mono muted">Bring your own idea</p>
              <h2>Your idea, built on what's winning</h2>
              <p className="muted">
                Took something from the report? Mix it with what you want to make. It's written from
                your idea, the whole report and your research brief. Winners you tick above are used
                as extra inspiration; leave them all unticked to start from just your idea.
              </p>
            </div>
            <label className="field">
              <span className="sr-only">Your idea</span>
              <textarea
                name="idea"
                rows={5}
                maxLength={2000}
                placeholder={`e.g. "Nobody in the report shows the morning. A guy's alarm goes off at 6, he reaches for his phone out of habit and it's locked until he's up. Use the 'you can't cheat this one' angle, but about the morning."`}
              />
            </label>
          </section>

          <div className="iterate-foot panel">
            <FormatPicker label="2 · Pick the format" initial={format} />
            <label className="per-ad">
              <span className="mono muted">How many</span>
              <select name="per_ad" defaultValue="1">
                <option value="1">1 each</option>
                <option value="2">2 each</option>
                <option value="3">3 each</option>
              </select>
            </label>
            <CreatorPicker brand={brand} />
            <SegmentPicker brand={brand} />
            <button type="submit" className="btn-primary emerald" disabled={!top}>
              Write iterations
            </button>
          </div>
        </form>
      )}

      <Requests brand={brand} jobs={jobs} back={`/b/${brand}/iterations`} />

      <section className="block">
        <h2>Your iterations</h2>
        <DocRows
          base={`/b/${brand}/iterations`}
          files={files}
          tone="emerald"
          empty="No iterations yet."
          titles={await docTitles(brand, "iterations", files)}
          remove={{ brand, kind: "iterations" }}
          audiences={Object.fromEntries((await brandSegments(brand)).map((s) => [s.key, s.label]))}
        />
      </section>
    </main>
  );
}
