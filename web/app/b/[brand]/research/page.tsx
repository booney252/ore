import Link from "next/link";
import { pasteQuotes, refreshResearch, saveIngredients } from "@/app/actions";
import Markdown from "@/app/Markdown";
import { docLabel } from "@/app/dates";
import { brandName, readIngredients, readResearch, vocCounts } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Research({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ step?: string; queued?: string; pasted?: string; saved?: string }>;
}) {
  const { brand } = await params;
  const { step, queued, pasted, saved } = await searchParams;
  const [name, research, voc, ing] = await Promise.all([
    brandName(brand),
    readResearch(brand),
    vocCounts(brand),
    readIngredients(brand),
  ]);
  const onIngredients = step === "ingredients";
  const current = research.steps.find((s) => s.file === step);
  const text = onIngredients ? ing.claims : current ? current.text : research.brief;

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
            {queued === "ingredients"
              ? "Queued. The worker searches published studies for each ingredient and writes the claims."
              : "Queued. The worker re-pulls customer quotes and re-runs all four prompts."}
          </p>
        )}
        {saved && <p className="notice quiet">Saved. Add ingredients to get study-backed claims.</p>}

        <nav className="tabs" aria-label="Research steps">
          <Link href={`/b/${brand}/research`} className={!current && !onIngredients ? "on" : ""}>
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
          {ing.items.length || ing.claims ? (
            <Link href={`/b/${brand}/research?step=ingredients`} className={onIngredients ? "on" : ""}>
              Ingredient claims
            </Link>
          ) : null}
        </nav>

        {text ? (
          <Markdown text={text} />
        ) : (
          <p className="empty">
            {onIngredients
              ? "No ingredient claims yet. They're written once the ingredients are saved and the worker runs."
              : current
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

        <form action={saveIngredients} className="side-form paste">
          <p className="mono muted">Ingredients (if it has them)</p>
          <p className="muted side-note">
            Ore finds published studies for each one (PubMed and journals, human trials first) and
            writes claims you can use in copy, with references.
          </p>
          <input type="hidden" name="brand" value={brand} />
          <label className="field">
            <span className="sr-only">Ingredients</span>
            <textarea
              name="ingredients"
              rows={5}
              defaultValue={ing.items.join("\n")}
              placeholder={"One per line, with the dose if you know it.\nAshwagandha root extract (600 mg)"}
            />
          </label>
          <label className="field">
            <span className="sr-only">Unique mechanism</span>
            <textarea
              name="mechanism"
              rows={3}
              defaultValue={ing.mechanism}
              placeholder="Unique mechanism (optional): what your copy says makes it work."
            />
          </label>
          <button type="submit" className="btn-primary">
            {ing.claims ? "Save and re-run claims" : "Find ingredient claims"}
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
