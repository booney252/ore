import { saveMeAction } from "@/app/actions";
import CreatorFields from "@/app/CreatorFields";
import { getMe } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function StudioMe({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string; first?: string }>;
}) {
  const { missing, first } = await searchParams;
  const me = await getMe();
  return (
    <main className="home studio">
      <section className="home-tag">
        <p className="mono muted">{first ? "Step 1 of 1 · before you start" : "Creator Studio"}</p>
        <h1 className="display">{first ? "First, tell Ore who you are" : "Your profile"}</h1>
        <p className="lede">
          Everything Ore writes is for you: your story, the way you talk, what you can film, and
          only what you can honestly say. You fill this in once and change it any time.
        </p>
      </section>
      {missing && <p className="error">Add your name.</p>}
      <form action={saveMeAction} className="panel creator-form add-creator">
        <CreatorFields c={me ?? undefined} />
        <div className="creator-foot wide">
          <span className="muted">The biggest difference: how you talk, and what you can film.</span>
          <button type="submit" className="btn-primary emerald">
            {first ? "Save and start" : "Save"}
          </button>
        </div>
      </form>
    </main>
  );
}
