import Link from "next/link";
import { brandName } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { ago, fmt, loadDaily, loadSales, salesBoard, slideUrls, type Board, type TPost } from "@/lib/tiktok";
import { oaLineup, oaTiktokRefresh } from "../../actions";
import SubmitButton from "../../SubmitButton";
import { Band, Working } from "../../ui";

export const dynamic = "force-dynamic";

const ANGLE: Record<string, string> = {
  him: "What he thinks",
  others: "Others notice",
  glowup: "Glow-up",
  shame: "Shame before",
  price: "Price / dupe",
  taboo: "Taboo",
  gift: "Gift",
  routine: "Routine",
  problem: "Problem to fix",
  other: "Other",
};

const age = (h: number) => (h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`);

function Post({ brand, p, img, own = false, sold = 0 }: { brand: string; p: TPost; img?: string; own?: boolean; sold?: number }) {
  const tone = own ? (p.views >= 3000 ? "hit" : p.age_h >= 48 && p.views < 500 ? "flop" : "") : "hit";
  return (
    <Link className="tt-post" href={`/app/${brand}/tiktok/${p.code}`}>
      <div className="tt-img">
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="oa-small oa-muted">No preview</span>}
        <span className={`tt-x ${tone}`}>{p.x}x</span>
      </div>
      <div className="tt-meta">
        <b>{fmt(p.views)}</b>
        <span className="oa-muted">
          {own ? "" : `@${p.handle} · `}
          {age(p.age_h)}
        </span>
      </div>
      {p.read?.hook && <q>{p.read.hook}</q>}
      {p.read?.product && (
        <div className="tt-product" title={p.kalo ? `${p.kalo.name}: ${p.kalo.why}` : "Not found on Kalodata"}>
          <span className={`tt-grade g${p.kalo?.grade ?? "none"}`}>{p.kalo?.grade ?? "?"}</span>
          <span>{p.read.product}</span>
        </div>
      )}
      {p.kalo && <span className="tt-why">{p.kalo.why}</span>}

      {sold > 0 && <span className="tt-sold">{sold} sold</span>}
      {p.read?.angle && (
        <div className="tt-chips">
          <span className="angle">{ANGLE[p.read.angle] ?? p.read.angle}</span>
        </div>
      )}
    </Link>
  );
}

function BoardTable({ title, rows, label }: { title: string; rows: Board[]; label: (n: string) => string }) {
  return (
    <section className="oa-card">
      <h2 className="wa-h">{title}</h2>
      {rows.length === 0 ? (
        <p className="oa-small oa-muted">Fills in once your posts are read.</p>
      ) : (
        <div className="tt-scroll"><table className="tt-table">
          <thead>
            <tr>
              <th>{title === "Your angles" ? "Angle" : "Product"}</th>
              <th>Posts</th>
              <th>Avg</th>
              <th>Best</th>
              <th>3K+</th>
              <th>Flops</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{label(r.name)}</td>
                <td>{r.posts}</td>
                <td>{fmt(r.avg)}</td>
                <td>{fmt(r.best)}</td>
                <td className={r.hits ? "good" : ""}>{r.hits}</td>
                <td className={r.flops ? "bad" : ""}>{r.flops}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

/** TikTok Shop daily: what's breaking out, your scoreboard, your product lineup, early alerts. */
export default async function TikTokPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const [name, d, jobs, sales] = await Promise.all([brandName(brand), loadDaily(brand), listJobs(brand, 5, ["tiktok"]), loadSales(brand)]);
  const selling = salesBoard(d?.own ?? [], sales);
  const working = jobs.some((j) => ["pending", "running"].includes(j.status ?? ""));
  const breaks = d?.breakouts ?? [];
  const own = (d?.own ?? []).slice(0, 48);
  const [bImg, oImg] = await Promise.all([slideUrls(breaks.slice(0, 30)), slideUrls(own)]);
  const unread = (d?.own ?? []).filter((p) => !p.read).length + breaks.filter((p) => !p.read).length;
  const tracked = Object.values(d?.accounts ?? {}).filter((a) => !a.own).length;

  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="TikTok Shop"
        title={d ? `${breaks.length} breakouts across ${tracked} accounts.` : "Not pulled yet."}
        sub={d ? `Updated ${ago(d.updated)}. A breakout is a post 1 to 7 days old doing 5x its account's usual and 3K+ views.` : "Pull every tracked account to see what's working."}
      >
        <form action={oaTiktokRefresh} className="tt-refresh">
          <input type="hidden" name="brand" value={brand} />
          <Link className="oa-btn white" href={`/app/${brand}/tiktok/slides`}>
            Today&apos;s slides
          </Link>{" "}
          <SubmitButton className="oa-btn white" working="Starting...">
            Refresh now
          </SubmitButton>
        </form>
      </Band>
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          {working && <Working text="Pulling every account and reading the new slides. Takes a few minutes." />}
          {d && unread > 0 && !working && (
            <p className="oa-small oa-muted">{unread} posts haven&apos;t been read yet (product, hook, angle). Refresh reads them.</p>
          )}

          {(d?.alerts.length ?? 0) > 0 && (
            <section className="oa-card tt-alerts">
              <h2 className="wa-h">Get in early</h2>
              <ul>
                {d!.alerts.map((a) => (
                  <li key={a.kind + a.name}>
                    <b>{a.name}</b> {a.kind === "product" ? "is breaking out" : "format is breaking out"} on {a.accounts.length} accounts:{" "}
                    <span className="oa-muted">{a.accounts.map((h) => "@" + h).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="oa-stack">
            <h2 className="wa-h">Breaking out now</h2>
            {breaks.length === 0 ? (
              <div className="oa-card oa-empty">No breakouts in the last 7 days.</div>
            ) : (
              <div className="tt-grid">
                {breaks.slice(0, 30).map((p) => (
                  <Post key={p.code} brand={brand} p={p} img={bImg[p.code]?.[0]} />
                ))}
              </div>
            )}
          </section>

          <section className="oa-stack">
            <h2 className="wa-h">Your posts</h2>
            <p className="oa-small oa-muted">
              Your usual: {fmt(Object.values(d?.accounts ?? {}).find((a) => a.own)?.usual ?? 0)} views. Green is 3K+, red is under 500 after 48 hours.
            </p>
            {own.length === 0 ? (
              <div className="oa-card oa-empty">No posts in the last 10 days.</div>
            ) : (
              <div className="tt-grid small">
                {own.map((p) => (
                  <Post key={p.code} brand={brand} p={p} img={oImg[p.code]?.[0]} own sold={sales[p.code]?.orders ?? 0} />
                ))}
              </div>
            )}
          </section>

          <section className="oa-card">
            <h2 className="wa-h">What sells</h2>
            <p className="oa-small oa-muted">Orders you logged on your posts, by product. Views don&apos;t pay; orders do. Log a post&apos;s orders on its page.</p>
            {selling.every((r) => !r.orders) ? (
              <p className="oa-small oa-muted">No orders logged yet.</p>
            ) : (
              <div className="tt-scroll"><table className="tt-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Orders</th>
                    <th>Per 1K views</th>
                    <th>Posts</th>
                    <th>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {selling.filter((r) => r.orders).map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="good">{r.orders}</td>
                      <td>{r.per1k}</td>
                      <td>{r.posts}</td>
                      <td>{fmt(r.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>

          <div className="tt-two">
            <BoardTable title="Your angles" rows={d?.angles ?? []} label={(n) => ANGLE[n] ?? n} />
            <BoardTable title="Your products" rows={d?.products ?? []} label={(n) => n} />
          </div>

          <section className="oa-card">
            <h2 className="wa-h">Product lineup</h2>
            <p className="oa-small oa-muted">
              Hot: 2+ posts over 3K, post it more. Cut: 15 posts and nothing over 1K. Add a product the day it shows up in &quot;Get in early&quot;.
            </p>
            <div className="tt-scroll"><table className="tt-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Kalodata</th>
                  <th>Posts</th>
                  <th>Best</th>
                  <th>Comm.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(d?.lineup ?? []).map((i) => (
                  <tr key={i.name}>
                    <td>
                      {i.name}
                      {i.note && <span className="oa-small oa-muted"> · {i.note}</span>}
                    </td>
                    <td>
                      <span className={`tt-status ${i.status}`}>{i.status}</span>
                    </td>
                    <td>
                      {i.kalo ? (
                        <span className="tt-kalo" title={i.kalo.name}>
                          <span className={`tt-grade g${i.kalo.grade}`}>{i.kalo.grade}</span> {i.kalo.why}
                        </span>
                      ) : (
                        <span className="oa-muted">not found</span>
                      )}
                    </td>
                    <td>{i.posts ?? 0}</td>
                    <td>{fmt(i.best ?? 0)}</td>
                    <td>{i.commission}</td>
                    <td>
                      <form action={oaLineup}>
                        <input type="hidden" name="brand" value={brand} />
                        <input type="hidden" name="remove" value={i.name} />
                        <button className="tt-remove" aria-label={`Remove ${i.name}`}>Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <form action={oaLineup} className="tt-add">
              <input type="hidden" name="brand" value={brand} />
              <input name="name" placeholder="Product name" required />
              <input name="commission" placeholder="Comm. %" />
              <input name="note" placeholder="Why (optional)" />
              <SubmitButton className="oa-btn">Add</SubmitButton>
            </form>
            <p className="oa-small oa-muted">Lineup changes show in the stats after the next refresh.</p>
          </section>
        </div>
      </main>
    </>
  );
}
