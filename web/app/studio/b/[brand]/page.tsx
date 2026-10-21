import Link from "next/link";
import { notFound } from "next/navigation";
import { startSession } from "@/app/actions";
import SegmentPicker from "@/app/SegmentPicker";
import Grade from "@/app/Grade";
import { hook, posterUrl } from "@/lib/ads";
import { checkSlug } from "@/lib/brands";
import { explain } from "@/lib/score";
import { brainSnapshot, getMe, studioBrand } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function StudioBrandPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  try {
    checkSlug(brand);
  } catch {
    notFound();
  }
  const [b, brain, me] = await Promise.all([studioBrand(brand), brainSnapshot(brand), getMe()]);
  if (!b) notFound();
  const posters = await Promise.all(b.winners.slice(0, 8).map((a) => posterUrl(a)));

  return (
    <main className="home studio">
      <p className="crumbs mono">
        <Link href="/studio">Creator Studio</Link> / {b.name}
      </p>
      <section className="home-tag">
        <h1 className="display">{b.name}</h1>
        <p className="lede">{b.product}</p>
      </section>

      {brain.length > 0 && (
        <section className="block">
          <h2>Who buys it</h2>
          <p className="muted section-note">From the brand's research and real customer reviews, in their words.</p>
          <div className="brain-grid">
            {brain.map((s) => (
              <div key={s.title} className={`brain-cell panel${/rule/i.test(s.title) ? " rules" : ""}`}>
                <p className="mono muted">{s.title}</p>
                <ul>
                  {s.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <form action={startSession} className="block">
        <input type="hidden" name="brand" value={b.slug} />
        <h2>What's winning for {b.name}</h2>
        <p className="muted section-note">
          Pick one to build from, or let Ore pick the best fit for each angle.
        </p>
        <div className="win-pick">
          <label className="win-card ore-pick">
            <input type="radio" name="ad" value="" defaultChecked />
            <span className="win-poster ore-poster">
              <span className="display">Let Ore pick</span>
            </span>
            <span className="win-text muted">Ore uses all of them and picks per angle.</span>
          </label>
          {b.winners.slice(0, 8).map((a, i) => {
            const why = explain(a);
            return (
              <label key={a.ad_id} className="win-card">
                <input type="radio" name="ad" value={a.ad_id} />
                <span className="win-poster">
                  {posters[i] ? <img src={posters[i]!} alt="" /> : <span className="ad-frame-empty" />}
                  <span className="win-grade">
                    <Grade g={why.grade} size="sm" />
                    <span className="verdict">{why.verdict}</span>
                  </span>
                </span>
                <span className="win-text">
                  <strong>“{hook(a) || "No spoken hook"}”</strong>
                  <span className="muted">{why.reason}</span>
                  {typeof a.breakdown?.why_it_works === "string" ? (
                    <span className="win-why">{String(a.breakdown.why_it_works).slice(0, 180)}…</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        <div className="studio-go-row">
          <p className="muted">
            {me ? (
              <>
                Writing for <strong>{me.name}</strong>.{" "}
                <Link href="/studio/me" className="link-quiet">
                  Edit profile
                </Link>
              </>
            ) : (
              <Link href="/studio/me?first=1">Add your profile first →</Link>
            )}
          </p>
          <SegmentPicker brand={b.slug} />
          <button type="submit" className="btn-primary emerald studio-go" disabled={!me}>
            Find my angles
          </button>
        </div>
      </form>
    </main>
  );
}
