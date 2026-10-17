import Link from "next/link";
import { newReport } from "@/app/actions";
import AdCard from "@/app/AdCard";
import CancelButton from "@/app/CancelButton";
import FormatPicker, { FORMAT_LABEL } from "@/app/FormatPicker";
import { docLabel } from "@/app/dates";
import { loadAds, stats, winners } from "@/lib/ads";
import { brandName, listDocs, setupState, type Kind } from "@/lib/brands";
import { listJobs, type Job } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const KIND: Record<Kind, { label: string; tone: string }> = {
  reports: { label: "Report", tone: "diamond" },
  scripts: { label: "Scripts", tone: "emerald" },
  briefs: { label: "Briefs", tone: "ruby" },
};
const JOB_LABEL = {
  report: "Winning Ads Report",
  scripts: "Scripts",
  briefs: "Creative briefs",
  setup: "Brand setup",
  research: "Research refresh",
};

export default async function Overview({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string; cancelled?: string }>;
}) {
  const { brand } = await params;
  const { queued, cancelled } = await searchParams;
  const kinds = Object.keys(KIND) as Kind[];
  const [setup, name, ads, jobs, ...docs] = await Promise.all([
    setupState(brand),
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

      {cancelled && (
        <p className="notice quiet">
          <span className="dot" aria-hidden="true" />
          Cancelled. If it was already running, it stops at its next step.
        </p>
      )}

      {!setup.ready && (
        <SetupSteps
          state={setup}
          brand={brand}
          job={jobs.find((j) => j.type === "setup" && ACTIVE.includes(j.status ?? ""))}
        />
      )}

      {s.total > 0 && (
        <>
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
        </>
      )}

      <div className="split">
        <section className="panel run">
          <p className="mono muted">This week</p>
          <h2>Run the Winning Ads Report</h2>
          <p className="muted">
            Pulls new ads, takes the top 10 apart (videos and statics), finds the patterns, and
            writes iteration ideas in the format you pick.
          </p>
          <form action={newReport} className="run-form">
            <input type="hidden" name="brand" value={brand} />
            <FormatPicker />
            <label>
              <span className="mono muted">Ideas</span>
              <input type="number" name="idea_count" min={1} max={50} defaultValue={10} />
            </label>
            <button type="submit" className="btn-primary" disabled={!setup.ready}>
              Run report
            </button>
          </form>
          {!setup.ready && <p className="mono muted">Available once setup is done</p>}
        </section>

        <section className="panel">
          <h2 className="panel-title">Latest</h2>
          {latest.length === 0 ? (
            <p className="empty">Nothing written yet.</p>
          ) : (
            <ul className="doc-list">
              {latest.map(({ kind, file }) => {
                const { date, ideas, format } = docLabel(file);
                return (
                  <li key={kind + file}>
                    <Link href={`/b/${brand}/${kind}/${file}`}>
                      <span className={`tag ${KIND[kind].tone}`}>{KIND[kind].label}</span>
                      <span>{date}</span>
                      <span className="muted">
                        {[ideas ? `ideas ${ideas}` : "", format].filter(Boolean).join(" · ")}
                      </span>
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
                  {j.format ? `, ${FORMAT_LABEL[j.format] ?? j.format}` : ""}
                </span>
                <span className="mono muted">{new Date(j.created_at).toLocaleString()}</span>
                {ACTIVE.includes(j.status ?? "") && j.status !== "cancelling" ? (
                  <CancelButton brand={brand} id={j.id} setup={j.type === "setup"} />
                ) : null}
                {j.error ? <span className="error">{j.error}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const STEPS: { key: "profile" | "competitors" | "voc" | "ads" | "brief"; label: string; how: string }[] = [
  { key: "profile", label: "Brand profile", how: "Researched from what you typed." },
  { key: "competitors", label: "Competitor map", how: "Direct, adjacent and relative rings." },
  { key: "voc", label: "Customer quotes", how: "Real reviews of every competitor app." },
  { key: "ads", label: "Competitor ads", how: "Pulled from the Ad Library and scored." },
  { key: "brief", label: "Research brief", how: "Your 4 research prompts, run on all of it." },
];

const ACTIVE = ["pending", "running", "waiting", "cancelling"];

function SetupSteps({
  state,
  brand,
  job,
}: {
  state: Record<string, boolean>;
  brand: string;
  job?: Job;
}) {
  return (
    <section className="panel setup">
      <div className="setup-head">
        <p className="mono muted">
          Getting set up{job ? ` · ${job.status === "pending" ? "in the queue" : job.status}` : ""}
        </p>
        {job && job.status !== "cancelling" && <CancelButton brand={brand} id={job.id} setup />}
      </div>
      <ol className="steps">
        {STEPS.map((step) => (
          <li key={step.key} className={state[step.key] ? "done" : ""}>
            <span className="step-mark" aria-hidden="true">{state[step.key] ? "✓" : ""}</span>
            <span>
              <strong>{step.label}</strong>
              <span className="muted">{state[step.key] ? "Done" : step.how}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
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
