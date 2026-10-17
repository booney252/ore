import Link from "next/link";
import { notFound } from "next/navigation";
import { hook, loadAds, posterUrl, tier } from "@/lib/ads";
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
  offer: "Offer",
  cta: "CTA",
};
const LONG = ["why_it_works", "beats", "on_screen_text", "risky_claims", "hook_line", "time_to_product_s"];

export default async function AdPage({ params }: { params: Promise<{ brand: string; id: string }> }) {
  const { brand, id } = await params;
  const ad = (await loadAds(brand)).find((a) => a.ad_id === id);
  if (!ad) notFound();
  const b = ad.breakdown ?? {};
  const a = ad.analysis ?? {};
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
            <span className={`score-num lg ${tier(ad.score)}`}>{ad.score}</span>
            <div>
              <p className="mono muted">Winner score</p>
              <p>{ad.score_why}</p>
              {ad.removed_from_library ? (
                <span className="tag ruby">Removed {ad.removed_from_library}</span>
              ) : ad.ad_library_url ? (
                <a href={ad.ad_library_url} target="_blank" rel="noreferrer" className="link-quiet">
                  Open in the Ad Library ↗
                </a>
              ) : null}
            </div>
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

          {b.why_it_works ? (
            <section className="ad-section">
              <h2>Why it works</h2>
              <p className="big-read">{text(b.why_it_works)}</p>
            </section>
          ) : null}

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

          {asList(b.on_screen_text).length > 0 && (
            <section className="ad-section">
              <h2>On-screen text</h2>
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
