import { saveCreatorAction } from "@/app/actions";
import RemoveCreator from "@/app/RemoveCreator";
import { brandName } from "@/lib/brands";
import { CREATOR_FIELDS, listCreators, type Creator } from "@/lib/creators";

export const dynamic = "force-dynamic";

function CreatorFields({ c }: { c?: Creator }) {
  return (
    <>
      <label className="field">
        <span className="mono muted">Name</span>
        <input name="name" required maxLength={80} defaultValue={c?.name} placeholder="Maya" />
      </label>
      {CREATOR_FIELDS.map((f) => (
        <label key={f.key} className={`field${f.long ? " wide" : ""}`}>
          <span className="mono muted">{f.label}</span>
          {f.long ? (
            <textarea name={f.key} rows={3} maxLength={1500} defaultValue={c?.[f.key]} placeholder={f.hint} />
          ) : (
            <input name={f.key} maxLength={1500} defaultValue={c?.[f.key]} placeholder={f.hint} />
          )}
        </label>
      ))}
    </>
  );
}

export default async function Creators({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ saved?: string; removed?: string; missing?: string }>;
}) {
  const { brand } = await params;
  const { saved, removed, missing } = await searchParams;
  const [name, creators] = await Promise.all([brandName(brand), listCreators(brand)]);

  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">{name}</p>
        <h1 className="display">Creators</h1>
        <p className="lede">
          The people who film your ads. Pick one when you make iterations or briefs, and Ore writes
          for them: their story, their voice, what they can film, and only claims they can honestly make.
        </p>
      </header>

      {saved && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Saved {creators.find((c) => c.id === saved)?.name ?? "the creator"}.
        </p>
      )}
      {removed && <p className="notice quiet">Removed.</p>}
      {missing && <p className="error">Give the creator a name.</p>}

      {creators.length ? (
        <ul className="creator-list">
          {creators.map((c) => (
            <li key={c.id} id={c.id}>
              <details className="creator-card panel" open={saved === c.id ? false : undefined}>
                <summary>
                  <span className="creator-avatar" aria-hidden="true">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="creator-head">
                    <strong>{c.name}</strong>
                    <span className="muted">
                      {[c.handle, c.platforms].filter(Boolean).join(" · ") || "No handle yet"}
                    </span>
                  </span>
                  <span className="creator-story muted">{c.story || c.about || ""}</span>
                  <span className="mono muted creator-edit">Edit</span>
                </summary>
                <form action={saveCreatorAction} className="creator-form">
                  <input type="hidden" name="brand" value={brand} />
                  <input type="hidden" name="id" value={c.id} />
                  <CreatorFields c={c} />
                  <div className="creator-foot wide">
                    <RemoveCreator brand={brand} id={c.id} name={c.name} />
                    <button type="submit" className="btn-quiet">
                      Save
                    </button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No creators yet. Add the first one below.</p>
      )}

      <form action={saveCreatorAction} className="panel creator-form add-creator">
        <input type="hidden" name="brand" value={brand} />
        <div className="wide">
          <h3>Add a creator</h3>
          <p className="muted">
            The more real detail, the better the scripts sound like them. Only "Name" is required.
          </p>
        </div>
        <CreatorFields />
        <div className="creator-foot wide">
          <span />
          <button type="submit" className="btn-primary">
            Add creator
          </button>
        </div>
      </form>
    </main>
  );
}
