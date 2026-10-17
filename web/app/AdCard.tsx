import Link from "next/link";
import { hook, posterUrl, tier, type Ad } from "@/lib/ads";

export default async function AdCard({ brand, ad, rank }: { brand: string; ad: Ad; rank?: number }) {
  const poster = await posterUrl(ad);
  return (
    <Link href={`/b/${brand}/ads/${ad.ad_id}`} className="ad-card">
      <div className="ad-frame">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <div className="ad-frame-empty" />}
        {rank ? <span className="ad-rank mono">#{rank}</span> : null}
        {ad.is_own ? <span className="tag emerald">Yours</span> : null}
        <div className="ad-over">
          <span className={`score-num ${tier(ad.score)}`}>{ad.score}</span>
          <span className="mono">{ad.days_running}d · {ad.versions ?? 1}v</span>
        </div>
      </div>
      <div className="ad-meta">
        <strong>{ad.brand}</strong>
        <p>“{hook(ad) || "No spoken hook"}”</p>
      </div>
    </Link>
  );
}
