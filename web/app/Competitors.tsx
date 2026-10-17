import { addCompetitorAction } from "./actions";
import RemoveCompetitor from "./RemoveCompetitor";
import { RINGS, type Competitor } from "@/lib/competitors";

const RING_INFO = {
  direct: { label: "Direct", note: "Same product, same buyer", tone: "ruby" },
  adjacent: { label: "Adjacent", note: "Different product, same problem", tone: "diamond" },
  relative: { label: "Relative", note: "Same buyer, nearby problem", tone: "emerald" },
} as const;

function adsState(c: Competitor): { label: string; cls: string } {
  if (c.fb_page_id === "none") return { label: "No Meta ads found", cls: "none" };
  if (c.fb_page_id) return { label: `Ads pulled from ${c.fb_page_name ?? "its page"}`, cls: "found" };
  return { label: "Ads pulled on the next report", cls: "next" };
}

/** The 3-ring competitor map with an Add form. Lives on the Overview. */
export default function Competitors({
  brand,
  competitors,
  notice,
}: {
  brand: string;
  competitors: Competitor[];
  notice?: { kind: string; name?: string };
}) {
  return (
    <section className="block" id="competitors">
      <div className="block-head">
        <h2>Competitors</h2>
        <span className="mono muted">
          {RINGS.map((r) => `${competitors.filter((c) => c.ring === r).length} ${r}`).join(" · ")}
        </span>
      </div>

      {notice?.kind === "added" && <p className="notice"><span className="dot emerald" aria-hidden="true" />Added {notice.name}. Its ads get pulled on the next report.</p>}
      {notice?.kind === "updated" && <p className="notice"><span className="dot emerald" aria-hidden="true" />Updated {notice.name}.</p>}
      {notice?.kind === "removed" && <p className="notice quiet"><span className="dot" aria-hidden="true" />Removed {notice.name}. Its ads stay in past reports but won't be pulled again.</p>}
      {notice?.kind === "missing" && <p className="error">Add a name and pick a ring.</p>}

      <div className="rings">
        {RINGS.map((r) => {
          const list = competitors.filter((c) => c.ring === r);
          return (
            <div key={r} className={`ring ${RING_INFO[r].tone}`}>
              <div className="ring-head">
                <span className={`dot ${RING_INFO[r].tone}`} aria-hidden="true" />
                <strong>{RING_INFO[r].label}</strong>
                <span className="mono muted">{list.length}</span>
              </div>
              <p className="ring-note">{RING_INFO[r].note}</p>
              <ul className="comp-list">
                {list.length === 0 && <li className="empty">None yet</li>}
                {list.map((c) => {
                  const state = adsState(c);
                  return (
                    <li key={c.name} title={c.why ?? ""}>
                      <span className={`comp-state ${state.cls}`} title={state.label} aria-label={state.label} />
                      <span className="comp-name">
                        {c.website ? (
                          <a href={c.website} target="_blank" rel="noreferrer">
                            {c.name}
                          </a>
                        ) : (
                          c.name
                        )}
                        {c.source === "you" ? null : <span className="comp-found"> found</span>}
                      </span>
                      <RemoveCompetitor brand={brand} name={c.name} />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="comp-legend mono muted">
        <span className="comp-state found" /> ads pulled <span className="comp-state next" /> next report{" "}
        <span className="comp-state none" /> no Meta ads
      </p>

      <form action={addCompetitorAction} className="panel add-comp">
        <input type="hidden" name="brand" value={brand} />
        <div className="add-comp-head">
          <h3>Add a competitor</h3>
          <p className="muted">Found one? Add it here and the next report pulls its ads.</p>
        </div>
        <label className="field">
          <span className="mono muted">Name</span>
          <input name="name" required maxLength={80} placeholder="Opal" />
        </label>
        <fieldset className="field ring-pick">
          <legend className="mono muted">Ring</legend>
          <div>
            {RINGS.map((r, i) => (
              <label key={r} className={`ring-option ${RING_INFO[r].tone}`}>
                <input type="radio" name="ring" value={r} defaultChecked={i === 0} />
                <span>{RING_INFO[r].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span className="mono muted">Website (optional)</span>
          <input name="website" maxLength={300} placeholder="opal.so" />
        </label>
        <label className="field">
          <span className="mono muted">Ad Library link (optional)</span>
          <input name="ad_library" maxLength={500} placeholder="facebook.com/ads/library/?view_all_page_id=…" />
        </label>
        <label className="field">
          <span className="mono muted">Instagram (optional)</span>
          <input name="instagram" maxLength={60} placeholder="@opal" />
        </label>
        <label className="field">
          <span className="mono muted">Why it's a competitor (optional)</span>
          <input name="why" maxLength={300} placeholder="Screen time blocker, same buyer" />
        </label>
        <div className="add-comp-foot">
          <p className="muted">
            An Ad Library link is the surest match: names like “Bloom” or “Anchor” bring up the wrong
            pages.
          </p>
          <button type="submit" className="btn-primary">
            Add competitor
          </button>
        </div>
      </form>
    </section>
  );
}
