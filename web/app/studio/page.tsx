import Link from "next/link";
import { redirect } from "next/navigation";
import { docLabel } from "@/app/dates";
import { getMe, listSessions, studioBrands } from "@/lib/studio";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  new: "finding angles…",
  angles: "pick your angles",
  writing: "writing scripts…",
  scripts: "scripts ready",
};

export default async function Studio({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const me = await getMe();
  if (!me) redirect("/studio/me?first=1");
  const [brands, sessions] = await Promise.all([studioBrands(), listSessions()]);
  const nameOf = (slug: string) => brands.find((b) => b.slug === slug)?.name ?? slug;

  return (
    <main className="home studio">
      <section className="home-tag">
        <p className="mono muted">Creator Studio</p>
        <h1 className="display">Hey {me.name.split(" ")[0]}. What are we making?</h1>
        <p className="lede">
          Pick a brand. You'll see what's already winning for it and who buys it, then Ore finds
          angles that fit you and writes the scripts.
        </p>
      </section>

      {saved && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Profile saved. Everything Ore writes now sounds like you.
        </p>
      )}

      <section className="block">
        <h2>Brands</h2>
        {brands.length === 0 ? (
          <p className="empty">No brands are open for creators yet.</p>
        ) : (
          <div className="studio-brands">
            {brands.map((b) => (
              <Link key={b.slug} href={`/studio/b/${b.slug}`} className="studio-brand-card">
                <span className="sb-poster">
                  {b.poster ? <img src={b.poster} alt="" /> : <span className="ad-frame-empty" />}
                </span>
                <span className="sb-text">
                  <strong>{b.name}</strong>
                  <span className="muted">{b.product}</span>
                  <span className="mono muted sb-count">{b.winners.length} winning ads →</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <h2>Your sessions</h2>
        {sessions.length === 0 ? (
          <p className="empty">Nothing yet. Pick a brand to start.</p>
        ) : (
          <ul className="doc-rows">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/studio/s/${s.id}`}>
                  <span className={`dot ${s.status === "scripts" ? "emerald" : ""}`} aria-hidden="true" />
                  <span className="doc-name">
                    <span className="doc-date">{nameOf(s.brand)}</span>
                    <span className="doc-titles">
                      {s.picked?.length && s.angles
                        ? s.angles.filter((a) => s.picked!.includes(a.n)).map((a) => a.title).join(" · ")
                        : STATUS[s.status]}
                    </span>
                  </span>
                  <span className="muted">
                    {STATUS[s.status]} · {docLabel(s.created_at.slice(0, 10)).date}
                  </span>
                  <span className="arrow" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
