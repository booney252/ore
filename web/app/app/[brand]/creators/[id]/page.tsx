import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { brandName } from "@/lib/brands";
import { CREATOR_FIELDS, listCreators } from "@/lib/creators";
import { listMasters } from "@/lib/masters";
import { performance } from "@/lib/performance";
import { STATUSES, portalUrl, portalsFor, scriptsFor, statusesFor } from "@/lib/portal";
import { briefCode, money, pct, scriptHref, sum, x } from "@/lib/results";
import CopyLink from "../../../CopyLink";
import { oaPortal, oaRemoveCreator, oaSaveCreator } from "../../../actions";
import { Band, initials } from "../../../ui";

export const dynamic = "force-dynamic";

const SHOW: { key: "about" | "story" | "voice" | "can_film" | "can_claim" | "avoid"; label: string }[] = [
  { key: "about", label: "Who they are" },
  { key: "story", label: "Their story with your product" },
  { key: "voice", label: "How they talk" },
  { key: "can_film", label: "Where they film" },
  { key: "can_claim", label: "What they can believably say" },
  { key: "avoid", label: "Avoid" },
];

/** One creator: profile on the side; their scripts, where each one is, and how their ads did. */
export default async function CreatorPage({ params, searchParams }: { params: Promise<{ brand: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand, id } = await params;
  const q = await searchParams;
  const [name, creators, masters, statuses, portals, scripts, perf, hdrs] = await Promise.all([
    brandName(brand), listCreators(brand), listMasters(brand), statusesFor(brand), portalsFor(brand), scriptsFor(brand, id), performance(brand), headers(),
  ]);
  const i = creators.findIndex((c) => c.id === id);
  const c = creators[i];
  if (!c) notFound();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const portal = portals[id];
  const mine = statuses[id] ?? {};

  // scripts in their portal, plus master scripts they're on that haven't been sent yet
  const rows = scripts.map((s) => {
    const mid = s.file.match(/-m-([a-z0-9-]+)-for-/)?.[1];
    const st = mine[s.key];
    return { key: s.key, title: s.title, href: scriptHref(brand, s.kind, s.file), code: briefCode(s.file, s.n), status: (st?.status ?? "todo") as string, note: st?.note ?? "", sent: true };
  });
  for (const m of masters) {
    if (m.creators.includes(id) && !(m.versions[id]?.status === "approved" && m.versions[id]?.file)) {
      rows.push({ key: m.id, title: m.title, href: `/app/${brand}/scripts/${m.id}`, code: "", status: "", note: "", sent: false });
    }
  }
  const order = ["", "todo", "filmed", "edited", "done"];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const done = rows.filter((r) => r.status === "done").length;

  const ads = perf?.ads.filter((a) => a.creatorId === id) ?? [];
  const s = sum(ads);
  const all = perf?.all;
  const label = (k: string) => STATUSES.find((x) => x.key === k)?.label ?? "To film";
  const pill = (k: string) => (k === "done" ? "done" : k === "edited" ? "edited" : k === "filmed" ? "filmed" : "");

  return (
    <>
      <Band brand={brand} name={name} label="Creator" title={c.name} sub={rows.length ? `${done} of ${rows.length} script${rows.length === 1 ? "" : "s"} done.` : "No scripts yet."} />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          <Link href={`/app/${brand}/creators`} className="oa-small cp-back">← All creators</Link>
          <div className="cr-layout">
            <aside className="oa-stack">
              <div className="oa-card cr-profile">
                <div className="cr-who">
                  <span className={`oa-cav c${i % 5}`}>{initials(c.name)}</span>
                  <div>
                    <b>{c.name}</b>
                    {(c.handle || c.platforms) && <span className="oa-small oa-muted">{[c.handle, c.platforms].filter(Boolean).join(" · ")}</span>}
                  </div>
                </div>
                <div className="oa-dl">
                  {SHOW.filter((f) => c[f.key]).map((f) => (
                    <div key={f.key}>
                      <b>{f.label}</b>
                      {c[f.key]}
                    </div>
                  ))}
                </div>
                {q.saved && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Saved.</p>}
                <details className="cr-edit">
                  <summary>Edit profile</summary>
                  <form action={oaSaveCreator} className="oa-form">
                    <input type="hidden" name="brand" value={brand} />
                    <input type="hidden" name="id" value={c.id} />
                    <label className="oa-field">
                      <span>Name</span>
                      <input name="name" required defaultValue={c.name} />
                    </label>
                    {CREATOR_FIELDS.map((f) => (
                      <label key={f.key} className="oa-field">
                        <span>{f.label}</span>
                        {f.long ? <textarea name={f.key} rows={3} defaultValue={c[f.key] ?? ""} placeholder={f.hint} /> : <input name={f.key} defaultValue={c[f.key] ?? ""} placeholder={f.hint} />}
                      </label>
                    ))}
                    <button type="submit" className="oa-btn">Save</button>
                  </form>
                </details>
              </div>
              <div className="oa-card cr-portal">
                <h2>Their portal</h2>
                {portal ? (
                  <>
                    <CopyLink url={portalUrl(host, proto, portal.token)} />
                    <div className="cp-pw">
                      <span className="oa-small oa-muted">Password</span>
                      <code>{portal.password}</code>
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
              <form action={oaRemoveCreator}>
                <input type="hidden" name="brand" value={brand} />
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="oa-btn quiet">Remove {c.name.split(" ")[0]} from the roster</button>
              </form>
            </aside>

            <div className="oa-stack">
              <section className="oa-card">
                <h2 className="cr-h">Scripts</h2>
                {rows.length === 0 ? (
                  <p className="oa-small oa-muted">Nothing assigned yet. Tick {c.name.split(" ")[0]} on a script's page to give them one.</p>
                ) : (
                  <ul className="cr-scripts">
                    {rows.map((r) => (
                      <li key={r.key}>
                        <Link href={r.href}>{r.title}</Link>
                        {r.code && <code className="cr-code" title="Put this in the ad name in Ads Manager">{r.code}</code>}
                        <span className={`cp-pill ${r.sent ? pill(r.status) : ""}`}>{r.sent ? label(r.status) : "Not sent yet"}</span>
                        {r.note && <p className="ms-note">“{r.note}”</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="oa-card">
                <h2 className="cr-h">Performance</h2>
                {ads.length === 0 ? (
                  <p className="oa-small oa-muted">
                    No ad results for {c.name.split(" ")[0]} yet. Once their videos run, upload your Ads Manager export on <Link href={`/app/${brand}/performance`}>Performance</Link>.
                  </p>
                ) : (
                  <>
                    <div className="oa-stats">
                      <span><b>{s.ads}</b>ad{s.ads === 1 ? "" : "s"} live</span>
                      <span><b>{x(s.roas)}</b>ROAS{all?.roas && s.roas ? <i className={s.roas >= all.roas ? "up" : "down"}>{s.roas >= all.roas ? "above" : "below"} avg</i> : null}</span>
                      <span><b>{money(s.cpa)}</b>CPA</span>
                      <span><b>{pct(s.hook)}</b>hook rate</span>
                    </div>
                    <ul className="cr-ads">
                      {ads.map((a) => (
                        <li key={a.ad_name}>
                          <div>
                            <b>{a.title}</b>
                            <span className="oa-small oa-muted"><code>{a.code}</code> · {money(a.spend)} spent</span>
                          </div>
                          <span>{x(a.roas)} <em>ROAS</em></span>
                          <span>{pct(a.hook)} <em>hook</em></span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
