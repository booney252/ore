import Link from "next/link";
import { brandName } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { listJobs } from "@/lib/jobs";
import { hookOf, listMasters, stale } from "@/lib/masters";
import { oaAssign, oaSuggest } from "../../actions";
import { Band, initials, Working } from "../../ui";

export const dynamic = "force-dynamic";

/** Review each idea once; Ore makes every creator's version from it. */
export default async function Scripts({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, masters, creators, jobs] = await Promise.all([brandName(brand), listMasters(brand), listCreators(brand), listJobs(brand, 20)]);
  const busy = jobs.filter((j) => (j.status === "pending" || j.status === "running") && ["master", "revise", "versions", "assign"].includes(j.type));
  const toReview = masters.filter((m) => m.status === "draft").length;
  const waiting = masters.reduce((n, m) => n + Object.entries(m.versions).filter(([, v]) => v.status === "ready" && !stale(m, v)).length, 0);
  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="Scripts"
        title={masters.length ? (toReview ? `${toReview} idea${toReview === 1 ? "" : "s"} to review.` : waiting ? `${waiting} creator version${waiting === 1 ? "" : "s"} ready to send.` : "All caught up.") : "No scripts yet."}
        sub="Review each idea once. Ore makes every creator's version from it, changing only what makes it theirs."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          {(q.writing || q.suggesting || busy.length > 0) && (
            <Working text={busy.some((j) => j.type === "assign") || q.suggesting ? "Ore is matching creators to scripts." : busy.some((j) => j.type === "versions") ? "Ore is making creator versions." : "Ore is writing and checking the script."} />
          )}
          {masters.length === 0 ? (
            <div className="oa-card oa-empty">Pick a breakout on This week and tap "Make this for my brand". Ore writes one script you review, then a version for each creator.</div>
          ) : (
            <div className="ms-list">
              {masters.map((m) => {
                const vs = m.creators.map((c) => m.versions[c]);
                const sent = vs.filter((v) => v?.status === "approved" && !stale(m, v)).length;
                const ready = vs.filter((v) => v?.status === "ready" && !stale(m, v)).length;
                return (
                  <Link key={m.id} href={`/app/${brand}/scripts/${m.id}`} className="oa-card ms-item">
                    <span className={`cp-pill ${m.status === "approved" ? "done" : "filmed"}`}>{m.status === "approved" ? "Approved" : "To review"}</span>
                    <b>{m.title}</b>
                    {hookOf(m.md) && <q>{hookOf(m.md)}</q>}
                    <span className="oa-small oa-muted">
                      {m.creators.length} creator{m.creators.length === 1 ? "" : "s"}
                      {sent ? ` · ${sent} sent` : ""}
                      {ready ? ` · ${ready} ready for you` : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {masters.length > 0 && creators.length > 0 && (
            <section className="oa-card" id="grid">
              <div className="ms-gridhead">
                <div>
                  <h2>Who films what</h2>
                  <p className="oa-small oa-muted">Tick who films each script. Unticking someone takes their version out of their portal.</p>
                </div>
                <form action={oaSuggest}>
                  <input type="hidden" name="brand" value={brand} />
                  <button type="submit" className="oa-btn ghost">Let Ore suggest</button>
                </form>
              </div>
              {q.assigned && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Saved.</p>}
              <form action={oaAssign}>
                <input type="hidden" name="brand" value={brand} />
                <div className="ms-grid" style={{ gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${masters.length}, minmax(90px, 1fr))` }}>
                  <span />
                  {masters.map((m) => <span key={m.id} className="ms-col">{m.title}</span>)}
                  {creators.map((c, i) => (
                    <div key={c.id} className="ms-row" style={{ display: "contents" }}>
                      <span className="ms-who"><span className={`oa-cav c${i % 5}`}>{initials(c.name)}</span>{c.name.split(" ")[0]}<i>{masters.filter((m) => m.creators.includes(c.id)).length}</i></span>
                      {masters.map((m) => (
                        <label key={m.id} className="ms-cell">
                          <input type="checkbox" name="a" value={`${m.id}:${c.id}`} defaultChecked={m.creators.includes(c.id)} aria-label={`${c.name} films ${m.title}`} />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <button type="submit" className="oa-btn" style={{ marginTop: 14 }}>Save</button>
              </form>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
