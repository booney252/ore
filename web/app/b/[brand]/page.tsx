import Link from "next/link";
import { newReport } from "@/app/actions";
import AdCard from "@/app/AdCard";
import { docLabel } from "@/app/dates";
import { loadAds, stats, winners } from "@/lib/ads";
import { brandName, listDocs, type Kind } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const KIND: Record<Kind, { label: string; tone: string }> = {
  reports: { label: "Report", tone: "diamond" },
  scripts: { label: "Scripts", tone: "emerald" },
  briefs: { label: "Briefs", tone: "ruby" },
};
const JOB_LABEL = { report: "Winning Ads Report", scripts: "Scripts", briefs: "Creative briefs" };

export default async function Overview({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string }>;
}) {
  const { brand } = await params;
  const { queued } = await searchParams;
  const kinds = Object.keys(KIND) as Kind[];
  const [name, ads, jobs, ...docs] = await Promise.all([
    brandName(brand),
    loadAds(brand),
    listJobs(brand, 6),
    ...kinds.map((k) => listDocs(brand, k)),
  ]);
  const s = stats(ads);
  const top = winners(ads, 2).slice(0, 5);
  const latest = kinds
    .flatMap((k, i) => docs[i].map((file) => ({ kind: k, file })))
    .sort((a, b) => b.file.localeCompare(a.file))
    .slice(0, 6);

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">Overview</p>
        <h1 className="display">{name}</h1>
      </header>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Queued. The worker picks it up and it shows up here when it's done.
        </p>
      )}

      <dl className="stats">
        <Stat n={s.total} label="Ads tracked" />
        <Stat n={s.advertisers} label="Advertisers" />
        <Stat n={s.brokenDown} label="Taken apart" />
        <Stat n={s.active} label="Still running" />
      </dl>

      <section className="block">
        <div className="block-head">
          <h2>Winning right now</h2>
          <Link href={`/b/${brand}/ads`} className="link-quiet">
            All winners →
          </Link>
        </div>
        {top.length === 0 ? (
          <p className="empty">No broken-down ads yet.</p>
        ) : (
          <div className="ad-row">
            {top.map((ad, i) => (
              <AdCard key={ad.ad_id} brand={brand} ad={ad} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      <div className="split">
        <section className="panel run">
          <p className="mono muted">This week</p>
          <h2>Run the Winning Ads Report</h2>
          <p className="muted">
            Pulls new ads, takes the top 10 apart line by line, finds the patterns, and writes
            iteration ideas you can turn into scripts or briefs.
          </p>
          <form action={newReport} className="run-form">
            <input type="hidden" name="brand" value={brand} />
            <label>
              <span className="mono muted">Ideas</span>
              <input type="number" name="idea_count" min={1} max={50} defaultValue={10} />
            </label>
            <button type="submit" className="btn-primary">
              Run report
            </button>
          </form>
        </section>

        <section className="panel">
          <h2 className="panel-title">Latest</h2>
          {latest.length === 0 ? (
            <p className="empty">Nothing written yet.</p>
          ) : (
            <ul className="doc-list">
              {latest.map(({ kind, file }) => {
                const { date, ideas } = docLabel(file);
                return (
                  <li key={kind + file}>
                    <Link href={`/b/${brand}/${kind}/${file}`}>
                      <span className={`tag ${KIND[kind].tone}`}>{KIND[kind].label}</span>
                      <span>{date}</span>
                      <span className="muted">{ideas ? `ideas ${ideas}` : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {jobs.length > 0 && (
        <section className="block">
          <h2>Requests</h2>
          <ul className="jobs">
            {jobs.map((j) => (
              <li key={j.id}>
                <span className={`status ${j.status}`}>{j.status}</span>
                <span>
                  {JOB_LABEL[j.type]}
                  {j.ideas ? `, ideas ${j.ideas.join(", ")}` : ""}
                  {j.idea_count ? `, ${j.idea_count} ideas` : ""}
                </span>
                <span className="mono muted">{new Date(j.created_at).toLocaleString()}</span>
                {j.error ? <span className="error">{j.error}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <dt className="mono muted">{label}</dt>
      <dd>{n.toLocaleString()}</dd>
    </div>
  );
}
