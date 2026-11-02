import { headers } from "next/headers";
import { brandName } from "@/lib/brands";
import { ensureInvite, inviteUrl } from "@/lib/invites";
import { codeIndex, readResults, sum, money, x, pct } from "@/lib/results";
import CopyLink from "../../CopyLink";
import { CREATOR_FIELDS, listCreators } from "@/lib/creators";
import { oaPortal, oaRemoveCreator, oaSaveCreator } from "../../actions";
import { STATUSES, portalUrl, portalsFor, scriptsFor, statusesFor } from "@/lib/portal";
import { Band, initials } from "../../ui";

export const dynamic = "force-dynamic";

const SHOW: { key: "about" | "story" | "voice" | "can_claim"; label: string }[] = [
  { key: "about", label: "Who they are" },
  { key: "story", label: "Their story with your product" },
  { key: "voice", label: "How they talk" },
  { key: "can_claim", label: "What they can believably say" },
];

export default async function Creators({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, creators, token, hdrs, results, codes, portals, statuses] = await Promise.all([brandName(brand), listCreators(brand), ensureInvite(brand), headers(), readResults(brand), codeIndex(brand), portalsFor(brand), statusesFor(brand)]);
  const scripts = Object.fromEntries(await Promise.all(creators.map(async (c) => [c.id, await scriptsFor(brand, c.id)] as const)));
  const byCreator: Record<string, NonNullable<typeof results>["rows"]> = {};
  for (const r of results?.rows ?? []) {
    const id = codes[r.code]?.file.match(/-for-([a-z0-9-]+)/)?.[1];
    if (id) (byCreator[id] ??= []).push(r);
  }
  const all = sum(results?.rows ?? []);
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = inviteUrl(host, proto, token);
  const editing = q.edit ? creators.find((c) => c.id === q.edit) : undefined;
  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="Creators"
        title={creators.length ? `${creators.length} creator${creators.length === 1 ? "" : "s"} on your roster.` : "Add your first creator."}
        sub="Every brief is written for one creator: who they can believably play, their voice, where they film."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-split">
          <div className="oa-creators">
            {creators.length === 0 && <div className="oa-card oa-empty" style={{ gridColumn: "1 / -1" }}>No creators yet. Send them the invite link on the right, or add one yourself.</div>}
            {creators.map((c, i) => (
              <article key={c.id} id={`c-${c.id}`} className="oa-card oa-creator">
                <div className="oa-creator-top">
                  <span className={`oa-cav c${i % 5}`}>{initials(c.name)}</span>
                  <div>
                    <h3>{c.name}</h3>
                    <p className="oa-small oa-muted">{[c.handle, c.platforms].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                {byCreator[c.id] && (() => {
                  const s = sum(byCreator[c.id]);
                  return (
                    <div className="oa-stats">
                      <span><b>{s.ads}</b>ad{s.ads > 1 ? "s" : ""} live</span>
                      <span><b>{x(s.roas)}</b>ROAS{all.roas && s.roas ? <i className={s.roas >= all.roas ? "up" : "down"}>{s.roas >= all.roas ? "above" : "below"} avg</i> : null}</span>
                      <span><b>{money(s.cpa)}</b>CPA</span>
                      <span><b>{pct(s.hook)}</b>hook</span>
                    </div>
                  );
                })()}
                <div className="oa-dl">
                  {SHOW.filter((s) => c[s.key]).map((s) => (
                    <div key={s.key}>
                      <b>{s.label}</b>
                      {c[s.key]}
                    </div>
                  ))}
                </div>
                {(() => {
                  const list = scripts[c.id] ?? [];
                  const st = (k: string) => statuses[c.id]?.[k]?.status ?? "todo";
                  const p = portals[c.id];
                  return (
                    <div className="cp-admin">
                      <div className="cp-admin-head">
                        <b>Their portal</b>
                        <span className="oa-small oa-muted">{list.length ? `${list.filter((x) => st(x.key) === "done").length} of ${list.length} scripts done` : "No scripts written for them yet"}</span>
                      </div>
                      {list.length > 0 && (
                        <ul className="cp-admin-list">
                          {list.map((x) => {
                            const v = statuses[c.id]?.[x.key];
                            return (
                              <li key={x.key}>
                                <span className={`cp-pill ${st(x.key)}`}>{STATUSES.find((y) => y.key === st(x.key))?.label}</span>
                                <a href={`/app/${brand}/briefs/${x.kind}/${x.file}`}>{x.title}</a>
                                {v?.note && <span className="oa-small oa-muted cp-note">“{v.note}”</span>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {p ? (
                        <>
                          <CopyLink url={portalUrl(host, proto, p.token)} />
                          <div className="cp-pw">
                            <span className="oa-small oa-muted">Password</span>
                            <code>{p.password}</code>
                            <form action={oaPortal}>
                              <input type="hidden" name="brand" value={brand} />
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="reset" value="1" />
                              <button type="submit" className="oa-btn quiet">New password</button>
                            </form>
                          </div>
                        </>
                      ) : (
                        <form action={oaPortal}>
                          <input type="hidden" name="brand" value={brand} />
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="oa-btn ghost">Make their portal link</button>
                        </form>
                      )}
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <a className="oa-btn ghost" href={`/app/${brand}/creators?edit=${c.id}#creator-form`}>Edit</a>
                  <form action={oaRemoveCreator}>
                    <input type="hidden" name="brand" value={brand} />
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="oa-btn quiet">Remove</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
          <aside className="oa-stack oa-sticky">
          <div className="oa-card oa-invite">
            <h2>Invite your creators</h2>
            <p className="oa-small oa-muted">Send this link to every creator. They fill in their own profile in about 3 minutes, no account, and it shows up here.</p>
            <CopyLink url={link} />
          </div>
          <form action={oaSaveCreator} className="oa-card oa-form" id="creator-form">
            <input type="hidden" name="brand" value={brand} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <h2>{editing ? `Edit ${editing.name}` : "Or add one yourself"}</h2>
            {q.saved && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Saved.</p>}
            <label className="oa-field">
              <span>Name</span>
              <input id="cr-name" name="name" required defaultValue={editing?.name ?? ""} placeholder="Jenny" />
            </label>
            {CREATOR_FIELDS.filter((f) => ["handle", "about", "story", "voice", "can_claim", "avoid"].includes(f.key)).map((f) => (
              <label key={f.key} className="oa-field">
                <span>{f.label}</span>
                {f.long ? (
                  <textarea id={`cr-${f.key}`} name={f.key} rows={2} defaultValue={editing?.[f.key] ?? ""} placeholder={f.hint} />
                ) : (
                  <input id={`cr-${f.key}`} name={f.key} defaultValue={editing?.[f.key] ?? ""} placeholder={f.hint} />
                )}
              </label>
            ))}
            <button type="submit" className="oa-btn">{editing ? "Save changes" : "Add creator"}</button>
          </form>
          </aside>
        </div>
      </main>
    </>
  );
}
