import Link from "next/link";
import { writeScripts } from "@/app/actions";
import CancelButton from "@/app/CancelButton";
import { docLabel } from "@/app/dates";
import FormatPicker, { FORMAT_LABEL } from "@/app/FormatPicker";
import { listJobs } from "@/lib/jobs";
import { listScripts, studioBrands, studioCreators } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function Studio({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; pick?: string; me?: string }>;
}) {
  const { queued, pick, me } = await searchParams;
  const [brands, creators, scripts] = await Promise.all([studioBrands(), studioCreators(), listScripts()]);
  const jobs = (await Promise.all(brands.map((b) => listJobs(b.slug, 6, ["scripts"])))).flat()
    .filter((j) => ["pending", "running", "waiting"].includes(j.status ?? ""))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const nameOf = (slug: string) => brands.find((b) => b.slug === slug)?.name ?? slug;
  const creatorName = (id: string | null) => creators.find((c) => c.id === id)?.name ?? "Any creator";

  return (
    <main className="home studio">
      <section className="home-tag">
        <p className="mono muted">Creator Studio</p>
        <h1 className="display">Write my scripts</h1>
        <p className="lede">
          Pick a brand. Ore writes ready-to-film scripts in your voice, built from the ads that are
          already winning for that brand.
        </p>
      </section>

      {queued && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          On it. Your scripts show up below in a minute or two.
        </p>
      )}
      {me && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          Profile saved. Ore writes in your voice from now on.
        </p>
      )}
      {pick && <p className="error">Pick a brand first.</p>}

      <form action={writeScripts} className="studio-form">
        <fieldset className="studio-step">
          <legend className="mono muted">1 · Pick a brand</legend>
          {brands.length === 0 ? (
            <p className="empty">No brands are open for creators yet.</p>
          ) : (
            <div className="studio-brands">
              {brands.map((b, i) => (
                <label key={b.slug} className="studio-brand-card">
                  <input type="radio" name="brand" value={b.slug} defaultChecked={i === 0} />
                  <span className="sb-poster">
                    {b.poster ? <img src={b.poster} alt="" /> : <span className="ad-frame-empty" />}
                  </span>
                  <span className="sb-text">
                    <strong>{b.name}</strong>
                    <span className="muted">{b.product}</span>
                    <span className="mono muted sb-count">{b.winners.length} winning ads to build from</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="studio-step">
          <legend className="mono muted">2 · Who's filming</legend>
          {creators.length ? (
            <div className="studio-row">
              <select name="creator" defaultValue={me ?? creators[0].id}>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.handle ? ` (${c.handle})` : ""}
                  </option>
                ))}
              </select>
              <Link href="/studio/me" className="link-quiet">
                Edit or add a profile →
              </Link>
            </div>
          ) : (
            <p className="muted">
              <Link href="/studio/me" className="link-quiet">
                Add your creator profile →
              </Link>{" "}
              so the scripts sound like you.
            </p>
          )}
        </fieldset>

        <div className="studio-step studio-opts">
          <FormatPicker label="3 · Format" />
          <label className="per-ad">
            <span className="mono muted">How many</span>
            <select name="count" defaultValue="3">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field studio-step">
          <span className="mono muted">Anything specific? (optional)</span>
          <input name="notes" maxLength={500} placeholder="e.g. gym angle, I'm a college student, keep it under 30s" />
        </label>

        <button type="submit" className="btn-primary emerald studio-go" disabled={!brands.length}>
          Write my scripts
        </button>
      </form>

      {jobs.length > 0 && (
        <section className="block">
          <h2>Writing now</h2>
          <ul className="jobs">
            {jobs.map((j) => (
              <li key={j.id}>
                <span className="dot emerald" aria-hidden="true" />
                <span>
                  {nameOf(j.brand)} · {creatorName(j.creator ?? null)} · {j.count} {FORMAT_LABEL[j.format ?? "ugc"]}
                </span>
                <CancelButton brand={j.brand} id={j.id} back="/studio" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block">
        <h2>Your scripts</h2>
        {scripts.length === 0 ? (
          <p className="empty">Nothing yet. Write your first set above.</p>
        ) : (
          <ul className="doc-rows">
            {scripts.map((s) => (
              <li key={s.file}>
                <Link href={`/studio/s/${s.file}`}>
                  <span className="dot emerald" aria-hidden="true" />
                  <span className="doc-name">
                    <span className="doc-date">{nameOf(s.brand)}</span>
                    <span className="doc-titles">
                      {s.count} {FORMAT_LABEL[s.format] ?? s.format} · for {creatorName(s.creator)}
                    </span>
                  </span>
                  <span className="muted">{docLabel(s.file).date}</span>
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

