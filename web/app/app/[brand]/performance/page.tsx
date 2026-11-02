import Link from "next/link";
import { brandName } from "@/lib/brands";
import { performance, type AdView, type Finding } from "@/lib/performance";
import { money, pct, x } from "@/lib/results";
import { oaUploadResults } from "../../actions";
import { Band, initials } from "../../ui";

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

/** A KPI with a bar per ad (best first) and a line at the average. */
function Kpi({ value, label, sub, bars, avg, low }: { value: string; label: string; sub?: string; bars: number[]; avg?: number | null; low?: boolean }) {
  const max = Math.max(...bars, avg ?? 0) || 1;
  return (
    <div className="oa-card oa-kpi">
      <b>{value}</b>
      <span>{label}</span>
      <div className="oa-bars" aria-hidden>
        {bars.map((v, i) => (
          <i key={i} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} className={avg == null ? "" : (low ? v <= avg : v >= avg) ? "up" : "down"} />
        ))}
        {avg != null && <hr style={{ bottom: `${(avg / max) * 100}%` }} />}
      </div>
      {sub && <em>{sub}</em>}
    </div>
  );
}

const TAGS: Record<Finding["kind"], string> = {
  best: "Best script",
  worst: "Weakest script",
  creator: "Best creator",
  stops: "Stops the scroll, doesn't sell",
  hook: "Loses people in 3 seconds",
  retention: "Watch time",
};

function niceRange(period: string) {
  const f = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d);
  return period.split(" to ").map(f).join(" to ");
}

function avatarClass(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `oa-cav c${h % 5}`;
}

function vsAvg(v: number | null | undefined, avg: number | null | undefined) {
  if (v == null || !avg) return "";
  const d = Math.round((v / avg - 1) * 100);
  return `${d >= 0 ? "+" : ""}${d}% vs your average`;
}

function Byline({ ad }: { ad: AdView }) {
  return (
    <span className="oa-ins-by">
      <span className={avatarClass(ad.creatorId || ad.creator)}>{initials(ad.creator)}</span>
      {ad.creator} · <code>{ad.code}</code>
    </span>
  );
}

function Insight({ f, brand, avg, avgRet }: { f: Finding; brand: string; avg: { roas: number | null; hook: number | null }; avgRet: number[] | null }) {
  const href = f.ad ? `/app/${brand}/briefs/${f.ad.kind}/${f.ad.file}` : null;
  const tone = f.kind === "best" || f.kind === "creator" ? "good" : f.kind === "retention" ? "info" : "warn";
  if (f.kind === "creator" && f.creator) {
    return (
      <article className={`oa-card oa-ins ${tone}`}>
        <span className="oa-ilabel">{TAGS.creator}</span>
        <div className="oa-ins-creator">
          <span className={avatarClass(f.creator.id || f.creator.name)}>{initials(f.creator.name)}</span>
          <div><b>{f.creator.name}</b><span className="oa-small oa-muted">{f.creator.ads} ad{f.creator.ads === 1 ? "" : "s"} · {money(f.creator.spend)} spent</span></div>
        </div>
        <div className="oa-ins-metric"><b>{x(f.creator.roas)}</b><span>ROAS · {vsAvg(f.creator.roas, avg.roas)}</span></div>
        <p>Give {f.creator.name} more of the next briefs.</p>
        <Link className="oa-ins-link" href={`/app/${brand}/creators`}>See creators →</Link>
      </article>
    );
  }
  if (f.kind === "retention") {
    return (
      <article className={`oa-card oa-ins ${tone}`}>
        <span className="oa-ilabel">{TAGS.retention}</span>
        <div className="oa-ins-metric"><b>{pct(f.value ?? null)}</b><span>of people who watch 3 seconds are still there halfway</span></div>
        {avgRet && <Curve ret={avgRet} />}
      </article>
    );
  }
  const ad = f.ad!;
  const metric =
    f.kind === "hook" || f.kind === "stops"
      ? { v: pct(ad.hook), l: `hook rate · ${vsAvg(ad.hook, avg.hook)}` }
      : { v: x(ad.roas), l: `ROAS on ${money(ad.spend)} · ${vsAvg(ad.roas, avg.roas)}` };
  const advice =
    f.kind === "hook" ? "Test a new first line. Keep the rest." : f.kind === "stops" ? "Keep the opening. Fix the middle or the offer." : f.kind === "worst"
        ? ad.hook != null && avg.hook && ad.hook <= avg.hook * 0.75
          ? `Its hook rate is ${pct(ad.hook)} vs your ${pct(avg.hook)}, so people leave in the first 3 seconds. Test a new first line before you pause it.`
          : "Pause it, or rewrite the opening and test again."
        : null;
  return (
    <article className={`oa-card oa-ins ${tone}${f.kind === "best" ? " wide" : ""}`}>
      <span className="oa-ilabel">{TAGS[f.kind]}</span>
      <Link href={href!} className="oa-ins-title">{ad.title}</Link>
      <Byline ad={ad} />
      <div className={f.kind === "best" ? "oa-ins-split" : ""}>
        <div>
          <div className="oa-ins-metric"><b>{metric.v}</b><span>{metric.l}</span></div>
          {ad.opening && <q>{ad.opening}</q>}
          {advice && <p>{advice}</p>}
        </div>
        {f.kind === "best" && ad.ret && ad.ret.length === 5 && (
          <div>
            <span className="oa-small oa-muted">Retention after 3s (dotted: your average)</span>
            <Curve ret={ad.ret} avg={avgRet} />
          </div>
        )}
      </div>
      <Link className="oa-ins-link" href={href!}>Open the brief →</Link>
    </article>
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
          {p && (
            <>
              <div className="oa-kpis">
                <Kpi value={money(p.all.spend)} label="spent on Ore scripts" sub={`${p.ads.length} ads · ${p.byCreator.length} creator${p.byCreator.length === 1 ? "" : "s"}`} bars={p.ads.map((a) => a.spend)} />
                <Kpi value={x(p.all.roas)} label="ROAS" sub={p.ads[0]?.roas != null ? `Best ${x(p.ads[0].roas)}` : ""} bars={p.ads.map((a) => a.roas ?? 0)} avg={p.all.roas} />
                <Kpi value={money(p.all.cpa)} label="cost per purchase" sub={(() => { const b = [...p.ads].filter((a) => a.cpa != null).sort((a, b) => a.cpa! - b.cpa!)[0]; return b ? `Best ${money(b.cpa)}, ${b.creator}` : ""; })()} bars={p.ads.map((a) => a.cpa ?? 0)} avg={p.all.cpa} low />
                <Kpi value={pct(p.all.hook)} label="hook rate (watched 3s)" sub={(() => { const b = [...p.ads].filter((a) => a.hook != null).sort((a, b) => b.hook! - a.hook!)[0]; return b ? `Best ${pct(b.hook)}, ${b.creator}` : ""; })()} bars={p.ads.map((a) => a.hook ?? 0)} avg={p.all.hook} />
              </div>

              {p.findings.length > 0 && (
                <section>
                  <div className="oa-sechead">
                    <h2 className="oa-h2">What the numbers say</h2>
                    <span className="oa-small oa-muted">Ore reads this before writing your next briefs.</span>
                  </div>
                  <div className="oa-ins-grid">
                    {p.findings.map((f, i) => <Insight key={i} f={f} brand={brand} avg={p.all} avgRet={avgRet} />)}
                  </div>
                </section>
              )}
            </>
          )}

          <form action={oaUploadResults} className={`oa-card oa-upload${p ? " slim" : ""}`} id="results" encType="multipart/form-data">
            <input type="hidden" name="brand" value={brand} />
            <div>
              <h2>{p ? "Upload a newer export" : "Upload an Ads Manager export"}</h2>
              {p && <p className="oa-small oa-muted">Showing your export from {new Date(p.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{p.period ? `, covering ${niceRange(p.period)}` : ""}.</p>}
              {q.results === "ok" && <p className="oa-small" style={{ color: "var(--oa-cobalt)", marginTop: 6 }}>Matched {q.matched} ad{q.matched === "1" ? "" : "s"} to scripts.{Number(q.other) ? ` ${q.other} ads had no Ore code in their name.` : ""}</p>}
              {q.results === "bad" && <p className="oa-small" style={{ color: "#c2410c", marginTop: 6 }}>That file has no "Ad name" column. Export from the Ads tab, at the ad level.</p>}
              {q.results === "empty" && <p className="oa-small" style={{ color: "#c2410c", marginTop: 6 }}>Pick a CSV file first.</p>}
              {q.results === "big" && <p className="oa-small" style={{ color: "#c2410c", marginTop: 6 }}>That file is over 8 MB. Export a shorter date range.</p>}
            </div>
            <div className="oa-upload-row">
              <input type="file" name="file" accept=".csv,text/csv" required />
              <button type="submit" className="oa-btn">Upload</button>
            </div>
            <details className="oa-howto" open={!p}>
              <summary>How to export from Ads Manager</summary>
              <ol>
                <li><b>Name your ads with the code.</b> Every brief shows an Ore code like <code>ORE-JEN-GP2R-1</code>. Put it anywhere in the ad name.</li>
                <li><b>Add the video columns.</b> In the Ads tab: Columns → Customize → 3-second video plays, video plays at 25/50/75/95/100%, ThruPlays.</li>
                <li><b>Export and drop it here.</b> Reports → Export table data → CSV, at the ad level.</li>
              </ol>
            </details>
          </form>

          {!p && <div className="oa-card oa-empty">No results yet. Once your first Ore scripts are live, upload an export and this fills in.</div>}

          {p && (
            <>
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
