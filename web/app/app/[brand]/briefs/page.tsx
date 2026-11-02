import Link from "next/link";
import { brandName, docTitles, listDocs } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { listJobs } from "@/lib/jobs";
import { codeIndex, readResults, sum, x, money } from "@/lib/results";
import { Band, Working } from "../../ui";

export const dynamic = "force-dynamic";

function when(file: string): string {
  const m = file.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

export default async function Briefs({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, its, briefs, jobs, creators, results, codes] = await Promise.all([brandName(brand), listDocs(brand, "iterations"), listDocs(brand, "briefs"), listJobs(brand, 10), listCreators(brand), readResults(brand), codeIndex(brand)]);
  const byFile: Record<string, NonNullable<typeof results>["rows"]> = {};
  for (const r of results?.rows ?? []) {
    const doc = codes[r.code];
    if (doc) (byFile[doc.file] ??= []).push(r);
  }
  const forName = (f: string) => creators.find((c) => c.id === f.match(/-for-([a-z0-9-]+)/)?.[1])?.name;
  const [itTitles, brTitles] = await Promise.all([docTitles(brand, "iterations", its.slice(0, 30)), docTitles(brand, "briefs", briefs.slice(0, 30))]);
  const docs = [
    ...its.slice(0, 30).map((f) => ({ kind: "iterations", file: f, titles: itTitles[f] ?? [], type: "Scripts" })),
    ...briefs.slice(0, 30).map((f) => ({ kind: "briefs", file: f, titles: brTitles[f] ?? [], type: "Creative brief" })),
  ].sort((a, b) => b.file.localeCompare(a.file));
  const writing = jobs.filter((j) => (j.status === "pending" || j.status === "running") && (j.type === "iterations" || j.type === "briefs"));
  return (
    <>
      <Band brand={brand} name={name} label="Briefs" title={docs.length ? "Ready to film." : "No briefs yet."} sub="Open one to read the script, react to any line, and send it to your creator." />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          {(q.writing || writing.length > 0) && <Working text={`Writing ${Math.max(writing.length, 1)} brief${writing.length > 1 ? "s" : ""}. It shows up here when it's done.`} />}
          <div className="oa-card">
            {docs.length === 0 ? (
              <p className="oa-empty">Pick a breakout on This week and tap "Make this for my brand".</p>
            ) : (
              <div className="oa-stack" style={{ gap: 10 }}>
                {docs.map((d) => (
                  <Link key={d.kind + d.file} href={`/app/${brand}/briefs/${d.kind}/${d.file}`} className="oa-row">
                    <span>
                      <b>{d.titles.slice(0, 3).join(" · ") || d.file}</b>
                      <span className="oa-small oa-muted">
                        {forName(d.file) ? `For ${forName(d.file)} · ` : ""}
                        {d.type} · {when(d.file)}
                        {d.titles.length > 3 ? ` · ${d.titles.length} scripts` : ""}
                      </span>
                      {byFile[d.file] && (() => { const s = sum(byFile[d.file]); return <span className="oa-res">{s.ads} ad{s.ads > 1 ? "s" : ""} live · {money(s.spend)} spent{s.roas != null ? ` · ${x(s.roas)} ROAS` : ""}</span>; })()}
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
