import Link from "next/link";
import { findMechanisms, pasteQuotes, refreshResearch, saveIngredients } from "@/app/actions";
import Markdown from "@/app/Markdown";
import MechanismPicker from "@/app/MechanismPicker";
import BrainMap from "@/app/BrainMap";
import { docLabel } from "@/app/dates";
import { brandName, readIngredients, readResearch, vocCounts } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Research({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ step?: string; queued?: string; pasted?: string; saved?: string; chosen?: string }>;
}) {
  const { brand } = await params;
  const { step, queued, pasted, saved, chosen } = await searchParams;
  const [name, research, voc, ing] = await Promise.all([
    brandName(brand),
    readResearch(brand),
    vocCounts(brand),
    readIngredients(brand),
  ]);
  const tab =
    step === "ingredients" || step === "mechanisms" || step === "quotes"
      ? step
      : research.steps.find((s) => s.file === step)?.file ?? "brief";
  const current = research.steps.find((s) => s.file === tab);
  const href = (t: string) => `/b/${brand}/research${t === "brief" ? "" : `?step=${t}`}`;
  const tabs = [
    { key: "brief", label: "Brief" },
    ...research.steps.map((s, i) => ({ key: s.file, label: s.label, n: i + 1 })),
    { key: "mechanisms", label: "Mechanisms" },
    { key: "ingredients", label: "Ingredients" },
    { key: "quotes", label: "Quotes" },
  ];
  const step1 = research.steps;
  const brainNodes = [
    { key: "quotes", label: "Customer quotes", sub: voc ? `${voc.total.toLocaleString()} real quotes` : "none yet", has: Boolean(voc?.total) },
    ...step1.map((st, i) => ({
      key: st.file,
      label: st.label,
      sub: `Research step ${i + 1}`,
      has: Boolean(st.text),
    })),
  ].map((n) => ({ ...n, side: "left" as const, href: href(n.key) }));
  const brainRight = [
    { key: "brief", label: "Unified brief", sub: research.brief ? "The brand brain" : "not built yet", has: Boolean(research.brief) },
    {
      key: "mechanisms",
      label: "Unique mechanisms",
      sub: ing.chosen.length ? `${ing.chosen.length} picked${ing.ranked ? ", ranked" : ""}` : ing.mechanisms ? "pick your favorites" : "not run yet",
      has: Boolean(ing.mechanisms),
    },
    {
      key: "ingredients",
      label: "Ingredient claims",
      sub: ing.claims ? `${ing.items.length} ingredients` : ing.items.length ? "waiting to run" : "if it has any",
      has: Boolean(ing.claims),
    },
  ].map((n) => ({ ...n, side: "right" as const, href: href(n.key) }));

  const notice = queued
    ? queued === "rank"
      ? `Saved ${ing.chosen.length} unique mechanisms. Ore will now rank them against your research brief, best first.`
      : queued === "ingredients"
      ? "Queued. Ore will search published studies for each ingredient and write the claims."
      : queued === "mechanisms"
        ? "Queued. Ore will write unique mechanism ideas from your research brief."
        : "Queued. Ore will re-pull customer quotes, re-run the research, then the unique mechanisms."
    : chosen
      ? ing.chosen.length
        ? `Saved ${ing.chosen.length} unique mechanism${ing.chosen.length > 1 ? "s" : ""}. Iterations, briefs and ingredient claims use ${ing.chosen.length > 1 ? "them" : "it"} from now on.`
        : "Cleared. No unique mechanism is saved."
      : pasted
        ? "Quotes saved. Refresh the research to use them."
        : saved
          ? "Saved. Add ingredients to get study-backed claims."
          : null;

  return (
    <main className="page research-page">
      <header className="research-head">
        <div>
          <p className="mono muted">{name}</p>
          <h1 className="display">Research</h1>
          <p className="muted research-meta">
            The brand brain every report, iteration and brief reads.
            {voc ? ` ${voc.total.toLocaleString()} customer quotes.` : ""}
            {research.date ? ` Last run ${docLabel(research.date).date}.` : ""}
          </p>
        </div>
        <form action={refreshResearch}>
          <input type="hidden" name="brand" value={brand} />
          <button type="submit" className="btn-quiet">
            Refresh research
          </button>
        </form>
      </header>

      <BrainMap nodes={[...brainNodes, ...brainRight]} active={tab} />

      <nav className="tabs research-tabs" aria-label="Research">
        {tabs.map((t) => (
          <Link key={t.key} href={href(t.key)} className={tab === t.key ? "on" : ""}>
            {"n" in t ? <span className="mono">{t.n}</span> : null} {t.label}
          </Link>
        ))}
      </nav>

      {notice && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          {notice}
        </p>
      )}

      <div className="read">
        {tab === "mechanisms" ? (
          <>
            <div className="tab-intro">
              <p className="muted">
                Why buyers failed before (the problem) and why your product is the fix (the solution),
                written for the awareness stage your research says to target. Tick the ones you like to save them.
              </p>
              <form action={findMechanisms}>
                <input type="hidden" name="brand" value={brand} />
                <button type="submit" className="btn-quiet" disabled={!research.brief}>
                  {ing.mechanisms ? "Re-run" : "Find unique mechanisms"}
                </button>
              </form>
            </div>
            {ing.ranked ? (
              <section className="ranked panel">
                <p className="mono muted">Your picks, ranked</p>
                <Markdown text={ing.ranked} />
              </section>
            ) : null}
            {ing.mechanisms && ing.ranked ? (
              <details className="all-ideas">
                <summary>All ideas · change your picks</summary>
                <MechanismPicker brand={brand} md={ing.mechanisms} chosen={ing.chosen} />
              </details>
            ) : ing.mechanisms ? (
              <MechanismPicker brand={brand} md={ing.mechanisms} chosen={ing.chosen} />
            ) : (
              <p className="empty">
                {research.brief
                  ? "None yet. Ore writes them from your research brief."
                  : "These come after the research brief."}
              </p>
            )}
          </>
        ) : tab === "ingredients" ? (
          <>
            <form action={saveIngredients} className="tab-intro tab-form">
              <input type="hidden" name="brand" value={brand} />
              <label className="field">
                <span className="muted">
                  If your product has ingredients, list them. Ore finds published studies for each one
                  and writes claims you can use in copy, with references.
                </span>
                <textarea
                  name="ingredients"
                  rows={4}
                  defaultValue={ing.items.join("\n")}
                  placeholder={"One per line, with the dose if you know it.\nAshwagandha root extract (600 mg)"}
                />
              </label>
              <button type="submit" className="btn-quiet">
                {ing.claims ? "Save and re-run" : "Find ingredient claims"}
              </button>
            </form>
            {ing.claims ? (
              <Markdown text={ing.claims} />
            ) : (
              <p className="empty">No ingredient claims yet.</p>
            )}
          </>
        ) : tab === "quotes" ? (
          <>
            <p className="quote-count">
              <span className="display">{voc ? voc.total.toLocaleString() : 0}</span>
              <span className="muted">
                customer quotes, word for word with sources: App Store reviews of every competitor app
                {voc?.pasted ? `, plus ${voc.pasted} you pasted` : ""}.
              </span>
            </p>
            <form action={pasteQuotes} className="tab-form">
              <input type="hidden" name="brand" value={brand} />
              <label className="field">
                <span className="muted">Add more: paste comments, reviews or DMs, with a blank line between each one.</span>
                <input name="source" placeholder="Source link (Reddit thread, TikTok…)" />
              </label>
              <label className="field">
                <span className="sr-only">Quotes</span>
                <textarea name="text" rows={8} required placeholder="Paste here" />
              </label>
              <button type="submit" className="btn-quiet">
                Save quotes
              </button>
            </form>
          </>
        ) : (current ? current.text : research.brief) ? (
          <Markdown text={(current ? current.text : research.brief)!} />
        ) : (
          <p className="empty">
            {current
              ? "This step hasn't run yet. It runs when the research is built or refreshed."
              : "No research brief yet. It's built automatically when a brand is set up."}
          </p>
        )}
      </div>
    </main>
  );
}
