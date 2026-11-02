import Link from "next/link";
import { headers } from "next/headers";
import { brandName } from "@/lib/brands";
import { ensureInvite, inviteUrl } from "@/lib/invites";
import CopyLink from "../../CopyLink";
import { CREATOR_FIELDS, listCreators } from "@/lib/creators";
import { oaSaveCreator } from "../../actions";
import { Band, initials } from "../../ui";

export const dynamic = "force-dynamic";

/** The roster: one card per creator; tap in for their profile, scripts and results. */
export default async function Creators({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, creators, token, hdrs] = await Promise.all([brandName(brand), listCreators(brand), ensureInvite(brand), headers()]);
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const link = inviteUrl(host, hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https"), token);
  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="Creators"
        title={creators.length ? `${creators.length} creator${creators.length === 1 ? "" : "s"} on your roster.` : "Add your first creator."}
        sub="Tap a creator to see their profile, the scripts they've got and how their ads are doing."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-split">
          <div className="cr-grid">
            {creators.length === 0 && <div className="oa-card oa-empty" style={{ gridColumn: "1 / -1" }}>No creators yet. Send them the invite link, or add one yourself.</div>}
            {creators.map((c, i) => (
              <Link key={c.id} href={`/app/${brand}/creators/${c.id}`} className="oa-card cr-card">
                <span className={`oa-cav c${i % 5}`}>{initials(c.name)}</span>
                <b>{c.name}</b>
              </Link>
            ))}
          </div>
          <aside className="oa-stack oa-sticky">
            <div className="oa-card oa-invite">
              <h2>Invite your creators</h2>
              <p className="oa-small oa-muted">Send this link to every creator. They fill in their own profile in about 3 minutes, no account, and it shows up here.</p>
              <CopyLink url={link} />
            </div>
            <details className="oa-card cr-add" open={Boolean(q.missing)}>
              <summary>Add a creator yourself</summary>
              <form action={oaSaveCreator} className="oa-form">
                <input type="hidden" name="brand" value={brand} />
                <label className="oa-field">
                  <span>Name</span>
                  <input name="name" required placeholder="Jenny" />
                </label>
                {q.missing && <p className="oa-small" style={{ color: "#c2410c" }}>Add a name first.</p>}
                {CREATOR_FIELDS.filter((f) => ["about", "story", "can_film", "voice", "can_claim", "avoid"].includes(f.key)).map((f) => (
                  <label key={f.key} className="oa-field">
                    <span>{f.label}</span>
                    {f.long ? <textarea name={f.key} rows={2} placeholder={f.hint} /> : <input name={f.key} placeholder={f.hint} />}
                  </label>
                ))}
                <button type="submit" className="oa-btn">Add creator</button>
              </form>
            </details>
          </aside>
        </div>
      </main>
    </>
  );
}
