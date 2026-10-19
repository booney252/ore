import Link from "next/link";
import { notFound } from "next/navigation";
import { hook, loadAds, posterUrl } from "@/lib/ads";
import { explain } from "@/lib/score";
import Grade from "@/app/Grade";
import { signedUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  format: "Format",
  angle: "Angle",
  structure: "Structure",
  hook_type: "Hook type",
  speaker: "Who's talking",
  setting: "Setting",
  first_frame: "First frame",
  graphic_style: "Graphic style",
  focal_point: "Focal point",
  copy_hook: "Copy's first line",
  copy_length_tone: "Copy length and voice",
  headline_role: "Headline",
  offer: "Offer",
  cta: "CTA",
};
const LONG = [
  "why_it_works",
  "why_the_graphic_works",
  "why_the_copy_works",
  "copy_structure",
  "beats",
  "on_screen_text",
  "risky_claims",
  "hook_line",
  "time_to_product_s",
  "load_bearing",
  "transferable",
  "not_transferable",
];

export default async function AdPage({ params }: { params: Promise<{ brand: string; id: string }> }) {
  const { brand, id } = await params;
  const ad = (await loadAds(brand)).find((a) => a.ad_id === id);
  if (!ad) notFound();
  const b = ad.breakdown ?? {};
  const a = ad.analysis ?? {};
  const why = explain(ad);
  const [poster, video, frames] = await Promise.all([
    posterUrl(ad),
    ad.media_type === "video" && ad.media_key ? signedUrl(ad.media_key) : null,
    Promise.all((a.frames ?? []).map(async (f) => ({ t: f.t, url: await signedUrl(f.key) }))),
  ]);
  const facts = Object.keys(b).filter((k) => !LONG.includes(k) && b[k] != null && b[k] !== "");
  const risky = asList(b.risky_claims);

  return (
    <main className="page">
      <p className="crumbs mono">
        <Link href={`/b/${brand}/ads`}>Winning ads</Link> / {ad.brand}
      </p>

      <div className="ad-detail">
        <div className="ad-media">
          {video ? (
            <video src={video} poster={poster ?? undefined} controls playsInline preload="metadata" />
          ) : poster ? (
            <img src={poster} alt={`${ad.brand} ad`} />
          ) : (
            <div className="ad-frame-empty" />
          )}
          {frames.length > 1 && (
            <ol className="film">
              {frames.map((f) => (
                <li key={f.url}>
                  <img src={f.url} alt="" loading="lazy" />
                  <span className="mono">{f.t.toFixed(1)}s</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="ad-info">
          <header>
            <p className="mono muted">
              {ad.brand}
              {ad.ring ? ` · ${ad.ring}` : ""}
              {ad.is_own ? " · yours" : ""}
            </p>
            <h1 className="hook-quote">“{hook(ad) || "No spoken hook"}”</h1>
          </header>

          <div className="score-block">
            <Grade g={why.grade} size="lg" />
            <div>
              <p className="mono muted">Winner grade · {why.verdict}</p>
              <p>{why.reason}</p>
              <p className="muted">{why.meaning}</p>
              {ad.removed_from_library ? (
                <span className="tag ruby">Removed {ad.removed_from_library}</span>
              ) : ad.ad_library_url ? (
                <a href={ad.ad_library_url} target="_blank" rel="noreferrer" className="link-quiet">
                  Open in the Ad Library ↗
                </a>
              ) : null}
            </div>
          </div>

          <div className="score-parts">
            {why.parts.map((p) => (
              <div key={p.label} className="score-part">
                <div className="score-part-head">
                  <span>
                    {p.label}: <strong>{p.value}</strong>
                  </span>
                  <span className="score-part-grade">
                    {p.grade ? (
                      <Grade g={p.grade} size="sm" />
                    ) : (
                      <span className={`effect ${p.effect === "no change" ? "" : p.effect.startsWith("up") ? "up" : "down"}`}>
                        {p.effect === "no change" ? "no change" : p.effect.startsWith("up") ? "↑ up one" : "↓ down one"}
                      </span>
                    )}
                  </span>
                </div>
                <p className="muted">{p.note}</p>
              </div>
            ))}
          </div>

          <dl className="facts">
            <Fact k="Length" v={a.length_s ? `${a.length_s}s` : null} />
            <Fact k="Cuts" v={a.cut_count != null ? `${a.cut_count} (${a.cuts_per_second}/s)` : null} />
            <Fact k="Product shows at" v={b.time_to_product_s != null ? `${b.time_to_product_s}s` : null} />
            <Fact k="Started" v={ad.start_date} />
            {facts.map((k) => (
              <Fact key={k} k={LABELS[k] ?? k.replace(/_/g, " ")} v={text(b[k])} wide />
            ))}
          </dl>

          {!ad.breakdown && (
            <p className="notice quiet">
              <span className="dot" aria-hidden="true" />
              Not taken apart yet. The diagnosis (why it works, what we can use) comes with the next
              report run.
            </p>
          )}

          {b.why_it_works ? (
            <section className="ad-section">
              <h2>Why it works</h2>
              <p className="big-read">{text(b.why_it_works)}</p>
            </section>
          ) : null}

          {b.why_the_graphic_works ? (
            <section className="ad-section">
              <h2>Why the graphic works</h2>
              <p className="big-read">{text(b.why_the_graphic_works)}</p>
            </section>
          ) : null}

          {b.why_the_copy_works ? (
            <section className="ad-section">
              <h2>Why the copy works</h2>
              <p className="big-read">{text(b.why_the_copy_works)}</p>
              {asList(b.copy_structure).length > 0 && (
                <ol className="beats">{asList(b.copy_structure).map((x, i) => <li key={i}>{x}</li>)}</ol>
              )}
            </section>
          ) : null}

          {asList(b.transferable).length > 0 && (
            <section className="ad-section">
              <h2>What we can use</h2>
              <ul className="beats">{asList(b.transferable).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          )}

          {risky.length > 0 && (
            <section className="ad-section risk">
              <h2>Risky claims, don't copy</h2>
              <ul>{risky.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}

          {asList(b.beats).length > 0 && (
            <section className="ad-section">
              <h2>Beats</h2>
              <ol className="beats">{asList(b.beats).map((x, i) => <li key={i}>{x}</li>)}</ol>
            </section>
          )}

          {ad.media_type !== "image" && (
            <section className="ad-section">
              <h2>Transcript</h2>
              {a.transcript?.length ? (
                <ol className="transcript">
                  {a.transcript.map((l) => (
                    <li key={l.start}>
                      <span className="mono">{l.start.toFixed(1)}s</span>
                      <span>{l.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty">No speech.</p>
  
          )}
          </section>
          )}

          {asList(b.on_screen_text).length > 0 && (
            <section className="ad-section">
              <h2>{ad.media_type === "image" ? "Text on the image" : "On-screen text"}</h2>
              <ul className="beats">{asList(b.on_screen_text).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          )}

          {ad.body ? (
            <section className="ad-section">
              <h2>Ad copy</h2>
              <p className="copy">{ad.body}</p>
              <p className="mono muted">
                {ad.headline ? `${ad.headline} · ` : ""}
                {ad.cta}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Fact({ k, v, wide }: { k: string; v?: string | null; wide?: boolean }) {
  if (!v) return null;
  return (
    <div className={wide ? "wide" : undefined}>
      <dt className="mono muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(text).join("; ");
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k.replace(/_/g, " ")}: ${text(x)}`)
    .join(" · ");
}

function asList(v: unknown): string[] {
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).map(text).filter(Boolean);
}
