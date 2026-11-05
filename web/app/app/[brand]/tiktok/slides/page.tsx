import Link from "next/link";
import { brandName } from "@/lib/brands";
import { BUCKETS, loadSlideDay, signAll, slideDays } from "@/lib/slides";
import CopyText from "../../../CopyText";
import { Band } from "../../../ui";

export const dynamic = "force-dynamic";

const nice = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Today's slides: every post's images, ready to save and post from a phone, grouped by bucket. */
export default async function Slides({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<{ d?: string }> }) {
  const { brand } = await params;
  const { d } = await searchParams;
  const [name, day, days] = await Promise.all([brandName(brand), loadSlideDay(brand, d), slideDays(brand)]);
  const urls = day ? await signAll(day.posts.flatMap((p) => p.slides)) : {};

  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="TikTok Shop · Slides"
        title={day ? `${day.posts.length} posts for ${nice(day.date)}.` : "No slides yet."}
        sub="Tap and hold a slide to save it, in order. Then copy the caption and post."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <p className="oa-small">
            <Link href={`/app/${brand}/tiktok`}>← TikTok</Link>
            {days.length > 1 && (
              <>
                {" · "}
                {days.slice(0, 7).map((x, i) => (
                  <span key={x}>
                    {i > 0 && " · "}
                    {x === day?.date ? <b>{nice(x)}</b> : <Link href={`/app/${brand}/tiktok/slides?d=${x}`}>{nice(x)}</Link>}
                  </span>
                ))}
              </>
            )}
          </p>

          {day?.needs_photos?.length ? (
            <section className="oa-card">
              <h2 className="wa-h">Needs product photos</h2>
              <p className="oa-small oa-muted">These products came up but have no photos yet, so their posts were skipped: {day.needs_photos.join(", ")}.</p>
            </section>
          ) : null}

          {BUCKETS.map((b) => {
            const posts = (day?.posts ?? []).filter((p) => p.bucket === b.key);
            if (!posts.length) return null;
            return (
              <section key={b.key} className="oa-stack">
                <h2 className="wa-h">
                  {b.label} <span className="oa-muted oa-small">· {posts.length} · {b.help}</span>
                </h2>
                {posts.map((p) => (
                  <article key={p.id} className="oa-card sl-post">
                    <div className="sl-head">
                      <b>#{p.id}</b>
                      <q>{p.hook}</q>
                    </div>
                    <p className="oa-small oa-muted">
                      {p.product}
                      {p.source?.handle ? (
                        <>
                          {" · from "}
                          <Link href={`/app/${brand}/tiktok/${p.source.code}`}>@{p.source.handle}</Link>
                        </>
                      ) : null}
                    </p>
                    <div className="sl-row">
                      {p.slides.map((k, i) => (
                        <a key={k} href={urls[k]} target="_blank" rel="noopener" className="sl-img" aria-label={`Slide ${i + 1}`}>
                          <img src={urls[k]} alt={`Slide ${i + 1}`} loading="lazy" />
                          <span>{i + 1}</span>
                        </a>
                      ))}
                    </div>
                    {p.caption && (
                      <div className="sl-cap">
                        <p className="oa-small">{p.caption}</p>
                        <CopyText text={p.caption} />
                      </div>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
          {!day && <div className="oa-card oa-empty">No slides published yet.</div>}
        </div>
      </main>
    </>
  );
}
