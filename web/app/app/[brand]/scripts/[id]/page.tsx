import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { brandName } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { listJobs } from "@/lib/jobs";
import { STATUSES, statusesFor } from "@/lib/portal";
import { changedRows, getMaster, rows, stale, textHookOf } from "@/lib/masters";
import { oaAssignOne, oaMasterApprove, oaMasterEdit, oaMasterRevise, oaSuggestOne, oaVersionApprove, oaVersionsRemake } from "../../../actions";
import { Band, initials, Working } from "../../../ui";

export const dynamic = "force-dynamic";

/** One master script: review it once, then each creator's version shows only what changed. */
export default async function MasterPage({ params, searchParams }: { params: Promise<{ brand: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand, id } = await params;
  const q = await searchParams;
  const [name, m, creators, jobs, statuses] = await Promise.all([brandName(brand), getMaster(brand, id), listCreators(brand), listJobs(brand, 20), statusesFor(brand)]);
  if (!m) notFound();
  const mine = jobs.filter((j) => (j.status === "pending" || j.status === "running") && j.master === m.id);
  const revising = mine.some((j) => j.type === "revise");
  const making = mine.some((j) => j.type === "versions");
  const suggesting = mine.some((j) => j.type === "assign");
  const who = (cid: string) => creators.find((c) => c.id === cid);
  const ready = m.creators.filter((c) => m.versions[c]?.status === "ready" && !stale(m, m.versions[c]));
  const missing = m.creators.filter((c) => !m.versions[c] || stale(m, m.versions[c]));
  /** Where a creator is: their portal status once their version is sent. */
  const where = (cid: string) => {
    const v = m.versions[cid];
    if (!v || stale(m, v)) return { key: "", label: v ? "Out of date" : "Not made yet", note: "" };
    if (v.status !== "approved" || !v.file) return { key: "ready", label: "Ready for you", note: "" };
    const s = statuses[cid]?.[`iterations~${v.file}~1`];
    const key = s?.status ?? "todo";
    return { key, label: STATUSES.find((x) => x.key === key)?.label ?? "To film", note: s?.note ?? "", at: s?.updated_at };
  };
  const pillClass = (k: string) => (k === "done" ? "done" : k === "edited" ? "edited" : k === "filmed" ? "filmed" : "");
  return (
    <>
      <Band brand={brand} name={name} label="Script" title={m.title} sub={m.status === "approved" ? "Approved. Each creator's version is below." : "Review this once. Every creator's version is made from it."} />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <Link href={`/app/${brand}/scripts`} className="oa-small cp-back">← All scripts</Link>
          {(q.revising || revising) && <Working text="Ore is revising the script with your note. It updates here when it's done." />}
          <div className="cp-script">
            <div className="oa-stack">
              <article className="oa-card oa-doc">
                <Markdown text={m.md} />
              </article>
              {m.changes.length > 0 && (
                <div className="oa-card ms-fixed">
                  <h2>What Ore fixed before you saw it</h2>
                  <ul>{m.changes.map((c) => <li key={c}>{c.replace(/\*\*/g, "")}</li>)}</ul>
                </div>
              )}
              <details className="oa-card ms-edit">
                <summary>Edit the text yourself</summary>
                <form action={oaMasterEdit} className="oa-form">
                  <input type="hidden" name="brand" value={brand} />
                  <input type="hidden" name="id" value={m.id} />
                  <textarea name="md" rows={18} defaultValue={m.md} />
                  <button type="submit" className="oa-btn">Save</button>
                </form>
              </details>
            </div>
            <aside className="oa-stack oa-sticky">
              <div className="oa-card cp-side">
                <h2>{m.status === "approved" ? "Approved" : "Happy with it?"}</h2>
                <p className="oa-small oa-muted">
                  {m.creators.length
                    ? `${m.creators.length} creator${m.creators.length === 1 ? "" : "s"} film${m.creators.length === 1 ? "s" : ""} this.`
                    : "Pick who films it below."}
                </p>
                {m.creators.length > 0 && (m.status === "draft" || missing.length > 0) && (
                  <form action={oaMasterApprove}>
                    <input type="hidden" name="brand" value={brand} />
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="oa-btn" style={{ width: "100%" }}>
                      {m.status === "approved" ? `Make ${missing.length} creator version${missing.length === 1 ? "" : "s"}` : `Approve and make ${m.creators.length} version${m.creators.length === 1 ? "" : "s"}`}
                    </button>
                  </form>
                )}
                {q.saved && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Saved.</p>}
              </div>
              <div className="oa-card cp-side" id="who">
                <div className="ms-whohead">
                  <h2>Who films this</h2>
                  <form action={oaSuggestOne}>
                    <input type="hidden" name="brand" value={brand} />
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="oa-btn quiet">Let Ore suggest</button>
                  </form>
                </div>
                {(q.suggesting || suggesting) && <p className="oa-small oa-muted">Ore is picking who fits this script...</p>}
                <form action={oaAssignOne} className="ms-who-form">
                  <input type="hidden" name="brand" value={brand} />
                  <input type="hidden" name="id" value={m.id} />
                  <div className="ms-chips">
                    {creators.map((c) => (
                      <label key={c.id} className="oa-chip">
                        <input type="checkbox" name="c" value={c.id} defaultChecked={m.creators.includes(c.id)} /> {c.name.split(" ")[0]}
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="oa-btn ghost">Save</button>
                  {q.assigned && <span className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Saved.</span>}
                </form>
                <p className="oa-small oa-muted">Unticking someone takes their version out of their portal.</p>
              </div>
              <form action={oaMasterRevise} className="oa-card oa-form cp-side">
                <input type="hidden" name="brand" value={brand} />
                <input type="hidden" name="id" value={m.id} />
                <label className="oa-field">
                  <span>What would you change?</span>
                  <textarea name="note" rows={4} placeholder="The payoff is too short, dig deeper into the problem..." />
                </label>
                {q.empty && <p className="oa-small" style={{ color: "#c2410c" }}>Write a note first.</p>}
                <button type="submit" className="oa-btn">Revise it</button>
                <p className="oa-small oa-muted">Ore rewrites the script, remakes the creator versions from it, and remembers the note for next time.</p>
              </form>
            </aside>
          </div>

          <section id="versions" className="oa-stack">
            <div className="ms-gridhead">
              <div>
                <h2 className="oa-h2">Creator versions</h2>
                <p className="oa-small oa-muted">Only the lines that differ from the script above are shown. Everything else is word for word.</p>
              </div>
              {ready.length > 0 && (
                <form action={oaVersionApprove}>
                  <input type="hidden" name="brand" value={brand} />
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="oa-btn">{ready.length === 1 ? "Send it to their portal" : `Send all ${ready.length} to their portals`}</button>
                </form>
              )}
            </div>
            {m.creators.some((c) => m.versions[c]?.status === "approved") && (
              <div className="oa-card ms-where">
                <h3>Where everyone is</h3>
                <div className="ms-where-row">
                  {[...m.creators]
                    .sort((a, b) => ["done", "edited", "filmed", "todo", "ready", ""].indexOf(where(a).key) - ["done", "edited", "filmed", "todo", "ready", ""].indexOf(where(b).key))
                    .map((cid) => (
                      <span key={cid} className="ms-where-chip">
                        <b>{who(cid)?.name.split(" ")[0] ?? cid}</b>
                        <span className={`cp-pill ${pillClass(where(cid).key)}`}>{where(cid).label}</span>
                      </span>
                    ))}
                </div>
              </div>
            )}
            {(q.versions || making) && <Working text="Ore is making the creator versions." />}
            {q.sent && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Sent {q.sent} to the creator portal{q.sent === "1" ? "" : "s"}.</p>}
            <div className="ms-versions">
              {m.creators.map((cid, i) => {
                const c = who(cid);
                const v = m.versions[cid];
                const old = stale(m, v);
                const w = where(cid);
                const vr = v ? rows(v.md) : [];
                const diff = v ? changedRows(m.md, v.md) : [];
                return (
                  <article key={cid} className="oa-card ms-version">
                    <div className="ms-vhead">
                      <span className={`oa-cav c${i % 5}`}>{initials(c?.name ?? cid)}</span>
                      <b>{c?.name ?? cid}</b>
                      <span className={`cp-pill ${pillClass(w.key)}`}>{w.label}</span>
                    </div>
                    {w.note && <p className="ms-note">“{w.note}”</p>}
                    {v && (
                      <>
                        {v.changes.length > 0 && (
                          <details className="ms-whydetails">
                            <summary>Why these changes</summary>
                            <ul className="ms-why">{v.changes.map((x) => <li key={x}>{x.replace(/\*\*/g, "")}</li>)}</ul>
                          </details>
                        )}
                        <div className="ms-lines">
                          {textHookOf(v.md) && textHookOf(v.md) !== textHookOf(m.md) && (
                            <div className="ms-line">
                              <span>Text</span>
                              <p>{textHookOf(v.md)}</p>
                            </div>
                          )}
                          {vr.map((r, k) => (diff[k] ? (
                            <div key={k} className="ms-line">
                              <span>{r[0]}</span>
                              <p>{r[1]}</p>
                              {r[2] && <em>{r[2]}</em>}
                            </div>
                          ) : null))}
                          <p className="oa-small oa-muted">{vr.length - diff.filter(Boolean).length} of {vr.length} lines are the script above, word for word.</p>
                        </div>
                      </>
                    )}
                    <div className="ms-actions">
                      {v && !old && v.status === "ready" && (
                        <form action={oaVersionApprove}>
                          <input type="hidden" name="brand" value={brand} />
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="creator" value={cid} />
                          <button type="submit" className="oa-btn">Send to {c?.name.split(" ")[0] ?? cid}</button>
                        </form>
                      )}
                      {(m.status === "approved" || v) && (
                        <form action={oaVersionsRemake}>
                          <input type="hidden" name="brand" value={brand} />
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="creator" value={cid} />
                          <button type="submit" className="oa-btn quiet">{v ? "Remake" : "Make it"}</button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
