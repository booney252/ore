import { brandName, readResearch, setupState, vocCounts } from "@/lib/brands";
import { listCompetitors, RINGS } from "@/lib/competitors";
import { listJobs } from "@/lib/jobs";
import { readLessons, rules } from "@/lib/lessons";
import { readText } from "@/lib/storage";
import { oaAddCompetitor, oaRefreshResearch, oaRemoveCompetitor } from "../../actions";
import { Band, Working } from "../../ui";

export const dynamic = "force-dynamic";

const RING_LABEL: Record<string, string> = {
  direct: "Direct · same product, same buyer",
  adjacent: "Adjacent · different product, same problem",
  relative: "Nearby · same buyer, nearby problem",
};

function field(md: string, key: string): string {
  const m = md.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!m) return "";
  const v = m[1].replace(/\s+#.*$/, "").trim();
  try {
    return v.startsWith('"') ? JSON.parse(v) : v;
  } catch {
    return v.replace(/^"|"$/g, "");
  }
}

export default async function MyBrand({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, md, state, research, voc, competitors, lessons, jobs] = await Promise.all([
    brandName(brand),
    readText(`brands/${brand}/brand.md`),
    setupState(brand),
    readResearch(brand),
    vocCounts(brand),
    listCompetitors(brand),
    readLessons(brand),
    listJobs(brand, 10),
  ]);
  const product = field(md ?? "", "product");
  const audience = field(md ?? "", "audience");
  const brandRules = rules(lessons.brand);
  const busy = jobs.some((j) => (j.status === "pending" || j.status === "running") && (j.type === "setup" || j.type === "research"));
  const steps = [
    { b: "Competitor map", s: `${competitors.length} competitors`, done: state.competitors || state.organic },
    { b: "Customer research", s: voc ? `${voc.total.toLocaleString()} real quotes` : "Reading reviews and comments", done: state.voc },
    { b: "Winning ads", s: "Every competitor's top ads", done: state.ads },
    ...research.steps.map((st) => ({ b: st.label === "Competitors" ? "Competitor research" : st.label, s: st.date ? `Done ${st.date}` : "Waiting", done: Boolean(st.text) })),
    { b: "Research brief", s: "Your brand brain", done: state.brief },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);
  return (
    <>
      <Band brand={brand} name={name} label="My brand" title={`What Ore knows about ${name}.`} sub="Every brief reads this. Fix anything that's off, add competitors, and remove any rule you don't want." />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          {(q.started || busy) && <Working text="Ore is researching your market. This page fills in as each step finishes." />}
          <div className="oa-split">
            <div className="oa-stack">
              <div className="oa-card">
                <h2>What you sell</h2>
                <p style={{ marginTop: 8 }}>{product || "Not set yet."}</p>
                {audience && (
                  <>
                    <h2 style={{ marginTop: 18 }}>Who buys it</h2>
                    <p style={{ marginTop: 8 }}>{audience}</p>
                  </>
                )}
              </div>
              <div className="oa-card">
                <h2>Competitors Ore watches</h2>
                <div className="oa-stack" style={{ marginTop: 14 }}>
                  {RINGS.map((ring) => {
                    const list = competitors.filter((c) => (c.ring ?? "direct") === ring);
                    if (!list.length) return null;
                    return (
                      <div key={ring}>
                        <p className="oa-label" style={{ marginBottom: 8 }}>{RING_LABEL[ring]}</p>
                        <div className="oa-chips">
                          {list.map((c) => (
                            <form key={c.name} action={oaRemoveCompetitor} className={`oa-chip${c.source === "you" ? " mine" : ""}`}>
                              <input type="hidden" name="brand" value={brand} />
                              <input type="hidden" name="name" value={c.name} />
                              {c.name}
                              <button type="submit" aria-label={`Remove ${c.name}`}>×</button>
                            </form>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {competitors.length === 0 && <p className="oa-muted">Ore is still finding your competitors.</p>}
                </div>
                <form action={oaAddCompetitor} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                  <input type="hidden" name="brand" value={brand} />
                  <input id="comp-name" name="name" placeholder="Add a competitor" style={{ flex: "1 1 200px" }} />
                  <select id="comp-ring" name="ring" defaultValue="direct" style={{ flex: "0 1 180px" }}>
                    <option value="direct">Direct</option>
                    <option value="adjacent">Adjacent</option>
                    <option value="relative">Nearby</option>
                  </select>
                  <button type="submit" className="oa-btn ghost">Add</button>
                </form>
              </div>
              <div className="oa-card" id="rules">
                <h2>How Ore writes for you</h2>
                <p className="oa-small oa-muted" style={{ marginTop: 4 }}>Built from your notes on briefs. {brandRules.length} rules.</p>
                <div style={{ marginTop: 8 }}>
                  {brandRules.length === 0 && <p className="oa-muted" style={{ paddingTop: 8 }}>No rules yet. React to a line in any brief and Ore learns from it.</p>}
                  {brandRules.map((r) => (
                    <div key={r.index} className="oa-rule">
                      <span>{r.text.replace(/\*\*/g, "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <aside className="oa-stack">
              <div className="oa-card">
                <h2>Research</h2>
                <div className="oa-steps" style={{ marginTop: 14 }}>
                  {steps.map((s, i) => (
                    <div key={s.b} className={`oa-step ${s.done ? "done" : i === firstOpen && busy ? "now" : ""}`}>
                      <i aria-hidden="true" />
                      <div>
                        <b>{s.b}</b>
                        <span>{s.s}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <form action={oaRefreshResearch} style={{ marginTop: 16 }}>
                  <input type="hidden" name="brand" value={brand} />
                  <button type="submit" className="oa-btn ghost" disabled={busy}>Refresh research</button>
                </form>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
