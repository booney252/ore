import Link from "next/link";
import { notFound } from "next/navigation";
import { newReport } from "@/app/actions";
import { KIND_LABEL, brandName, checkSlug, listDocs, type Kind } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const JOB_LABEL = { report: "Winning Ads Report", scripts: "Scripts", briefs: "Creative briefs" };

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
  const [name, reports, scripts, briefs, jobs] = await Promise.all([
    brandName(brand),
    listDocs(brand, "reports"),
    listDocs(brand, "scripts"),
    listDocs(brand, "briefs"),
    listJobs(brand),
  ]);
  const docs: [Kind, string[]][] = [
    ["scripts", scripts],
    ["briefs", briefs],
  ];

  return (
    <main>
      <p className="crumbs">
        <Link href="/">Brands</Link> /
      </p>
      <h1>{name}</h1>
      {queued && (
        <p className="notice">
          Queued. It runs on the worker and shows up here when it's done.
        </p>
      )}

      <section className="card">
        <h2>1. Winning Ads Report</h2>
        <p className="muted">
          Pulls the latest ads, finds the top 10 winners, breaks each one down line by line,
          finds the patterns, and writes iteration ideas.
        </p>
        <form action={newReport} className="row">
          <input type="hidden" name="brand" value={brand} />
          <label>
            How many ideas do you want?
            <input type="number" name="idea_count" min={1} max={50} defaultValue={10} />
          </label>
          <button type="submit">Run a new report</button>
        </form>
        <DocList brand={brand} kind="reports" files={reports} />
      </section>

      {docs.map(([kind, files], i) => (
        <section key={kind} className="card">
          <h2>
            {i + 2}. {KIND_LABEL[kind]}
          </h2>
          <p className="muted">
            Open a report, tick the ideas you like, and ask for{" "}
            {kind === "scripts" ? "scripts" : "full creative strategy briefs"}.
          </p>
          <DocList brand={brand} kind={kind} files={files} />
        </section>
      ))}

      <section className="card">
        <h2>Recent requests</h2>
        {jobs.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
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
                    {j.error ? <span className="error"> {j.error}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function DocList({ brand, kind, files }: { brand: string; kind: Kind; files: string[] }) {
  if (files.length === 0) return <p className="muted">Nothing yet.</p>;
  return (
    <ul className="list">
      {files.map((f) => (
        <li key={f}>
          <Link href={kind === "reports" ? `/b/${brand}/reports/${f}` : `/b/${brand}/${kind}/${f}`}>
            {f}
          </Link>
        </li>
      ))}
    </ul>
  );
}
