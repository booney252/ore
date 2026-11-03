import Link from "next/link";
import { notFound } from "next/navigation";
import { advertiser, hook, link, loadAds, posted, posterUrl } from "@/lib/ads";
import { brandName } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { listCreators } from "@/lib/creators";
import { explain } from "@/lib/score";
import { signedUrl } from "@/lib/storage";
import { oaBreakdown } from "../../../actions";
import MakeForm from "../../../MakeForm";
import SubmitButton from "../../../SubmitButton";
import { Band } from "../../../ui";

export const dynamic = "force-dynamic";

const FACTS: [string, string][] = [
  ["format", "Format"],
  ["angle", "Angle"],
  ["structure", "Structure"],
  ["hook_type", "Hook type"],
  ["speaker", "Who's talking"],
  ["setting", "Setting"],
  ["first_frame", "First frame"],
  ["offer", "Offer"],
  ["cta", "CTA"],
];

const text = (v: unknown): string =>
  v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.map(text).filter(Boolean).join(" · ") : typeof v === "object" ? Object.values(v as object).map(text).filter(Boolean).join(" · ") : String(v);

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : text(v) ? [text(v)] : []);

/** One winning ad: watch it, why it's graded the way it is, how it's built, and make it yours. */
export default async function AdDetail({ params }: { params: Promise<{ brand: string; id: string }> }) {
  const { brand, id } = await params;
  const [name, ads, creators, jobs] = await Promise.all([
    brandName(brand),
    loadAds(brand),
    listCreators(brand),
    listJobs(brand, 20, ["breakdown"]),
  ]);
  const ad = ads.find((a) => a.ad_id === id);
  if (!ad) notFound();
  const job = jobs.find((j) => j.ad === id);
  const working = Boolean(job && ["pending", "running", "waiting"].includes(job.status ?? ""));
  const failed = job?.status === "failed" ? job.error : null;
  const b = (ad.breakdown ?? {}) as Record<string, unknown>;
  const a = ad.analysis ?? {};
  const g = explain(ad);
  const where = link(ad);
  const [poster, video] = await Promise.all([
    posterUrl(ad),
    ad.media_type === "video" && ad.media_key ? signedUrl(ad.media_key) : Promise.resolve(null),
  ]);
  const opening = hook(ad) || ad.headline || "";
  const why = text(b.why_it_works ?? b.why_the_graphic_works ?? "");
  const loadBearing = list(b.load_bearing);
  const facts = FACTS.filter(([k]) => text(b[k]));
  const proof = [ad.top10_rank && `#${ad.top10_rank} in its top 10`, ad.days_running && `live ${ad.days_running} days`, ad.versions && ad.versions > 1 && `${ad.versions} versions`].filter(Boolean).join(", ");

  return (
    <>
      <Band brand={brand} name={name} label="Winning ad" title={advertiser(ad)} sub={opening ? `“${opening}”` : undefined} />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <Link href={`/app/${brand}/ads`} className="oa-small cp-back">← All winning ads</Link>
          <div className="wa-detail">
            <div className="oa-stack">
              <div className="oa-card wa-media">
                {video ? (
                  <video src={video} poster={poster ?? undefined} controls playsInline preload="metadata" />
                ) : poster ? (
                  <img src={poster} alt="" />
                ) : (
                  <p className="oa-small oa-muted">No media saved for this one.</p>
                )}
              </div>
              {where && (
                <a className="oa-small cp-back" href={where.href} target="_blank" rel="noreferrer">
                  See it on {where.label} ↗
                </a>
              )}
            </div>

            <div className="oa-stack">
              <section className="oa-card wa-gradecard">
                <div className="wa-gradehead">
                  <span className={`wa-grade big g${g.grade}`}>{g.grade}</span>
                  <div>
                    <b>{g.verdict}</b>
                    <p className="oa-small oa-muted">{g.meaning}</p>
                  </div>
                </div>
                <ul className="wa-parts">
                  {g.parts.map((p) => (
                    <li key={p.label}>
                      <span>{p.label}</span>
                      <b>{p.value}</b>
                      <em>{p.note}</em>
                    </li>
                  ))}
                </ul>
                {ad.whitelisted && ad.via_page_name && (
                  <p className="oa-small wa-via">
                    Run from <b>{ad.via_page_name}</b>&apos;s page: {ad.brand} pays to run it from the creator&apos;s account, a strong sign it works.
                  </p>
                )}
                {ad.start_date && <p className="oa-small oa-muted">Started {posted(ad)}{ad.is_active === false ? " · stopped" : " · still running"}</p>}
              </section>

              {(why || loadBearing.length > 0) && (
                <section className="oa-card wa-why">
                  <h2>Why it works</h2>
                  {why && <p>{why}</p>}
                  {loadBearing.length > 0 && (
                    <>
                      <h3>What&apos;s carrying it</h3>
                      <ul>{loadBearing.map((x) => <li key={x}>{x}</li>)}</ul>
                    </>
                  )}
                </section>
              )}

              {facts.length > 0 && (
                <section className="oa-card">
                  <h2 className="wa-h">How it&apos;s built</h2>
                  <dl className="wa-facts">
                    {facts.map(([k, label]) => (
                      <div key={k}>
                        <dt>{label}</dt>
                        <dd>{text(b[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {!ad.breakdown && (
                <section className="oa-card wa-takeapart">
                  {working ? (
                    <>
                      <p><span className="spin" aria-hidden="true" /> Ore is taking this one apart. It takes a minute or two.</p>
                      <a className="oa-small cp-back" href={`/app/${brand}/ads/${id}`}>Refresh</a>
                    </>
                  ) : (
                    <form action={oaBreakdown}>
                      <input type="hidden" name="brand" value={brand} />
                      <input type="hidden" name="ad" value={id} />
                      <p className="oa-small oa-muted">
                        {failed ? `That didn't work: ${failed}` : "Ore hasn't taken this one apart yet. See the hook, the structure and what's carrying it."}
                      </p>
                      <SubmitButton className="oa-btn ghost">Take it apart</SubmitButton>
                    </form>
                  )}
                </section>
              )}

              <section className="oa-card wa-make">
                <h2 className="wa-h">Make this for your brand</h2>
                <p className="oa-small oa-muted">Ore writes one script built on what makes this ad work. You review it once, then each creator gets their version.</p>
                <MakeForm
                  brand={brand}
                  creators={creators.map((c) => ({ id: c.id, name: c.name }))}
                  hidden={{ hook: opening, advertiser: ad.brand ?? "", why: why.slice(0, 700), proof }}
                />
              </section>

              {(a.transcript?.length ?? 0) > 0 && (
                <details className="oa-card wa-transcript">
                  <summary>Transcript</summary>
                  <ol>
                    {a.transcript!.map((l, i) => (
                      <li key={i}>
                        <span>{l.start.toFixed(0)}s</span>
                        {l.text}
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {ad.body && (
                <details className="oa-card wa-transcript">
                  <summary>Ad copy</summary>
                  <p className="wa-copy">{ad.body}</p>
                </details>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
