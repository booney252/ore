import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { brandName, checkFile, readDoc, type Kind } from "@/lib/brands";
import { readLessons, rules } from "@/lib/lessons";
import { headers } from "next/headers";
import { listCreators } from "@/lib/creators";
import { oaFeedback, oaShare } from "../../../../actions";
import CopyLink from "../../../../CopyLink";
import { Band } from "../../../../ui";

export const dynamic = "force-dynamic";

const CHIPS = ["Too salesy", "Weak hook", "Doesn't sound like the creator", "Too long", "Love this"];

export default async function BriefDoc({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string; kind: string; file: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { brand, kind, file } = await params;
  const q = await searchParams;
  if (kind !== "iterations" && kind !== "briefs") notFound();
  try {
    checkFile(file);
  } catch {
    notFound();
  }
  const [name, md, lessons, creators, hdrs] = await Promise.all([brandName(brand), readDoc(brand, kind as Kind, file), readLessons(brand), listCreators(brand), headers()]);
  const forId = file.match(/-for-([a-z0-9-]+)/)?.[1];
  const forCreator = creators.find((c) => c.id === forId);
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = q.shared && /^[A-Za-z0-9_-]{8,40}$/.test(q.shared) ? `${proto}://${host}/c/${q.shared}` : "";
  if (!md) notFound();
  const heads = [...md.matchAll(/^#\s+(.+)$/gm)];
  const title = heads[heads.length - 1]?.[1]?.replace(/[*_`]/g, "") ?? "Brief";
  const brandRules = rules(lessons.brand).slice(-6).reverse();
  return (
    <>
      <Band brand={brand} name={name} label={kind === "briefs" ? "Creative brief" : "Scripts"} title={title}>
        {forCreator && (
          <div className="oa-gchips">
            <span className="oa-gchip">Written for {forCreator.name}</span>
          </div>
        )}
      </Band>
      <main className="oa-main">
        <div className="oa-wrap oa-split">
          <article className="oa-card oa-doc">
            <Markdown text={md.replace(/^#\s+.+\n/gm, "")} />
          </article>
          <aside className="oa-sticky">
            <form action={oaShare} className="oa-card oa-send" id="send">
              <input type="hidden" name="brand" value={brand} />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="file" value={file} />
              <input type="hidden" name="creator" value={forCreator?.id ?? ""} />
              <h2>Send to {forCreator ? forCreator.name : "your creator"}</h2>
              {shareUrl ? (
                <>
                  <p className="oa-small oa-muted">Send this link. {forCreator ? forCreator.name : "They"} can open it on any phone, no account needed.</p>
                  <CopyLink url={shareUrl} />
                </>
              ) : (
                <>
                  <p className="oa-small oa-muted">Makes a private link {forCreator ? forCreator.name : "your creator"} can open without an account.</p>
                  <button type="submit" className="oa-btn">Create link</button>
                </>
              )}
            </form>
            <form action={oaFeedback} className="oa-card oa-form" id="feedback">
              <input type="hidden" name="brand" value={brand} />
              <input type="hidden" name="doc" value={`${kind}/${file}`} />
              <input type="hidden" name="about" value={title} />
              <h2>What would you change?</h2>
              {q.feedback === "sent" && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Got it. Ore is turning that into a rule for every brief after this one.</p>}
              {q.feedback === "empty" && <p className="oa-small oa-muted">Write a note first.</p>}
              <div className="oa-chips">
                {CHIPS.map((c) => (
                  <label key={c} className="oa-chip" style={{ paddingRight: 11, cursor: "pointer" }}>
                    <input type="checkbox" name="text" value={c} style={{ width: "auto", margin: 0 }} /> {c}
                  </label>
                ))}
              </div>
              <textarea id="fb-text" name="text" rows={4} placeholder="Say it like you'd say it to a strategist. Quote the line if it helps." />
              <button type="submit" className="oa-btn">Teach Ore</button>
            </form>
            {brandRules.length > 0 && (
              <div className="oa-card">
                <h2>How Ore writes for you</h2>
                <div style={{ marginTop: 8 }}>
                  {brandRules.map((r) => (
                    <div key={r.index} className="oa-rule">
                      <span>{(() => { const t = r.text.replace(/\*\*/g, ""); return t.length > 200 ? t.slice(0, 200).replace(/\s+\S*$/, "") + "…" : t; })()}</span>
                    </div>
                  ))}
                </div>
                <Link href={`/app/${brand}/brand#rules`} className="oa-small" style={{ color: "var(--oa-cobalt)", fontWeight: 600, display: "inline-block", marginTop: 10 }}>
                  See every rule
                </Link>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
