import type { ReactNode } from "react";
import { oaMake } from "./actions";

type Creator = { id: string; name: string };

/** The one button every idea ends in: one script to review, then a version for each ticked creator. */
export default function MakeForm({ brand, creators, hidden, children }: { brand: string; creators: Creator[]; hidden: Record<string, string>; children?: ReactNode }) {
  return (
    <form action={oaMake} className="oa-make">
      <input type="hidden" name="brand" value={brand} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      {creators.length > 0 && (
        <details className="oa-who">
          <summary className="oa-small oa-muted">
            For {creators.length === 1 ? creators[0].name : `${creators.slice(0, -1).map((c) => c.name).join(", ")} and ${creators[creators.length - 1].name}`} <span>Change</span>
          </summary>
          <fieldset className="oa-pick">
            {creators.map((c) => (
              <label key={c.id} className="oa-chip">
                <input type="checkbox" name="creator" value={c.id} defaultChecked /> {c.name}
              </label>
            ))}
          </fieldset>
        </details>
      )}
      <button type="submit" className="oa-btn">Write the script</button>
    </form>
  );
}
