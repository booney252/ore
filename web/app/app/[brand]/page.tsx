import Link from "next/link";
import { hook, loadAds, posterUrl, winners, type Ad } from "@/lib/ads";
import { brandName, setupState } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { listJobs } from "@/lib/jobs";
import { oaFindBreakouts, oaMake } from "../actions";
import { Band, Working } from "../ui";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** New ads that broke into a top 10 lately first, then rising ads, then proven winners. */
function pick(ads: Ad[]): { ad: Ad; tag: string; cls: string }[] {
  const pool = ads.filter((a) => !a.is_own && !a.removed_from_library && a.source !== "organic");
  const since = Date.now() - 14 * DAY;
  const out: { ad: Ad; tag: string; cls: string }[] = [];
  const seen = new Set<string>();
  const add = (ad: Ad, tag: string, cls: string) => {
    if (seen.has(ad.ad_id) || out.length >= 6) return;
    seen.add(ad.ad_id);
    out.push({ ad, tag, cls });
  };
  pool
    .filter((a) => a.breakout && Date.parse(a.breakout) >= since)
    .sort((a, b) => (b.breakout ?? "").localeCompare(a.breakout ?? "") || (a.top10_rank ?? 99) - (b.top10_rank ?? 99))
    .forEach((a) => add(a, `New in top 10${a.top10_rank ? ` · #${a.top10_rank}` : ""}`, ""));
  pool.filter((a) => a.rising).forEach((a) => add(a, "Rising", "rise"));
  winners(pool, 1).forEach((a) => add(a, "Proven", "proven"));
  return out;
}

function why(ad: Ad): string {
  const b = ad.breakdown ?? {};
  const w = b.why_it_works ?? b.angle ?? "";
  return typeof w === "string" ? w : Array.isArray(w) ? w.join(" ") : "";
}

function proof(ad: Ad): string[] {
  const p: string[] = [];
  if (ad.top10_rank) p.push(`#${ad.top10_rank} in its top 10`);
  if (ad.days_running) p.push(`live ${ad.days_running} days`);
  if (ad.versions && ad.versions > 1) p.push(`${ad.versions} versions`);
  return p;
}

export default async function ThisWeek({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, ads, creators, jobs, state] = await Promise.all([
    brandName(brand),
    loadAds(brand),
    listCreators(brand),
    listJobs(brand, 10),
    setupState(brand),
  ]);
  const cards = pick(ads);
  const posters = await Promise.all(cards.map((c) => posterUrl(c.ad)));
  const advertisers = new Set(ads.filter((a) => !a.is_own).map((a) => a.brand)).size;
  const fresh = cards.filter((c) => c.cls === "").length;
  const busy = jobs.filter((j) => j.status === "pending" || j.status === "running");

  return (
    <>
      <Band
        brand={brand}
        name={name}
        label={`This week · ${name}`}
        title={fresh ? `${fresh} new ad${fresh === 1 ? "" : "s"} broke into your market's top 10s.` : "What's winning in your market."}
        chips={
          <>
            <span className="oa-gchip">{advertisers} advertisers watched</span>
            <span className="oa-gchip">{creators.length} creator{creators.length === 1 ? "" : "s"} on your roster</span>
          </>
        }
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          {(q.checking || busy.some((j) => j.type === "report" || j.type === "setup")) && <Working text="Ore is checking your market for new breakouts." />}
          {!state.ready && (
            <div className="oa-notice">
              Your brand brain is still being built. <Link href={`/app/${brand}/brand`} style={{ color: "var(--oa-cobalt)", fontWeight: 600 }}>See progress</Link>
            </div>
          )}
          <div className="oa-split">
            <div className="oa-grid3">
              {cards.length === 0 && (
                <div className="oa-card oa-empty" style={{ gridColumn: "1 / -1" }}>
                  No breakouts yet. Ore fills this in after the first check of your competitors.
                </div>
              )}
              {cards.map(({ ad, tag, cls }, i) => (
                <article key={ad.ad_id} className="oa-card oa-bo">
                  <div className="oa-thumb">
                    {posters[i] && <img src={posters[i]!} alt="" loading="lazy" />}
                    <span className={`oa-tag ${cls}`}>{tag}</span>
                  </div>
                  <span className="oa-small oa-muted">{ad.brand}</span>
                  <q>{hook(ad) || ad.headline || "Untitled ad"}</q>
                  {proof(ad).length > 0 && (
                    <div className="oa-proof">
                      {proof(ad).map((p) => (
                        <span key={p}>{p}</span>
                      ))}
                    </div>
                  )}
                  {why(ad) && (
                    <details className="oa-why">
                      <summary>Why it works</summary>
                      <p>{why(ad)}</p>
                    </details>
                  )}
                  <form action={oaMake} className="oa-make">
                    <input type="hidden" name="brand" value={brand} />
                    <input type="hidden" name="hook" value={hook(ad) || ad.headline || ""} />
                    <input type="hidden" name="advertiser" value={ad.brand} />
                    <input type="hidden" name="why" value={why(ad).slice(0, 700)} />
                    <input type="hidden" name="proof" value={proof(ad).join(", ")} />
                    {creators.length > 0 && (
                      <select name="creator" aria-label="Who's filming it" defaultValue="">
                        <option value="">Any creator</option>
                        {creators.map((c) => (
                          <option key={c.id} value={c.id}>
                            For {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="submit" className="oa-btn">Make this for my brand</button>
                  </form>
                </article>
              ))}
            </div>
            <aside className="oa-stack">
              <div className="oa-card">
                <h2>Your week</h2>
                <div style={{ marginTop: 8 }}>
                  <div className="oa-kv"><span>Writing now</span><b>{busy.filter((j) => j.type === "iterations" || j.type === "briefs").length}</b></div>
                  <div className="oa-kv"><span>Creators</span><b>{creators.length}</b></div>
                  <div className="oa-kv"><span>Advertisers watched</span><b>{advertisers}</b></div>
                </div>
              </div>
              {creators.length === 0 && (
                <div className="oa-card">
                  <h2>Add your creators</h2>
                  <p className="oa-small oa-muted" style={{ margin: "8px 0 12px" }}>Ore writes each brief in a creator's own voice once it knows who they are.</p>
                  <Link href={`/app/${brand}/creators`} className="oa-btn ghost">Add a creator</Link>
                </div>
              )}
              <form action={oaFindBreakouts} className="oa-card">
                <input type="hidden" name="brand" value={brand} />
                <h2>Check again</h2>
                <p className="oa-small oa-muted" style={{ margin: "8px 0 12px" }}>Pull your competitors' newest ads and find this week's breakouts.</p>
                <button type="submit" className="oa-btn ghost">Find new breakouts</button>
              </form>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
