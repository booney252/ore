import Link from "next/link";
import { brandName } from "@/lib/brands";
import { performance } from "@/lib/performance";
import { money, pct, x } from "@/lib/results";
import { oaUploadResults } from "../../actions";
import { Band } from "../../ui";

export const dynamic = "force-dynamic";

const POINTS = ["3s", "25%", "50%", "75%", "95%", "100%"];

/** A retention curve: everyone who watched 3 seconds = 100%, then how many are left at each point. */
function Curve({ ret, avg }: { ret: number[]; avg?: number[] | null }) {
  const pts = [1, ...ret];
  const W = 240, H = 70;
  const at = (v: number[], i: number) => `${(i / (POINTS.length - 1)) * W},${H - v[i] * (H - 6) - 3}`;
  const path = (v: number[]) => v.map((_, i) => at(v, i)).join(" ");
  const avgPts = avg && avg.length ? [1, ...avg] : null;
  return (
    <figure className="oa-curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Retention: ${ret.map((v, i) => `${POINTS[i + 1]} ${Math.round(v * 100)}%`).join(", ")}`}>
        {avgPts && <polyline points={path(avgPts)} className="avg" />}
        <polyline points={`0,${H} ${path(pts)} ${W},${H}`} className="fill" />
        <polyline points={path(pts)} className="line" />
      </svg>
      <figcaption>
        {POINTS.map((p, i) => (
          <span key={p}>{p}<b>{Math.round(pts[i] * 100)}%</b></span>
        ))}
      </figcaption>
    </figure>
  );
}

export default async function Performance({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, p] = await Promise.all([brandName(brand), performance(brand)]);
  const avgRet = p
    ? (() => {
        const c = p.ads.filter((a) => a.ret && a.ret.length === 5);
        return c.length ? [0, 1, 2, 3, 4].map((i) => c.reduce((s, a) => s + a.ret![i], 0) / c.length) : null;
      })()
    : null;
  return (
    <>
      <Band brand={brand} name={name} label="Performance" title={p ? `${x(p.all.roas)} ROAS across ${p.ads.length} Ore scripts.` : "See how every script does."} sub="Upload an Ads Manager export. Ore matches each ad to its script and creator, shows what's working, and writes the next briefs from it." />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <form action={oaUploadResults} className="oa-card oa-upload" id="results" encType="multipart/form-data">
            <input type="hidden" name="brand" value={brand} />
            <div>
              <h2>Upload an Ads Manager export</h2>
              <p className="oa-small oa-muted">
                1. When you launch an ad, put its Ore code in the ad name (each brief shows its code). 2. In Ads Manager, open the Ads tab, add the video columns (3-second plays, plays at 25/50/75/95/100%, ThruPlays), then Reports → Export table data → CSV. 3. Drop it here.
                {p ? ` Last upload ${new Date(p.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${p.period ? ` (${p.period})` : ""}.` : ""}
              </p>
              {q.results === "ok" && <p className="oa-small" style={{ color: "var(--oa-cobalt)", marginTop: 6 }}>Matched {q.matched} ad{q.matched === "1" ? "" : "s"} to scripts.{Number(q.other) ? ` ${q.other} ads had no Ore code in their name.` : ""}</p>}
              {q.results === "bad" && <p className="oa-small" style={{ color: "#c2410c", marginTop: 6 }}>That file has no "Ad name" column. Export from the Ads tab, at the ad level.</p>}
              {q.results === "empty" && <p className="oa-small" style={{ color: "#c2410c", marginTop: 6 }}>Pick a CSV file first.</p>}
              {q.results === "big" && <p className="oa-small" style={{ color: "#c2410c", marginTop: 6 }}>That file is over 8 MB. Export a shorter date range.</p>}
            </div>
            <div className="oa-upload-row">
              <input type="file" name="file" accept=".csv,text/csv" required />
              <button type="submit" className="oa-btn">Upload</button>
            </div>
          </form>

          {!p ? (
            <div className="oa-card oa-empty">No results yet. Once your first Ore scripts are live, upload an export and this fills in.</div>
          ) : (
            <>
              <div className="oa-kpis">
                <div className="oa-card"><b>{money(p.all.spend)}</b><span>spent on Ore scripts</span></div>
                <div className="oa-card"><b>{x(p.all.roas)}</b><span>ROAS</span></div>
                <div className="oa-card"><b>{money(p.all.cpa)}</b><span>cost per purchase</span></div>
                <div className="oa-card"><b>{pct(p.all.hook)}</b><span>hook rate (3s views)</span></div>
              </div>

              {p.findings.length > 0 && (
                <div className="oa-card oa-findings">
                  <h2>What the numbers say</h2>
                  <p className="oa-small oa-muted">Ore reads this before writing your next briefs.</p>
                  <ul>{p.findings.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              )}

              {p.byCreator.length > 1 && (
                <div className="oa-card">
                  <h2>By creator</h2>
                  <div className="oa-table">
                    <div className="h"><span>Creator</span><span>Ads</span><span>Spend</span><span>ROAS</span><span>CPA</span><span>Hook</span></div>
                    {p.byCreator.map((c) => (
                      <div key={c.creator}><b>{c.creator}</b><span>{c.ads}</span><span>{money(c.spend)}</span><span className={p.all.roas && c.roas ? (c.roas >= p.all.roas ? "up" : "down") : ""}>{x(c.roas)}</span><span>{money(c.cpa)}</span><span>{pct(c.hook)}</span></div>
                    ))}
                  </div>
                </div>
              )}

              <h2 className="oa-h2">Every script, best first</h2>
              <div className="oa-perf">
                {p.ads.map((a, i) => (
                  <article key={a.ad_name} className="oa-card oa-ad">
                    <div className="top">
                      <span className="rank">#{i + 1}</span>
                      <div>
                        <b>{a.title}</b>
                        <span className="oa-small oa-muted">{a.creator} · <code>{a.code}</code></span>
                      </div>
                    </div>
                    {a.opening && <q>{a.opening}</q>}
                    <div className="oa-stats">
                      <span><b>{x(a.roas)}</b>ROAS{p.all.roas && a.roas != null ? <i className={a.roas >= p.all.roas ? "up" : "down"}>{a.roas >= p.all.roas ? "above" : "below"} avg</i> : null}</span>
                      <span><b>{money(a.cpa)}</b>CPA</span>
                      <span><b>{pct(a.hook)}</b>hook</span>
                      <span><b>{money(a.spend)}</b>spent</span>
                    </div>
                    {a.ret && a.ret.length === 5 && (
                      <div className="oa-ret">
                        <span className="oa-small oa-muted">Retention after 3s{avgRet ? " (dotted: your average)" : ""}</span>
                        <Curve ret={a.ret} avg={avgRet} />
                      </div>
                    )}
                    <Link className="oa-small" href={`/app/${brand}/briefs/${a.kind}/${a.file}`}>Open the script →</Link>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
