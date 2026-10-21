import AdCard from "@/app/AdCard";
import ScoreKey from "@/app/ScoreKey";
import Grade from "@/app/Grade";
import Link from "next/link";
import { KINDS, kind, link, loadAds, posted, winners, type Kind } from "@/lib/ads";
import { campaignType } from "@/lib/brands";
import { explain } from "@/lib/score";

export const dynamic = "force-dynamic";

export default async function Winners({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { brand } = await params;
  const { type: picked } = await searchParams;
  const [allAds, type] = await Promise.all([loadAds(brand), campaignType(brand)]);
  const organic = type === "organic";
  const rising = picked === "rising";
  const only = KINDS.find((k) => k.key === picked)?.key as Kind | undefined;
  const counts = new Map<Kind, number>();
  for (const a of allAds) {
    const k = kind(a);
    if (k && !a.removed_from_library) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const risingCount = allAds.filter((a) => a.rising && !a.removed_from_library).length;
  const ads = rising
    ? allAds.filter((a) => a.rising)
    : only
      ? allAds.filter((a) => kind(a) === only)
      : allAds;
  const top = winners(ads, 10);
  const shown = new Set(top.map((a) => a.ad_id));
  const rest = ads
    .filter((a) => !shown.has(a.ad_id))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 40);

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">{organic ? "Winning posts" : "Winning ads"}</p>
        <h1 className="display">{organic ? "Winning posts" : "Winning ads"}</h1>
        <p className="lede">
          {organic
            ? "The posts that beat their account's usual views the most, ours and the niche's. Open one to watch it with its transcript and frames, and its diagnosis once it's been taken apart."
            : "The top ads by winner grade, videos and statics. Open one to watch it with its transcript and frames, and its diagnosis once it's been taken apart."}
        </p>
      </header>

      <ScoreKey organic={organic} />

      <nav className="tabs" aria-label="Sort by type">
        <Link href={`/b/${brand}/ads`} className={only || rising ? "" : "on"} scroll={false}>
          All
        </Link>
        {!organic && (
          <Link href={`/b/${brand}/ads?type=rising`} className={rising ? "on" : ""} scroll={false}>
            Rising <span className="mono">{risingCount}</span>
          </Link>
        )}
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={`/b/${brand}/ads?type=${k.key}`}
            className={only === k.key ? "on" : ""}
            scroll={false}
          >
            {k.label} <span className="mono">{counts.get(k.key) ?? 0}</span>
          </Link>
        ))}
      </nav>

      {rising ? (
        <p className="muted">
          New ads (under 30 days) that are still running and already beating how long their brand
          usually keeps an ad, or being scaled with 5+ versions. What&apos;s working right now.
        </p>
      ) : null}

      {only && top.length === 0 ? (
        <p className="muted">
          No {KINDS.find((k) => k.key === only)!.label} ads yet. Videos sort into UGC or B-roll once
          they&apos;ve been taken apart.
        </p>
      ) : null}

      <div className="ad-grid">
        {top.map((ad, i) => (
          <AdCard key={ad.ad_id} brand={brand} ad={ad} rank={i + 1} />
        ))}
      </div>

      <section className="block">
        <h2>Also tracked</h2>
        <p className="muted">The next {rest.length} by grade, without frames pulled yet.</p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Grade</th>
                <th>{organic ? "Account" : "Advertiser"}</th>
                <th>Why</th>
                <th>{organic ? "Posted" : "Format"}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rest.map((a) => (
                <tr key={a.ad_id}>
                  <td>
                    <Grade g={explain(a).grade} size="sm" />
                  </td>
                  <td>{a.brand}</td>
                  <td>
                    {explain(a).verdict}. <span className="muted">{explain(a).reason}</span>
                  </td>
                  <td className="mono muted">
                    {organic ? posted(a) : (KINDS.find((k) => k.key === kind(a))?.label ?? a.media_type)}
                  </td>
                  <td>
                    {a.removed_from_library ? (
                      <span className="tag ruby">Removed</span>
                    ) : link(a) ? (
                      <a href={link(a)!.href} target="_blank" rel="noreferrer" className="link-quiet">
                        {link(a)!.label === "the Ad Library" ? "Ad Library" : link(a)!.label} ↗
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
