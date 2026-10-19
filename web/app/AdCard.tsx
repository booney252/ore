import Link from "next/link";
import Grade from "@/app/Grade";
import { hook, posterUrl, type Ad } from "@/lib/ads";
import { explain } from "@/lib/score";

export default async function AdCard({ brand, ad, rank }: { brand: string; ad: Ad; rank?: number }) {
  const poster = await posterUrl(ad);
  const why = explain(ad);
  return (
    <Link href={`/b/${brand}/ads/${ad.ad_id}`} className="ad-card">
      <div className="ad-frame">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <div className="ad-frame-empty" />}
        {rank ? <span className="ad-rank mono">#{rank}</span> : null}
        {ad.media_type === "image" ? <span className="tag ad-kind">Static</span> : null}
        {ad.is_own ? <span className="tag emerald">Yours</span> : null}
        <div className="ad-over">
          <Grade g={why.grade} />
          <span className="verdict">{why.verdict}</span>
        </div>
      </div>
      <div className="ad-meta">
        <strong>
          {ad.brand}
          {!ad.breakdown ? <span className="pending-note"> · not taken apart yet</span> : null}
        </strong>
        <p className="why">{why.reason}</p>
        <p>“{hook(ad) || "No spoken hook"}”</p>
      </div>
    </Link>
  );
}
