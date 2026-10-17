import { hook, posterUrl, tier, type Ad } from "@/lib/ads";

/** A winner you can tick: its frame, rank, score and hook. Plain checkbox, works without JS. */
export default async function PickCard({ ad, rank, name }: { ad: Ad; rank: number; name: string }) {
  const poster = await posterUrl(ad);
  return (
    <label className="pick-card">
      <input type="checkbox" name={name} value={rank} />
      <span className="ad-frame">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <span className="ad-frame-empty" />}
        <span className="ad-rank mono">#{rank}</span>
        <span className="pick-tick" aria-hidden="true" />
        <span className="ad-over">
          <span className={`score-num ${tier(ad.score)}`}>{ad.score}</span>
          <span className="mono">{ad.media_type === "image" ? "static" : `${ad.days_running}d`}</span>
        </span>
      </span>
      <span className="ad-meta">
        <strong>{ad.brand}</strong>
        <span className="pick-hook">“{hook(ad) || "No spoken hook"}”</span>
      </span>
    </label>
  );
}
