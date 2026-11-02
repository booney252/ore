import { headers } from "next/headers";
import { brandName } from "@/lib/brands";
import { ensureInvite, inviteUrl } from "@/lib/invites";
import CopyLink from "../../CopyLink";
import { CREATOR_FIELDS, listCreators } from "@/lib/creators";
import { oaRemoveCreator, oaSaveCreator } from "../../actions";
import { Band, initials } from "../../ui";

export const dynamic = "force-dynamic";

const SHOW: { key: "about" | "story" | "voice" | "can_claim"; label: string }[] = [
  { key: "about", label: "Who they are" },
  { key: "story", label: "Their story with your product" },
  { key: "voice", label: "How they talk" },
  { key: "can_claim", label: "What they can honestly claim" },
];

export default async function Creators({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, creators, token, hdrs] = await Promise.all([brandName(brand), listCreators(brand), ensureInvite(brand), headers()]);
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const link = inviteUrl(host, hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https"), token);
  const editing = q.edit ? creators.find((c) => c.id === q.edit) : undefined;
  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="Creators"
        title={creators.length ? `${creators.length} creator${creators.length === 1 ? "" : "s"} on your roster.` : "Add your first creator."}
        sub="Every brief is written for one creator: their story, their voice, what they can honestly say."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-split">
          <div className="oa-creators">
            {creators.length === 0 && <div className="oa-card oa-empty" style={{ gridColumn: "1 / -1" }}>No creators yet. Send them the invite link on the right, or add one yourself.</div>}
            {creators.map((c, i) => (
              <article key={c.id} className="oa-card oa-creator">
                <div className="oa-creator-top">
                  <span className={`oa-cav c${i % 5}`}>{initials(c.name)}</span>
                  <div>
                    <h3>{c.name}</h3>
                    <p className="oa-small oa-muted">{[c.handle, c.platforms].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <div className="oa-dl">
                  {SHOW.filter((s) => c[s.key]).map((s) => (
                    <div key={s.key}>
                      <b>{s.label}</b>
                      {c[s.key]}
                    </div>
                  ))}
                </div>
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
