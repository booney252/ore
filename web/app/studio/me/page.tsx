import { saveStudioCreatorAction } from "@/app/actions";
import CreatorFields from "@/app/CreatorFields";
import { studioCreators } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function StudioMe({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  const { missing } = await searchParams;
  const creators = await studioCreators();
  return (
    <main className="home studio">
      <section className="home-tag">
        <p className="mono muted">Creator Studio</p>
        <h1 className="display">Your profile</h1>
        <p className="lede">
          Who you are and how you talk. The more real it is, the more the scripts sound like you,
          and Ore only ever writes claims you can honestly make.
        </p>
      </section>
      {missing && <p className="error">Add your name.</p>}

      {creators.length > 0 && (
        <ul className="creator-list">
          {creators.map((c) => (
            <li key={c.id} id={c.id}>
              <details className="creator-card panel">
                <summary>
                  <span className="creator-avatar" aria-hidden="true">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="creator-head">
                    <strong>{c.name}</strong>
                    <span className="muted">{[c.handle, c.platforms].filter(Boolean).join(" · ") || "No handle yet"}</span>
                  </span>
                  <span className="creator-story muted">{c.about || c.story || ""}</span>
                  <span className="mono muted creator-edit">Edit</span>
                </summary>
                <form action={saveStudioCreatorAction} className="creator-form">
                  <input type="hidden" name="id" value={c.id} />
                  <CreatorFields c={c} />
                  <div className="creator-foot wide">
                    <span />
                    <button type="submit" className="btn-quiet">
                      Save
                    </button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <form action={saveStudioCreatorAction} className="panel creator-form add-creator">
        <div className="wide">
          <h3>{creators.length ? "Add another profile" : "Add your profile"}</h3>
          <p className="muted">Only your name is required, but voice and what you can film make the biggest difference.</p>
        </div>
        <CreatorFields />
        <div className="creator-foot wide">
          <span />
          <button type="submit" className="btn-primary">
            Save profile
          </button>
        </div>
      </form>
    </main>
  );
}
