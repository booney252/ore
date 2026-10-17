import AdCard from "@/app/AdCard";
import { loadAds, tier, winners } from "@/lib/ads";

export const dynamic = "force-dynamic";

export default async function Winners({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const ads = await loadAds(brand);
  const top = winners(ads, 99);
  const shown = new Set(top.map((a) => a.ad_id));
  const rest = ads
    .filter((a) => !shown.has(a.ad_id))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 40);

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">Winning ads</p>
        <h1 className="display">Taken apart</h1>
        <p className="lede">
          Every ad we've broken down, best winner score first. Open one to watch it with its
          transcript, frames and diagnosis.
        </p>
      </header>

      <div className="ad-grid">
        {top.map((ad, i) => (
          <AdCard key={ad.ad_id} brand={brand} ad={ad} rank={i + 1} />
        ))}
      </div>

      <section className="block">
        <h2>Also tracked</h2>
        <p className="muted">The next {rest.length} by score, not broken down yet.</p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Score</th>
                <th>Advertiser</th>
                <th>Why</th>
                <th>Format</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rest.map((a) => (
                <tr key={a.ad_id}>
                  <td>
                    <span className={`score-num sm ${tier(a.score)}`}>{a.score}</span>
                  </td>
                  <td>{a.brand}</td>
                  <td className="muted">{a.score_why}</td>
                  <td className="mono muted">{a.media_type}</td>
                  <td>
                    {a.removed_from_library ? (
                      <span className="tag ruby">Removed</span>
                    ) : a.ad_library_url ? (
                      <a href={a.ad_library_url} target="_blank" rel="noreferrer" className="link-quiet">
                        Ad Library ↗
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
