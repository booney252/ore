import Link from "next/link";
import { notFound } from "next/navigation";
import { newReport } from "@/app/actions";
import Gem, { gemFor, type GemKind } from "@/app/Gem";
import { brandName, checkSlug, listDocs, type Kind } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const JOB_LABEL = { report: "Winning Ads Report", scripts: "Scripts", briefs: "Creative briefs" };

const STAGES: { kind: Kind; gem: GemKind; title: string; blurb: string }[] = [
  {
    kind: "reports",
    gem: "diamond",
    title: "Winning Ads Report",
    blurb:
      "Pulls the latest ads, finds the top 10 winners, breaks each one down line by line, spots the patterns, and writes iteration ideas.",
  },
  {
    kind: "scripts",
    gem: "emerald",
    title: "Scripts",
    blurb: "Open a report, pick the ideas you like, and get ready-to-shoot scripts.",
  },
  {
    kind: "briefs",
    gem: "ruby",
    title: "Creative briefs",
    blurb: "Pick ideas and get full creative strategy briefs for yourself or your creators.",
  },
];

export default async function Brand({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ queued?: string }>;
}) {
  const { brand } = await params;
  const { queued } = await searchParams;
  try {
    checkSlug(brand);
  } catch {
    notFound();
  }
  const [name, jobs, ...docs] = await Promise.all([
    brandName(brand),
    listJobs(brand),
    ...STAGES.map((s) => listDocs(brand, s.kind)),
  ]);

  return (
    <main>
      <p className="crumbs">
        <Link href="/">Brands</Link>
      </p>
      <div className="hero">
        <Gem kind={gemFor(brand)} size={64} />
        <div>
          <p className="eyebrow">Brand</p>
          <h1>{name}</h1>
        </div>
      </div>

      {queued && (
        <div className="notice">
          <Gem kind="emerald" size={22} />
          Queued. It runs on the worker and appears here when it's done.
        </div>
      )}

      {STAGES.map((stage, i) => (
        <section key={stage.kind} className="card stage" data-gem={stage.gem}>
          <Gem kind={stage.gem} size={44} />
          <div className="stage-head">
            <span className="stage-num">Step {i + 1}</span>
            <h2>{stage.title}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {stage.blurb}
            </p>
          </div>
          <div className="stage-body">
            {stage.kind === "reports" && (
              <form action={newReport} className="row">
                <input type="hidden" name="brand" value={brand} />
                <label>
                  <span className="label">How many ideas do you want?</span>
                  <input type="number" name="idea_count" min={1} max={50} defaultValue={10} />
                </label>
                <button type="submit">Run a new report</button>
              </form>
            )}
            <DocList brand={brand} kind={stage.kind} files={docs[i]} />
          </div>
        </section>
      ))}

      <section className="card">
        <h2 style={{ marginBottom: 14 }}>Recent requests</h2>
        {jobs.length === 0 ? (
          <p className="empty">Nothing requested yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>What</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{new Date(j.created_at).toLocaleString()}</td>
                    <td>
                      {JOB_LABEL[j.type]}
                      {j.ideas ? `: ideas ${j.ideas.join(", ")}` : ""}
                      {j.idea_count ? `: ${j.idea_count} ideas` : ""}
                    </td>
                    <td>
                      <span className={`pill ${j.status}`}>{j.status}</span>
                      {j.error ? <div className="error">{j.error}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function DocList({ brand, kind, files }: { brand: string; kind: Kind; files: string[] }) {
  if (files.length === 0) return <p className="empty">Nothing here yet.</p>;
  return (
    <ul className="docs">
      {files.map((f) => (
        <li key={f}>
          <Link href={kind === "reports" ? `/b/${brand}/reports/${f}` : `/b/${brand}/${kind}/${f}`}>
            {label(f)}
            <span aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "2026-10-17-ideas-1-4" -> "Oct 17, 2026 · ideas 1, 4" */
function label(file: string): string {
  const [, y, m, d, rest] = file.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/) ?? [];
  if (!y) return file;
  const date = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const ideas = rest.match(/^-ideas-(.+)$/)?.[1].split("-").join(", ");
  return ideas ? `${date} · ideas ${ideas}` : date;
}
