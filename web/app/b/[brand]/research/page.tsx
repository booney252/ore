import Link from "next/link";
import { pasteQuotes, refreshResearch } from "@/app/actions";
import Markdown from "@/app/Markdown";
import { docLabel } from "@/app/dates";
import { brandName, readResearch, vocCounts } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Research({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ step?: string; queued?: string; pasted?: string }>;
}) {
  const { brand } = await params;
  const { step, queued, pasted } = await searchParams;
  const [name, research, voc] = await Promise.all([
    brandName(brand),
    readResearch(brand),
    vocCounts(brand),
  ]);
  const current = research.steps.find((s) => s.file === step);
  const text = current ? current.text : research.brief;

  return (
    <main className="page with-side">
      <div className="read">
        <header className="page-head">
          <p className="mono muted">{name}</p>
          <h1 className="display">Research</h1>
          <p className="lede">
            The brand brain every report, script and brief reads. Built from your four research
            prompts: competitors, psychographics and awareness, then one unified brief.
          </p>
        </header>

        {queued && (
          <p className="notice">
            <span className="dot emerald" aria-hidden="true" />
            Queued. The worker re-pulls customer quotes and re-runs all four prompts.
          </p>
        )}

        <nav className="tabs" aria-label="Research steps">
          <Link href={`/b/${brand}/research`} className={!current ? "on" : ""}>
            Unified brief
          </Link>
          {research.steps.map((s, i) => (
            <Link
              key={s.file}
              href={`/b/${brand}/research?step=${s.file}`}
              className={current?.file === s.file ? "on" : ""}
            >
              <span className="mono">{i + 1}</span> {s.label}
            </Link>
          ))}
        </nav>

        {text ? (
          <Markdown text={text} />
        ) : (
          <p className="empty">
            {current
              ? "This step hasn't run yet. It runs when the research is built or refreshed."
              : "No research brief yet. It's built automatically when a brand is set up."}
          </p>
        )}
      </div>

      <aside className="side">
        <p className="mono muted">Customer quotes</p>
        <h2>{voc ? `${voc.total.toLocaleString()} quotes` : "None yet"}</h2>
        <p className="muted side-note">
          App Store reviews of every competitor app
          {voc?.pasted ? `, plus ${voc.pasted} you pasted` : ""}. Exact words, with sources.
          {research.date ? ` Last research run ${docLabel(research.date).date}.` : ""}
        </p>
        <form action={refreshResearch}>
          <input type="hidden" name="brand" value={brand} />
          <button type="submit" className="btn-primary">
            Refresh research
          </button>
        </form>

        <form action={pasteQuotes} className="side-form paste">
          <p className="mono muted">Add customer words</p>
          {pasted && <p className="ok">Saved. Refresh the research to use it.</p>}
          <input type="hidden" name="brand" value={brand} />
          <label className="field">
            <span className="sr-only">Source link</span>
            <input name="source" placeholder="Source link (Reddit thread, TikTok…)" />
          </label>
          <label className="field">
            <span className="sr-only">Quotes</span>
            <textarea
              name="text"
              rows={7}
              required
              placeholder="Paste comments, reviews or DMs. Leave a blank line between each one."
            />
          </label>
          <button type="submit" className="btn-primary emerald">
            Save quotes
          </button>
        </form>
      </aside>
    </main>
  );
}
