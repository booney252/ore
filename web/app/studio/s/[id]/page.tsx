import Link from "next/link";
import { notFound } from "next/navigation";
import { pickAngles, tweakScript } from "@/app/actions";
import FormatPicker, { FORMAT_LABEL } from "@/app/FormatPicker";
import Grade from "@/app/Grade";
import Markdown from "@/app/Markdown";
import { hook, loadAds, posterUrl } from "@/lib/ads";
import { listJobs } from "@/lib/jobs";
import { explain } from "@/lib/score";
import { readSession, studioBrand } from "@/lib/studio";

export const dynamic = "force-dynamic";

/** "### Script 1.2: name" sections of the scripts doc. */
function scripts(md: string): { n: string; title: string; body: string }[] {
  const heads = [...md.matchAll(/^#{2,4}\s*Script\s+([\d.]+)\s*[:.\-]?\s*(.*)$/gm)];
  return heads.map((m, i) => ({
    n: m[1],
    title: m[2].trim(),
    body: md.slice(m.index! + m[0].length, i + 1 < heads.length ? heads[i + 1].index : md.length).trim(),
  }));
}

const TWEAKS = [
  { action: "more", label: "More like this" },
  { action: "hooks", label: "New hooks" },
  { action: "shorter", label: "Make it shorter" },
];

export default async function StudioSession({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pick?: string; tweaking?: string }>;
}) {
  const { id } = await params;
  const { pick } = await searchParams;
  const found = await readSession(id);
  if (!found) notFound();
  const { session: s, md } = found;
  const [b, ads, jobs] = await Promise.all([
    studioBrand(s.brand),
    loadAds(s.brand),
    listJobs(s.brand, 30, ["angles", "scripts", "tweak"]),
  ]);
  const mine = jobs.filter((j) => j.session === s.id && ["pending", "running", "waiting"].includes(j.status ?? ""));
  const busy = mine.length > 0;
  const tweaking = mine.filter((j) => j.type === "tweak");
  const byId = new Map(ads.map((a) => [a.ad_id, a]));
  const used = (s.ad_id ? [s.ad_id] : s.ads ?? []).map((x) => byId.get(x)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const posters = await Promise.all(used.map((a) => posterUrl(a)));
  const picked = (s.angles ?? []).filter((a) => s.picked?.includes(a.n));
  const parts = md ? scripts(md) : [];

  return (
    <main className="home studio studio-read">
      {busy && <meta httpEquiv="refresh" content="6" />}
      <p className="crumbs mono">
        <Link href="/studio">Creator Studio</Link> / <Link href={`/studio/b/${s.brand}`}>{b?.name ?? s.brand}</Link>
      </p>
      <header className="studio-read-head">
        <h1 className="display">{b?.name ?? s.brand}</h1>
        <ol className="session-steps mono">
          <li className={s.status === "new" ? "on" : "done"}>1 · Angles</li>
          <li className={s.status === "angles" ? "on" : s.status === "new" ? "" : "done"}>2 · Pick</li>
          <li className={s.status === "writing" ? "on" : s.status === "scripts" ? "done" : ""}>3 · Scripts</li>
        </ol>
      </header>

      {used.length > 0 && (
        <section className="studio-winners">
          <p className="mono muted">{s.ad_id ? "Building from this winner" : `Built from ${b?.name ?? "the brand"}'s winners`}</p>
          <div className="sw-row">
            {used.map((a, i) => (
              <Link key={a.ad_id} href={`/b/${s.brand}/ads/${a.ad_id}`} className="sw-card">
                <span className="sw-poster">
                  {posters[i] ? <img src={posters[i]!} alt="" /> : <span className="ad-frame-empty" />}
                  <span className="sw-grade">
                    <Grade g={explain(a).grade} size="sm" />
                  </span>
                </span>
                <span className="sw-hook">“{hook(a) || "No spoken hook"}”</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {s.status === "new" && (
        <div className="thinking panel">
          <span className="pulse" aria-hidden="true" />
          <div>
            <strong>Finding angles that fit you…</strong>
            <p className="muted">
              Ore is reading what's winning for {b?.name}, what buyers say, and your profile. This page
              updates by itself.
            </p>
          </div>
        </div>
      )}

      {s.status === "angles" && (
        <form action={pickAngles} className="studio-form">
          <input type="hidden" name="session" value={s.id} />
          <fieldset className="studio-step">
            <legend className="mono muted">Pick the angles you want scripts for</legend>
            {pick && <p className="error">Pick at least one angle.</p>}
            <div className="angle-list">
              {(s.angles ?? []).map((a) => (
                <label key={a.n} className="angle-card">
                  <input type="checkbox" name="angle" value={a.n} />
                  <span className="mech-tick" aria-hidden="true" />
                  <span className="angle-body">
                    <span className="angle-title">{a.title}</span>
                    <Markdown text={a.body} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="studio-step studio-opts">
            <FormatPicker label="Format" initial={b?.format} />
            <label className="per-ad">
              <span className="mono muted">Length</span>
              <select name="length" defaultValue="30s">
                <option value="15s">15s</option>
                <option value="30s">30s</option>
                <option value="45s">45s</option>
                <option value="60s">60s</option>
              </select>
            </label>
            <label className="per-ad">
              <span className="mono muted">Per angle</span>
              <select name="per_angle" defaultValue="1">
                <option value="1">1 script</option>
                <option value="2">2 scripts</option>
                <option value="3">3 scripts</option>
              </select>
            </label>
          </div>
          <label className="field studio-step">
            <span className="mono muted">Anything specific? (optional)</span>
            <input name="notes" maxLength={500} placeholder="e.g. film it at the gym, no talking for the first 3 seconds" />
          </label>
          <button type="submit" className="btn-primary emerald studio-go">
            Write my scripts
          </button>
        </form>
      )}

      {(s.status === "writing" || s.status === "scripts") && picked.length > 0 && (
        <details className="picked-angles">
          <summary className="mono muted">
            Your angles: {picked.map((a) => a.title).join(" · ")} · {FORMAT_LABEL[s.format ?? "ugc"]} · {s.length}
          </summary>
          {picked.map((a) => (
            <div key={a.n} className="picked-angle">
              <strong>{a.title}</strong>
              <Markdown text={a.body} />
            </div>
          ))}
        </details>
      )}

      {s.status === "writing" && (
        <div className="thinking panel">
          <span className="pulse" aria-hidden="true" />
          <div>
            <strong>Writing your scripts…</strong>
            <p className="muted">Hooks, the full script second by second, and a caption for each. This page updates by itself.</p>
          </div>
        </div>
      )}

      {s.status === "scripts" && (
        <section className="script-list">
          {tweaking.length > 0 && (
            <p className="notice">
              <span className="dot emerald" aria-hidden="true" />
              Working on {tweaking.length} change{tweaking.length > 1 ? "s" : ""}. They appear under the script they came from.
            </p>
          )}
          {parts.map((p) => (
            <article key={p.n} id={`script-${p.n}`} className={`script-card panel${p.n.includes(".") ? " version" : ""}`}>
              <header>
                <span className="mono muted">Script {p.n}</span>
                <h2>{p.title}</h2>
              </header>
              <Markdown text={p.body} />
              <div className="tweak-row">
                {TWEAKS.map((t) => (
                  <form key={t.action} action={tweakScript}>
                    <input type="hidden" name="session" value={s.id} />
                    <input type="hidden" name="script" value={p.n.split(".")[0]} />
                    <input type="hidden" name="action" value={t.action} />
                    <button type="submit" className="btn-quiet">
                      {t.label}
                    </button>
                  </form>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
