import Link from "next/link";
import { advertiser, hook, KINDS, kind, loadAds, posterUrl, winners, type Ad } from "@/lib/ads";
import { brandName } from "@/lib/brands";
import { explain } from "@/lib/score";
import { Band } from "../../ui";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const PAGE = 24;

const inTop10 = (a: Ad) => Boolean(a.top10_rank) || (Boolean(a.breakout) && Date.now() - Date.parse(a.breakout!) <= 14 * DAY);

const FILTERS: { key: string; label: string; test: (a: Ad) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "top10", label: "Top 10", test: inTop10 },
  { key: "creators", label: "Via creators", test: (a) => Boolean(a.whitelisted) },
  { key: "rising", label: "Rising", test: (a) => Boolean(a.rising) },
  ...KINDS.map((k) => ({ key: k.key as string, label: k.label as string, test: (a: Ad) => kind(a) === k.key })),
];

/** The tag in the corner of a card: why this ad is worth a look right now. */
function tag(a: Ad): { text: string; cls: string } | null {
  if (a.breakout && Date.now() - Date.parse(a.breakout) <= 14 * DAY) return { text: `New in top 10${a.top10_rank ? ` · #${a.top10_rank}` : ""}`, cls: "" };
  if (a.top10_rank) return { text: `Top 10 · #${a.top10_rank}`, cls: "" };
  if (a.rising) return { text: "Rising", cls: "rise" };
  if (a.whitelisted) return { text: "Via creator", cls: "proven" };
  return null;
}

/** Every competitor ad Ore has graded, best first, with filters. */
export default async function WinningAds({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, all] = await Promise.all([brandName(brand), loadAds(brand)]);
  const pool = winners(all.filter((a) => !a.is_own), 1000);
  const f = FILTERS.find((x) => x.key === q.f) ?? FILTERS[0];
  const counts = Object.fromEntries(FILTERS.map((x) => [x.key, pool.filter(x.test).length]));
  let list = pool.filter(f.test);
  if (f.key === "top10") list = [...list].sort((a, b) => (b.breakout ?? "").localeCompare(a.breakout ?? "") || (a.top10_rank ?? 99) - (b.top10_rank ?? 99));
  const shown = list.slice(0, Math.max(PAGE, Number(q.n) || PAGE));
  const posters = await Promise.all(shown.map((a) => posterUrl(a)));
  const href = (key: string, n?: number) => `/app/${brand}/ads?${new URLSearchParams({ ...(key !== "all" && { f: key }), ...(n && { n: String(n) }) })}`;

  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="Winning ads"
        title={pool.length ? `${pool.length} competitor ads, best first.` : "No ads yet."}
        sub="Graded by how long brands keep paying for them. Tap one to watch it and see why it works."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <nav className="wa-filters" aria-label="Filter ads">
            {FILTERS.filter((x) => x.key === "all" || counts[x.key] > 0).map((x) => (
              <Link key={x.key} href={href(x.key)} className={x.key === f.key ? "on" : ""} scroll={false}>
                {x.label} <span>{counts[x.key]}</span>
              </Link>
            ))}
          </nav>
          {shown.length === 0 ? (
            <div className="oa-card oa-empty">No ads here yet. Ore adds them as it pulls your competitors.</div>
          ) : (
            <div className="wa-grid">
              {shown.map((a, i) => {
                const g = explain(a);
                const t = tag(a);
                return (
                  <Link key={a.ad_id} href={`/app/${brand}/ads/${a.ad_id}`} className="oa-card wa-card">
                    <div className="oa-thumb">
                      {posters[i] && <img src={posters[i]!} alt="" loading="lazy" />}
                      {t && <span className={`oa-tag ${t.cls}`}>{t.text}</span>}
                      <span className={`wa-grade g${g.grade}`} title={g.verdict}>{g.grade}</span>
                    </div>
                    <span className="oa-small oa-muted">{advertiser(a)}</span>
                    {(hook(a) || a.headline) && <q>{hook(a) || a.headline}</q>}
                    <span className="wa-meta">
                      {g.verdict}
                      {a.days_running ? ` · ${a.days_running} days live` : ""}
                      {a.versions && a.versions > 1 ? ` · ${a.versions} versions` : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {list.length > shown.length && (
            <Link href={href(f.key, shown.length + PAGE)} className="oa-btn ghost wa-more" scroll={false}>
              Show more ({list.length - shown.length} left)
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
