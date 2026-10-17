import Link from "next/link";
import AdCard from "@/app/AdCard";
import CancelButton from "@/app/CancelButton";
import { loadAds, stats, winners } from "@/lib/ads";
import { brandName, setupState } from "@/lib/brands";
import { listJobs, type Job } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Overview({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string; cancelled?: string }>;
}) {
  const { brand } = await params;
  const { queued, cancelled } = await searchParams;
  const [setup, name, ads, setupJobs] = await Promise.all([
    setupState(brand),
    brandName(brand),
    loadAds(brand),
    listJobs(brand, 3, ["setup"]),
  ]);
  const s = stats(ads);
  const top = winners(ads, 2).slice(0, 5);

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
          job={setupJobs.find((j) => ["pending", "running", "waiting"].includes(j.status ?? ""))}
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
              <p className="empty">No ads with frames yet.</p>
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

function SetupSteps({ state, brand, job }: { state: Record<string, boolean>; brand: string; job?: Job }) {
  return (
    <section className="panel setup">
      <div className="setup-head">
        <p className="mono muted">
          Getting set up{job ? ` · ${job.status === "pending" ? "in the queue" : job.status}` : ""}
        </p>
        {job && <CancelButton brand={brand} id={job.id} setup back={`/b/${brand}`} />}
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
