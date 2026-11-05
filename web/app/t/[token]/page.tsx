import "@/app/app/ore-app.css";
import { notFound } from "next/navigation";
import { Logo } from "@/app/app/ui";
import { signedUrl } from "@/lib/storage";
import { loadReport, type Card, type Report } from "@/lib/teardown";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your teardown · Ore", robots: { index: false } };

const short = (name: string) => name.split(/\s[-–:|]\s/)[0];
const fmtDate = (d?: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

function Head({ r, title, sub }: { r: Report; title: string; sub?: string }) {
  return (
    <header className="oa-band">
      <div className="oa-wrap">
        <nav className="oa-nav">
          <Logo href="/ore" />
        </nav>
        <div className="oa-title">
          <p className="oa-label">Free teardown · {r.app.name}</p>
          <h1>{title}</h1>
          {sub && <p className="oa-sub">{sub}</p>}
        </div>
      </div>
    </header>
  );
}

function AppCard({ r }: { r: Report }) {
  return (
    <div className="oa-card td-app">
      {r.app.icon && <img src={r.app.icon} alt="" width={64} height={64} />}
      <div>
        <b>{r.app.name}</b>
        <span className="oa-small oa-muted">
          {r.app.genre}
          {r.app.rating ? ` · ${r.app.rating.toFixed(1)}★ (${r.app.ratings.toLocaleString()} ratings)` : ""} · {r.app.seller}
        </span>
      </div>
    </div>
  );
}

function AdCard({ c, img }: { c: Card; img?: string }) {
  return (
    <article className="oa-card td-ad">
      <div className="td-frame">{img ? <img src={img} alt="" loading="lazy" /> : <span className="oa-small oa-muted">No preview</span>}</div>
      <div className="td-body">
        <p className="oa-small oa-muted">
          <b>{c.brand}</b>
          {c.via ? ` via ${c.via}` : ""} · {c.rank ? `#${c.rank} in their top 10` : "in their top 10"}
          {c.days != null ? ` · live ${c.days} day${c.days === 1 ? "" : "s"}` : ""}
          {c.found ? ` · found ${fmtDate(c.found)}` : ""}
        </p>
        {c.hook && <q className="td-hook">{c.hook}</q>}
        {c.why ? (
          <>
            <h3>Why it works</h3>
            <p>{c.why}</p>
            {c.elements.length > 0 && (
              <ul className="td-els">
                {c.elements.map((e) => (
                  <li key={e.element}>
                    <b>{e.element}.</b> {e.what}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="oa-small oa-muted">Not taken apart yet.</p>
        )}
        {c.library && (
          <a className="oa-small" href={c.library} target="_blank" rel="noopener">
            See it in the Ad Library →
          </a>
        )}
      </div>
    </article>
  );
}

function More({ r }: { r: Report }) {
  const done = Boolean(r.creators);
  return (
    <section id="creators" className="oa-card td-more">
      <h2 className="wa-h">{done ? "Your creators" : "Want a script for each of your creators?"}</h2>
      {done ? (
        <p className="oa-small oa-muted">
          {r.scripts?.length ? "Their scripts are below." : r.status === "ready" ? "Writing their scripts now. Refresh in a few minutes." : "Their scripts come with your report."}
        </p>
      ) : (
        <form action="/api/teardown/more" method="post" className="oa-form">
          <input type="hidden" name="token" value={r.token} />
          <fieldset className="td-count">
            <legend>How many creators do you work with?</legend>
            {["0", "1-10", "10+"].map((n) => (
              <label key={n}>
                <input type="radio" name="count" value={n} defaultChecked={r.creator_count === n} /> {n === "0" ? "None yet" : n}
              </label>
            ))}
          </fieldset>
          <label className="oa-field">
            <span>Up to 3 of them, a line each: who they are and what they post</span>
            <textarea name="creators" rows={4} maxLength={2000} placeholder={"Jenny, 52, ER nurse, talks to camera in her car\nJohn, bartender, funny skits"} />
          </label>
          <button className="oa-btn" type="submit">Write their scripts</button>
        </form>
      )}
    </section>
  );
}

/** A free teardown: the app's competitors, their newest top-10 ads broken down, and scripts. */
export default async function Teardown({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await loadReport(token);
  if (!r) notFound();

  if (r.status !== "ready") {
    const msg: Record<string, [string, string]> = {
      confirm: ["Check your email.", `We sent a link to ${r.email.replace(/^(.).*(@.*)$/, "$1…$2")}. Click it and your teardown starts.`],
      waitlist: ["You're on tomorrow's list.", "Today's teardowns are full. Yours starts first thing tomorrow, and we'll email you when it's ready."],
      queued: ["Your teardown is building.", "Finding your closest competitors, reading their top 10 ads and taking the new ones apart. Usually 10 to 20 minutes."],
      building: ["Your teardown is building.", "Finding your closest competitors, reading their top 10 ads and taking the new ones apart. Usually 10 to 20 minutes."],
      paused: ["We're catching up.", "A lot of teardowns came in at once. Yours is saved and we'll email you when it's ready."],
    };
    const [title, sub] = msg[r.status] ?? msg.queued;
    return (
      <div className="oa">
        {(r.status === "queued" || r.status === "building") && <meta httpEquiv="refresh" content="30" />}
        <Head r={r} title={title} sub={sub} />
        <main className="oa-main">
          <div className="oa-wrap oa-stack" style={{ maxWidth: 900 }}>
            <AppCard r={r} />
            {r.status !== "confirm" && <More r={r} />}
          </div>
        </main>
      </div>
    );
  }

  const cards = [...(r.new ?? []), ...(r.breakouts ?? [])];
  const keys = cards.map((c) => c.frame).filter(Boolean) as string[];
  const urls = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await signedUrl(k)] as const)));
  const watching = (r.tracking_until ?? "") >= new Date().toISOString().slice(0, 10);

  return (
    <div className="oa">
      <Head
        r={r}
        title={`What's winning against ${short(r.app.name)} right now.`}
        sub={`We read the top 10 Meta ads of ${r.competitors?.length ?? 0} of your closest competitors and took apart the newest ones: the ads they just started putting money behind.`}
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack" style={{ maxWidth: 900 }}>
          <AppCard r={r} />
          {r.competitors?.length ? (
            <p className="oa-small oa-muted">
              Watching: {r.competitors.map((c) => c.name).join(", ")}.
              {watching ? ` We'll keep reading their top 10s every day until ${fmtDate(r.tracking_until)} and email you when a new ad breaks in.` : ""}
            </p>
          ) : null}

          {r.new?.length ? <h2 className="wa-h">New since your report</h2> : null}
          {r.new?.map((c) => <AdCard key={"n" + c.ad_id} c={c} img={c.frame ? urls[c.frame] : undefined} />)}

          <h2 className="wa-h">The newest ads in their top 10s</h2>
          {r.breakouts?.length ? (
            r.breakouts.map((c) => <AdCard key={c.ad_id} c={c} img={c.frame ? urls[c.frame] : undefined} />)
          ) : (
            <div className="oa-card oa-empty">None of your competitors has a new ad in its top 10 right now. We&apos;ll email you the day one breaks in.</div>
          )}

          {r.scripts?.length ? (
            <>
              <h2 className="wa-h">Scripts for your creators</h2>
              {r.scripts.map((s) => (
                <article key={s.creator} className="oa-card td-script">
                  <p className="oa-small oa-muted">
                    For <b>{s.creator}</b> · built on {s.based_on}&apos;s breakout
                  </p>
                  <q className="td-hook">{s.hook}</q>
                  {s.text_hook && <p className="oa-small">On screen: {s.text_hook}</p>}
                  <div className="tt-scroll">
                    <table className="tt-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>They say</th>
                          <th>On screen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.lines.map((l, i) => (
                          <tr key={i}>
                            <td>{l.t}</td>
                            <td>{l.say}</td>
                            <td className="oa-muted">{l.show}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {s.why && <p className="oa-small oa-muted">{s.why}</p>}
                </article>
              ))}
            </>
          ) : (
            <More r={r} />
          )}

          <section className="oa-card td-cta">
            <h2>Get this every week, for every creator.</h2>
            <p>Ore watches your competitors every day, writes one script from what&apos;s winning, and turns it into a version for each creator once you approve it.</p>
            <a className="oa-btn" href="/ore#pricing">See plans</a>
          </section>
        </div>
      </main>
    </div>
  );
}
