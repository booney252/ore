import { brandName, checkSlug } from "@/lib/brands";
import { advertiser, loadAds, type Ad } from "@/lib/ads";
import { readText, signedUrl } from "@/lib/storage";
import { Band } from "../../ui";

export const dynamic = "force-dynamic";

type Source = { ad_id: string; note: string };
type Idea = {
  name: string;
  line: string;
  why: string[];
  ours: { text: string };
  sources: Source[];
};
type Brief = { date: string; title: string; intro: string; ideas: Idea[]; alerts?: { title: string; text: string; ad_id?: string }[] };

const day = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const grade = (a: Ad) => a.score_why?.match(/^Grade ([A-F])/)?.[1] ?? null;

/** The ad itself (video plays inline, static shows the image), with its numbers and a link to the Ad Library. */
async function SourceAd({ ad, note }: { ad?: Ad; note: string }) {
  if (!ad) return null;
  const frame = ad.analysis?.frames?.[0]?.key;
  const poster = frame ? await signedUrl(frame) : undefined;
  const media = ad.media_key ? await signedUrl(ad.media_key) : undefined;
  const g = grade(ad);
  const stats: [string, string][] = [
    ["Top 10", ad.top10_rank ? `#${ad.top10_rank}` : "out"],
    ["Started", day(ad.start_date)],
    ["Live", `${ad.days_running ?? 0} day${ad.days_running === 1 ? "" : "s"}`],
    ["Versions", String(ad.versions ?? 1)],
  ];
  if (ad.analysis?.length_s) stats.push(["Length", `${Math.round(ad.analysis.length_s)}s`]);
  return (
    <div className="ix-src">
      <div className="ix-media">
        {ad.media_type === "video" && media ? (
          <video src={media} poster={poster} controls playsInline preload="none" />
        ) : media && ad.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media} alt="" />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" />
        ) : (
          <div className="ix-copy">{(ad.body ?? "").slice(0, 220)}</div>
        )}
      </div>
      <div className="ix-meta">
        <b>{advertiser(ad)}</b>
        {ad.breakout && <span className="ix-new">New in top 10 · {day(ad.breakout)}</span>}
        <p>{note}</p>
        <dl>
          {stats.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
          {g && <div><dt>Grade</dt><dd>{g}</dd></div>}
          <div><dt>Status</dt><dd>{ad.is_active ? "Running" : "Stopped"}</dd></div>
        </dl>
        {ad.score_why && <small>{ad.score_why}</small>}
        {ad.ad_library_url && <a href={ad.ad_library_url} target="_blank" rel="noreferrer">Open in the Ad Library ↗</a>}
      </div>
    </div>
  );
}

export default async function Ideas({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const slug = checkSlug(brand);
  const date = (await readText(`brands/${slug}/ideas/latest.txt`))?.trim();
  const raw = date ? await readText(`brands/${slug}/ideas/${date}.json`) : null;
  const [name, ads] = await Promise.all([brandName(slug), loadAds(slug)]);
  const byId = new Map(ads.map((a) => [a.ad_id, a]));
  if (!raw) {
    return (
      <>
        <Band brand={slug} name={name} title="New ideas" />
        <main className="oa-main"><div className="oa-wrap"><p className="oa-card oa-empty">No ideas brief yet.</p></div></main>
      </>
    );
  }
  const brief = JSON.parse(raw) as Brief;
  return (
    <>
      <style>{CSS}</style>
      <Band brand={slug} name={name} label={`Ideas brief · ${day(brief.date)}`} title={brief.title} sub={brief.intro} />
      <main className="oa-main">
        <div className="oa-wrap ix">
          <nav className="oa-card ix-toc">
            {brief.ideas.map((idea, i) => {
              const src = idea.sources.map((s) => byId.get(s.ad_id)).filter(Boolean) as Ad[];
              return (
                <a key={i} href={`#idea-${i + 1}`}>
                  <i>{i + 1}</i>
                  <span><b>{idea.name}</b><em>{src.length} source ads · {new Set(src.map((a) => a.brand)).size} advertisers</em></span>
                </a>
              );
            })}
          </nav>

          {brief.ideas.map((idea, i) => (
            <section key={i} id={`idea-${i + 1}`} className="oa-card ix-idea">
              <header>
                <span className="ix-num">Idea {i + 1}</span>
                <h2>{idea.name}</h2>
                <p className="ix-line">{idea.line}</p>
              </header>

              <div className="ix-cols">
                <div>
                  <h3>Why we have this idea</h3>
                  <ol className="ix-why">{idea.why.map((w, j) => <li key={j}>{w}</li>)}</ol>
                </div>
                <div className="ix-ours">
                  <h3>How we make it a PeptidePal ad</h3>
                  <p className="ix-para">{idea.ours.text}</p>
                </div>
              </div>

              <h3 className="ix-srch">Where it comes from</h3>
              <div className="ix-srcs">
                {idea.sources.map((s) => <SourceAd key={s.ad_id} ad={byId.get(s.ad_id)} note={s.note} />)}
              </div>
            </section>
          ))}

          {brief.alerts?.length ? (
            <section className="oa-card ix-alerts">
              <h2>Also worth knowing this week</h2>
              <div className="ix-srcs">
                {brief.alerts.map((a, i) => {
                  const ad = a.ad_id ? byId.get(a.ad_id) : undefined;
                  return (
                    <div key={i} className="ix-alert">
                      <b>{a.title}</b>
                      <p>{a.text}</p>
                      {ad?.ad_library_url && <a href={ad.ad_library_url} target="_blank" rel="noreferrer">See the ad ↗</a>}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}

const CSS = `
.ix { display: grid; gap: 22px; max-width: 1080px; }
.ix-toc { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; padding: 14px; }
.ix-toc a { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 14px; color: inherit; text-decoration: none; background: var(--oa-soft); }
.ix-toc a:hover { outline: 1px solid var(--oa-cobalt); }
.ix-toc i { font-style: normal; width: 30px; height: 30px; flex: none; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--oa-grad); font-weight: 600; }
.ix-toc span { display: grid; }
.ix-toc em { font-style: normal; font-size: 12.5px; color: var(--oa-muted); }
.ix-idea { padding: 28px; scroll-margin-top: 20px; }
.ix-num { font-family: var(--font-data), monospace; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--oa-cobalt); }
.ix-idea h2 { font-size: 30px; margin: 4px 0 6px; }
.ix-line { font-size: 17px; color: var(--oa-muted); max-width: 760px; margin: 0; }
.ix-cols { display: grid; grid-template-columns: 1.1fr 1fr; gap: 26px; margin-top: 22px; }
.ix-cols h3, .ix-srch { margin: 0 0 10px; }
.ix-why { margin: 0; padding-left: 20px; display: grid; gap: 10px; line-height: 1.55; }
.ix-ours { background: var(--oa-soft); border: 1px solid var(--oa-line); border-radius: 16px; padding: 18px; }
.ix-ours p { margin: 0 0 6px; line-height: 1.5; }
.ix-para { font-size: 15.5px; line-height: 1.65 !important; }
.ix-k { font-family: var(--font-data), monospace; font-size: 11px !important; letter-spacing: .06em; text-transform: uppercase; color: var(--oa-muted); margin-top: 14px !important; }
.ix-k:first-of-type { margin-top: 0 !important; }
.ix-hooks { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-weight: 600; }
.ix-beats { margin: 0; padding-left: 18px; display: grid; gap: 6px; line-height: 1.5; font-size: 14.5px; }
.ix-srch { margin-top: 26px !important; }
.ix-srcs { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.ix-src { display: grid; grid-template-columns: 116px 1fr; gap: 14px; padding: 12px; border: 1px solid var(--oa-line); border-radius: 16px; background: var(--oa-surface); }
.ix-media { width: 116px; aspect-ratio: 9 / 16; border-radius: 10px; overflow: hidden; background: #0f1c33; }
.ix-media video, .ix-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ix-copy { padding: 8px; font-size: 10.5px; line-height: 1.35; color: #dfe6f3; }
.ix-meta { display: grid; gap: 6px; align-content: start; min-width: 0; font-size: 14px; }
.ix-meta p { margin: 0; line-height: 1.45; }
.ix-new { font-family: var(--font-data), monospace; font-size: 11px; color: #c4307a; }
.ix-meta dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 4px 0 0; }
.ix-meta dl div { background: var(--oa-soft); border-radius: 8px; padding: 5px 7px; }
.ix-meta dt { font-size: 10.5px; color: var(--oa-muted); }
.ix-meta dd { margin: 0; font-weight: 600; font-size: 13px; }
.ix-meta small { color: var(--oa-muted); font-size: 12px; line-height: 1.4; }
.ix-meta a, .ix-alert a { color: var(--oa-cobalt); font-weight: 600; font-size: 13.5px; text-decoration: none; }
.ix-alerts h2 { margin: 0 0 14px; }
.ix-alert { padding: 14px; border-radius: 14px; background: var(--oa-soft); display: grid; gap: 6px; }
.ix-alert p { margin: 0; line-height: 1.5; font-size: 14px; }
@media (max-width: 760px) {
  .ix-cols { grid-template-columns: 1fr; }
  .ix-idea { padding: 18px; }
  .ix-idea h2 { font-size: 24px; }
  .ix-srcs { grid-template-columns: 1fr; }
  .ix-src { grid-template-columns: 96px 1fr; }
  .ix-media { width: 96px; }
}
`;
