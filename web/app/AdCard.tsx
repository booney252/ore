import Link from "next/link";
import Grade from "@/app/Grade";
import { hook, posted, posterUrl, type Ad } from "@/lib/ads";
import { commentRate, explain, pct, short } from "@/lib/score";

export default async function AdCard({ brand, ad, rank }: { brand: string; ad: Ad; rank?: number }) {
  const poster = await posterUrl(ad);
  const why = explain(ad);
  return (
    <Link href={`/b/${brand}/ads/${ad.ad_id}`} className="ad-card">
      <div className="ad-frame">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <div className="ad-frame-empty" />}
        {rank ? <span className="ad-rank mono">#{rank}</span> : null}
        {ad.media_type === "image" ? <span className="tag ad-kind">Static</span> : ad.media_type === "slideshow" ? <span className="tag ad-kind">Slideshow</span> : null}
        {ad.shoppable ? <span className="tag ad-kind">TikTok Shop</span> : null}
        {ad.breakout ? (
          <span className="tag ad-top" title={`Broke into ${ad.brand}'s top 10 most-shown ads on ${ad.breakout}`}>
            Broke into top 10
          </span>
        ) : ad.top10_rank ? (
          <span className="tag ad-top" title={`${ad.brand}'s #${ad.top10_rank} most-shown ad today`}>
            Top 10 · #{ad.top10_rank}
          </span>
        ) : null}
        {ad.is_own ? <span className="tag emerald">{ad.source === "organic" ? "Ours" : "Yours"}</span> : null}
        <div className="ad-over">
          <Grade g={why.grade} />
          <span className="verdict">{why.verdict}</span>
        </div>
      </div>
      <div className="ad-meta">
        <strong>
          {ad.source === "organic" ? `${ad.brand} · ${ad.platform === "tiktok" ? "TikTok" : ad.platform === "youtube" ? "YouTube" : "IG"}` : ad.brand}
          {!ad.breakdown ? <span className="pending-note"> · not taken apart yet</span> : null}
        </strong>
        {ad.source === "organic" ? (
          <div className="organic-stats">
            <span>{short(ad.views ?? 0)} views</span>
            <span title="views vs the account's usual">{((ad.views ?? 0) / Math.max(1, ad.usual_views ?? 1)).toFixed(1)}x usual</span>
            <span title={`${(ad.comments ?? 0).toLocaleString("en-US")} comments`}>{pct(commentRate(ad))} comments</span>
            <span>Posted {posted(ad)}</span>
          </div>
        ) : null}
        {ad.source === "organic" ? null : <p className="why">{why.reason}</p>}
        <p>“{hook(ad) || "No spoken hook"}”</p>
      </div>
    </Link>
  );
}
