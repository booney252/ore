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
  searchParams: Promise<{ type?: string; shop?: string }>;
}) {
  const { brand } = await params;
  const { type: picked, shop: shopPick } = await searchParams;
  const [allAds, type] = await Promise.all([loadAds(brand), campaignType(brand)]);
  const organic = type === "organic";
  const rising = picked === "rising";
  const top10 = picked === "top10";
  const only = KINDS.find((k) => k.key === picked)?.key as Kind | undefined;
  const counts = new Map<Kind, number>();
  for (const a of allAds) {
    const k = kind(a);
    if (k && !a.removed_from_library) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const risingCount = allAds.filter((a) => a.rising && !a.removed_from_library).length;
  // In an advertiser's top 10 most-shown ads today, or broke into one in the last 2 weeks
  const recentBreak = (a: (typeof allAds)[number]) =>
    Boolean(a.breakout) && Date.now() - Date.parse(a.breakout!) <= 14 * 864e5;
  const inTop10 = (a: (typeof allAds)[number]) => Boolean(a.top10_rank) || recentBreak(a);
  const tracking = allAds.some((a) => a.top10_days);
  const top10Count = allAds.filter(inTop10).length;
  // TikTok Shop posts (a product tagged) vs everything else, on top of the type filter
  const shop = shopPick === "yes" || shopPick === "no" ? shopPick : undefined;
  const hasShop = allAds.some((a) => a.shoppable);
  const shopCount = allAds.filter((a) => a.shoppable).length;
  const byType = top10
    ? allAds.filter(inTop10)
    : rising
    ? allAds.filter((a) => a.rising)
    : only
      ? allAds.filter((a) => kind(a) === only)
      : allAds;
  const ads = shop ? byType.filter((a) => Boolean(a.shoppable) === (shop === "yes")) : byType;
  const href = (t?: string, s?: string) => {
    const q = new URLSearchParams();
    if (t) q.set("type", t);
    if (s) q.set("shop", s);
    const qs = q.toString();
    return `/b/${brand}/ads${qs ? `?${qs}` : ""}`;
  };
  // Top 10 view: the newest breakouts first, then the rest by their spot in their brand's top 10.
  const top = top10
    ? [...ads].sort(
        (a, b) =>
          Number(recentBreak(b)) - Number(recentBreak(a)) ||
          (b.breakout ?? "").localeCompare(a.breakout ?? "") ||
          (a.top10_rank ?? 99) - (b.top10_rank ?? 99),
      )
    : winners(ads, 10);
  const shown = new Set(top.map((a) => a.ad_id));
  const rest = (top10 ? [] : ads)
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
        <Link href={href(undefined, shop)} className={only || rising || top10 ? "" : "on"} scroll={false}>
          All
        </Link>
        {!organic && tracking && (
          <Link href={href("top10", shop)} className={top10 ? "on" : ""} scroll={false}>
            Top 10 <span className="mono">{top10Count}</span>
          </Link>
        )}
        {!organic && (
          <Link href={href("rising", shop)} className={rising ? "on" : ""} scroll={false}>
            Rising <span className="mono">{risingCount}</span>
          </Link>
        )}
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={href(k.key, shop)}
            className={only === k.key ? "on" : ""}
            scroll={false}
          >
            {k.label} <span className="mono">{counts.get(k.key) ?? 0}</span>
          </Link>
        ))}
      </nav>

      {hasShop && (
        <nav className="tabs" aria-label="TikTok Shop or not">
          <Link href={href(picked)} className={shop ? "" : "on"} scroll={false}>
            Shop and non-shop
          </Link>
          <Link href={href(picked, "yes")} className={shop === "yes" ? "on" : ""} scroll={false}>
            TikTok Shop <span className="mono">{shopCount}</span>
          </Link>
          <Link href={href(picked, "no")} className={shop === "no" ? "on" : ""} scroll={false}>
            Not shop <span className="mono">{allAds.length - shopCount}</span>
          </Link>
        </nav>
      )}

      {top10 ? (
        <p className="muted">
          Each brand&apos;s 10 most-shown ads, checked every day. Brands leave old ads running for
          months, so the signal is a new one breaking in: a brand putting real money behind it.
          Breakouts from the last 2 weeks come first.
        </p>
      ) : null}

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

      {!top10 && (
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
      )}
    </main>
  );
}
