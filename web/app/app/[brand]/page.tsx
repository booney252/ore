import Link from "next/link";
import { hook, loadAds, posterUrl, winners, type Ad } from "@/lib/ads";
import { brandName, setupState } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { cardIdea, readCards } from "@/lib/cards";
import { listJobs } from "@/lib/jobs";
import { oaFindBreakouts } from "../actions";
import MakeForm from "../MakeForm";
import { Band, Working } from "../ui";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** New ads that broke into a top 10 lately first, then rising ads, then proven winners. */
function pick(ads: Ad[]): { ad: Ad; tag: string; cls: string }[] {
  const pool = ads.filter((a) => !a.is_own && !a.removed_from_library && a.source !== "organic" && (hook(a) || a.headline));
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
  const [name, ads, creators, jobs, state, cards] = await Promise.all([
    brandName(brand),
    loadAds(brand),
    listCreators(brand),
    listJobs(brand, 10),
    setupState(brand),
    readCards(brand),
  ]);
  const winnersPicked = pick(ads);
  const byId = new Map(ads.map((a) => [a.ad_id, a]));
  const patterns = (cards?.patterns ?? []).map((c) => ({ c, ads: c.ranks.map((r) => byId.get(cards!.byRank[r] ?? "")).filter((a): a is Ad => !!a).slice(0, 4) }));
  const [posters, strips] = await Promise.all([
    Promise.all(winnersPicked.map((c) => posterUrl(c.ad))),
    Promise.all(patterns.map((p) => Promise.all(p.ads.map((a) => posterUrl(a))))),
  ]);
  const advertisers = new Set(ads.filter((a) => !a.is_own).map((a) => a.brand)).size;
  const busy = jobs.filter((j) => j.status === "pending" || j.status === "running");
  const who = creators.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <Band
        brand={brand}
        name={name}
        label={`This week · ${name}`}
        title={patterns.length ? `${patterns.length} things are working in your market.` : "What's winning in your market."}
        chips={
          <>
            <span className="oa-gchip">{advertisers} advertisers watched</span>
            <span className="oa-gchip">{creators.length} creator{creators.length === 1 ? "" : "s"} on your roster</span>
          </>
        }
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack" style={{ gap: 34 }}>
          {(q.checking || busy.some((j) => j.type === "report" || j.type === "setup")) && <Working text="Ore is checking your market for new breakouts." />}
          {busy.some((j) => j.type === "master" || j.type === "versions") && (
            <div className="oa-notice">
              Ore is writing your script now.{" "}
              <Link href={`/app/${brand}/scripts`} style={{ color: "var(--oa-cobalt)", fontWeight: 600 }}>Scripts</Link>
            </div>
          )}
          {!state.ready && (
            <div className="oa-notice">
              Your brand brain is still being built. <Link href={`/app/${brand}/brand`} style={{ color: "var(--oa-cobalt)", fontWeight: 600 }}>See progress</Link>
            </div>
          )}
          {creators.length === 0 && (
            <div className="oa-notice">
              Add your creators and Ore writes each brief in their own voice. <Link href={`/app/${brand}/creators`} style={{ color: "var(--oa-cobalt)", fontWeight: 600 }}>Add a creator</Link>
            </div>
          )}

          {patterns.length > 0 && (
            <section className="oa-sec">
              <header>
                <div>
                  <p className="oa-label">1 · The patterns</p>
                  <h2>What the winning ads have in common</h2>
                </div>
                <Link href={`/app/${brand}/report`} className="oa-more">See the full breakdown →</Link>
              </header>
              <div className="oa-grid3">
                {patterns.map(({ c, ads: ev }, i) => (
                  <article key={c.title} className="oa-card oa-pat">
                    <div className="oa-strip" aria-label={`${ev.length} winning ads show this`}>
                      {ev.map((a, j) => (
                        <span key={a.ad_id} title={`${a.brand}: ${hook(a) || a.headline || ""}`}>
                          {strips[i][j] && <img src={strips[i][j]!} alt="" loading="lazy" />}
                        </span>
                      ))}
                    </div>
                    <h3>{c.title}</h3>
                    <p className="oa-small oa-muted">{c.why}</p>
                    {c.example && <q className="oa-ex">{c.example}</q>}
                    <details className="oa-why">
                      <summary>The idea for you</summary>
                      <p>{c.idea}</p>
                    </details>
                    <MakeForm brand={brand} creators={who} hidden={{ idea: cardIdea(c, "pattern"), ranks: c.ranks.join(",") }} />
                  </article>
                ))}
              </div>
            </section>
          )}

          {(cards?.gaps.length ?? 0) > 0 && (
            <section className="oa-sec">
              <header>
                <div>
                  <p className="oa-label">2 · Open lanes</p>
                  <h2>What your buyers say that no ad is saying</h2>
                </div>
              </header>
              <div className="oa-grid2">
                {cards!.gaps.map((c) => (
                  <article key={c.title} className="oa-card oa-pat oa-gap">
                    <span className="oa-open">Nobody&apos;s saying this</span>
                    <h3>{c.title}</h3>
                    {c.example && <q className="oa-ex">{c.example}</q>}
                    <p className="oa-small oa-muted">{c.why}</p>
                    <details className="oa-why">
                      <summary>The idea for you</summary>
                      <p>{c.idea}</p>
                    </details>
                    <MakeForm brand={brand} creators={who} hidden={{ idea: cardIdea(c, "gap") }} />
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="oa-sec">
            <header>
              <div>
                <p className="oa-label">{cards ? "3 · " : ""}One ad to copy</p>
                <h2>New and rising winners</h2>
              </div>
              <form action={oaFindBreakouts}>
                <input type="hidden" name="brand" value={brand} />
                <button type="submit" className="oa-btn quiet">Check again</button>
              </form>
            </header>
            <div className="oa-grid3">
              {winnersPicked.length === 0 && (
                <div className="oa-card oa-empty" style={{ gridColumn: "1 / -1" }}>
                  No breakouts yet. Ore fills this in after the first check of your competitors.
                </div>
              )}
              {winnersPicked.map(({ ad, tag, cls }, i) => (
                <article key={ad.ad_id} className="oa-card oa-bo">
                  <div className="oa-thumb">
                    {posters[i] && <img src={posters[i]!} alt="" loading="lazy" />}
                    <span className={`oa-tag ${cls}`}>{tag}</span>
                  </div>
                  <span className="oa-small oa-muted">{ad.brand}</span>
                  <q>{hook(ad) || ad.headline}</q>
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
                  <MakeForm
                    brand={brand}
                    creators={who}
                    hidden={{ hook: hook(ad) || ad.headline || "", advertiser: ad.brand ?? "", why: why(ad).slice(0, 700), proof: proof(ad).join(", ") }}
                  />
                </article>
              ))}
            </div>
          </section>

          <section className="oa-sec" id="own">
            <header>
              <div>
                <p className="oa-label">Your own idea</p>
                <h2>Got something in mind?</h2>
              </div>
            </header>
            <div className="oa-card">
              <MakeForm brand={brand} creators={who} hidden={{}}>
                {q.empty && <p className="oa-small oa-muted">Write the idea first.</p>}
                <textarea name="idea" rows={3} required placeholder="Something you saw in the patterns above plus what you want to make. Ore writes it for each creator, using everything it knows about your market." />
              </MakeForm>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
