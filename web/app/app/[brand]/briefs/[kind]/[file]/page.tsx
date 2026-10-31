import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import { brandName, checkFile, readDoc, type Kind } from "@/lib/brands";
import { readLessons, rules } from "@/lib/lessons";
import { oaFeedback } from "../../../../actions";
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
  const [name, md, lessons] = await Promise.all([brandName(brand), readDoc(brand, kind as Kind, file), readLessons(brand)]);
  if (!md) notFound();
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "") ?? "Brief";
  const brandRules = rules(lessons.brand).slice(-6).reverse();
  return (
    <>
      <Band brand={brand} name={name} label={kind === "briefs" ? "Creative brief" : "Scripts"} title={title} />
      <main className="oa-main">
        <div className="oa-wrap oa-split">
          <article className="oa-card oa-doc">
            <Markdown text={md.replace(/^#\s+.+\n/m, "")} />
          </article>
          <aside className="oa-sticky">
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
