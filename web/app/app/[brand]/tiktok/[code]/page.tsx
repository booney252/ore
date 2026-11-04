import Link from "next/link";
import { notFound } from "next/navigation";
import { brandName } from "@/lib/brands";
import { ago, ANGLE_LABEL, fmt, loadDaily, sameProduct, slideUrls, type TPost } from "@/lib/tiktok";
import { oaLineup } from "../../../actions";
import SubmitButton from "../../../SubmitButton";
import { Band } from "../../../ui";

export const dynamic = "force-dynamic";

const age = (h: number) => (h < 24 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

function Mini({ brand, p, img }: { brand: string; p: TPost; img?: string }) {
  return (
    <Link className="tt-post" href={`/app/${brand}/tiktok/${p.code}`}>
      <div className="tt-img">
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="oa-small oa-muted">No preview</span>}
        <span className="tt-x hit">{p.x}x</span>
      </div>
      <div className="tt-meta">
        <b>{fmt(p.views)}</b>
        <span className="oa-muted">@{p.handle}</span>
      </div>
      {p.read?.hook && <q>{p.read.hook}</q>}
    </Link>
  );
}

/** One TikTok post: its slides, why it counts as a breakout, what it sells and how it's built. */
export default async function TikTokPost({ params }: { params: Promise<{ brand: string; code: string }> }) {
  const { brand, code } = await params;
  const [name, d] = await Promise.all([brandName(brand), loadDaily(brand)]);
  const all = [...(d?.breakouts ?? []), ...(d?.own ?? [])];
  const p = all.find((x) => x.code === code);
  if (!d || !p) notFound();
  const own = (d.own ?? []).some((x) => x.code === code);
  const acct = d.accounts[p.handle];
  const r = p.read;
  const sameProd = r?.product ? d.breakouts.filter((x) => x.code !== code && x.read?.product && sameProduct(x.read.product, r.product)) : [];
  const sameAngle = r?.angle ? d.breakouts.filter((x) => x.code !== code && x.read?.angle === r.angle && !sameProd.includes(x)).slice(0, 6) : [];
  const inLineup = r?.product ? d.lineup.some((i) => sameProduct(i.name, r.product)) : false;
  const [slides, rel] = await Promise.all([slideUrls([p], true), slideUrls([...sameProd, ...sameAngle].slice(0, 12))]);
  const verdict = own
    ? p.views >= 3000
      ? "A hit: 3K+ views."
      : p.age_h >= 48 && p.views < 500
        ? "A flop: under 500 after 48 hours."
        : "Still within its usual range."
    : `A breakout: ${p.x}x what @${p.handle} usually gets.`;

  return (
    <>
      <Band brand={brand} name={name} label={own ? "Your post" : `@${p.handle}`} title={r?.hook ? `“${r.hook}”` : "TikTok post"} sub={verdict} />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <Link href={`/app/${brand}/tiktok`} className="oa-small cp-back">
            ← Back to TikTok
          </Link>

          <div className="tt-detail">
            <section className="oa-card">
              <div className="tt-slides">
                {(slides[code] ?? []).map((u, i) => (
                  <figure key={u}>
                    <img src={u} alt={`Slide ${i + 1}`} />
                    <figcaption className="oa-small oa-muted">Slide {i + 1}</figcaption>
                  </figure>
                ))}
                {(slides[code] ?? []).length === 0 && <p className="oa-small oa-muted">No slides saved for this one.</p>}
              </div>
              <a className="oa-btn ghost" href={p.url} target="_blank" rel="noreferrer">
                Open on TikTok ↗
              </a>
            </section>

            <div className="oa-stack">
              <section className="oa-card">
                <h2 className="wa-h">The numbers</h2>
                <dl className="wa-facts">
                  <div>
                    <dt>Views</dt>
                    <dd>{p.views.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>vs usual</dt>
                    <dd>
                      {p.x}x (@{p.handle} usually gets {fmt(acct?.usual ?? 0)})
                    </dd>
                  </div>
                  <div>
                    <dt>Likes</dt>
                    <dd>{p.likes.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Comments</dt>
                    <dd>{p.comments.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Posted</dt>
                    <dd>{age(p.age_h)} ago (as of the pull {ago(d.updated)})</dd>
                  </div>
                  <div>
                    <dt>Shop post</dt>
                    <dd>{p.shoppable ? "Yes, a product is tagged" : "No product tagged"}</dd>
                  </div>
                </dl>
              </section>

              <section className="oa-card">
                <h2 className="wa-h">What it sells</h2>
                {r?.product ? (
                  <>
                    <div className="tt-product big">
                      <span className={`tt-grade g${p.kalo?.grade ?? "none"}`}>{p.kalo?.grade ?? "?"}</span>
                      <span>{r.product}</span>
                    </div>
                    {r.category && <p className="oa-small oa-muted">{r.category}</p>}
                    {p.kalo ? (
                      <p className="oa-small">
                        Kalodata: <b>{p.kalo.name}</b>. {p.kalo.why}.
                      </p>
                    ) : (
                      <p className="oa-small oa-muted">Not found on Kalodata.</p>
                    )}
                    {!own &&
                      (inLineup ? (
                        <p className="oa-small oa-muted">Already in your lineup.</p>
                      ) : (
                        <form action={oaLineup} className="tt-inline">
                          <input type="hidden" name="brand" value={brand} />
                          <input type="hidden" name="name" value={p.kalo?.name || r.product} />
                          <input type="hidden" name="note" value={`from @${p.handle}'s ${fmt(p.views)} post`} />
                          <SubmitButton className="oa-btn">Add to my lineup</SubmitButton>
                        </form>
                      ))}
                  </>
                ) : (
                  <p className="oa-small oa-muted">Not read yet.</p>
                )}
              </section>

              {r && (
                <section className="oa-card">
                  <h2 className="wa-h">How it&apos;s built</h2>
                  <dl className="wa-facts">
                    <div>
                      <dt>Hook (slide 1)</dt>
                      <dd>{r.hook || "None"}</dd>
                    </div>
                    <div>
                      <dt>Angle</dt>
                      <dd>
                        {ANGLE_LABEL[r.angle] ?? r.angle}
                        {d.angle_help?.[r.angle] && <span className="oa-muted">: {d.angle_help[r.angle]}</span>}
                      </dd>
                    </div>
                    <div>
                      <dt>Format</dt>
                      <dd>{r.format}</dd>
                    </div>
                  </dl>
                </section>
              )}
            </div>
          </div>

          {sameProd.length > 0 && (
            <section className="oa-stack">
              <h2 className="wa-h">Same product, other breakouts ({sameProd.length})</h2>
              <div className="tt-grid">
                {sameProd.slice(0, 12).map((x) => (
                  <Mini key={x.code} brand={brand} p={x} img={rel[x.code]?.[0]} />
                ))}
              </div>
            </section>
          )}
          {sameAngle.length > 0 && (
            <section className="oa-stack">
              <h2 className="wa-h">Same angle: {ANGLE_LABEL[r!.angle] ?? r!.angle}</h2>
              <div className="tt-grid">
                {sameAngle.map((x) => (
                  <Mini key={x.code} brand={brand} p={x} img={rel[x.code]?.[0]} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
