import Link from "next/link";
import {
  addToBrain,
  brandRuleAction,
  findMechanisms,
  giveFeedback,
  pasteQuotes,
  refreshResearch,
  removeFromBrain,
  saveIngredients,
} from "@/app/actions";
import Markdown from "@/app/Markdown";
import MechanismPicker from "@/app/MechanismPicker";
import BrainMap from "@/app/BrainMap";
import { docLabel } from "@/app/dates";
import { brainItems } from "@/lib/brain";
import { brandName, readIngredients, readResearch, vocCounts } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { listFeedback, readLessons, rules } from "@/lib/lessons";

export const dynamic = "force-dynamic";

export default async function Research({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{
    step?: string;
    queued?: string;
    pasted?: string;
    saved?: string;
    chosen?: string;
    brain?: string;
    brainerror?: string;
    feedback?: string;
    rule?: string;
  }>;
}) {
  const { brand } = await params;
  const { step, queued, pasted, saved, chosen, brain, brainerror, feedback, rule } = await searchParams;
  const [name, research, voc, ing, added, lessons, feedbackItems, lessonJobs] = await Promise.all([
    brandName(brand),
    readResearch(brand),
    vocCounts(brand),
    readIngredients(brand),
    brainItems(brand),
    readLessons(brand),
    listFeedback(brand),
    listJobs(brand, 10, ["lessons"]),
  ]);
  const learnedRules = rules(lessons.brand);
  const learning = lessonJobs.some((j) => ["pending", "running"].includes(j.status ?? ""));
  const tab =
    step === "ingredients" || step === "mechanisms" || step === "quotes" || step === "notes" || step === "learned"
      ? step
      : (research.steps.find((s) => s.file === step)?.file ?? "brief");
  const current = research.steps.find((s) => s.file === tab);
  const href = (t: string) => `/b/${brand}/research${t === "brief" ? "" : `?step=${t}`}`;
  const tabs = [
    { key: "brief", label: "Brief" },
    ...research.steps.map((s, i) => ({ key: s.file, label: s.label, n: i + 1 })),
    { key: "mechanisms", label: "Mechanisms" },
    { key: "ingredients", label: "Ingredients" },
    { key: "quotes", label: "Quotes" },
    { key: "notes", label: "Your notes" },
    { key: "learned", label: "What Ore learned" },
  ];
  const step1 = research.steps;
  const brainNodes = [
    {
      key: "quotes",
      label: "Customer quotes",
      sub: voc ? `${voc.total.toLocaleString()} real quotes` : "none yet",
      has: Boolean(voc?.total),
    },
    ...step1.map((st, i) => ({
      key: st.file,
      label: st.label,
      sub: `Research step ${i + 1}`,
      has: Boolean(st.text),
    })),
    {
      key: "notes",
      label: "Your notes",
      sub: added.length ? `${added.length} added by you` : "add anything",
      has: added.length > 0,
    },
  ].map((n) => ({ ...n, side: "left" as const, href: href(n.key) }));
  const brainRight = [
    {
      key: "brief",
      label: "Unified brief",
      sub: research.brief ? "The brand brain" : "not built yet",
      has: Boolean(research.brief),
    },
    {
      key: "mechanisms",
      label: "Unique mechanisms",
      sub: ing.chosen.length
        ? `${ing.chosen.length} picked${ing.ranked ? ", ranked" : ""}`
        : ing.mechanisms
          ? "pick your favorites"
          : "not run yet",
      has: Boolean(ing.mechanisms),
    },
    {
      key: "ingredients",
      label: "Ingredient claims",
      sub: ing.claims ? `${ing.items.length} ingredients` : ing.items.length ? "waiting to run" : "if it has any",
      has: Boolean(ing.claims),
    },
    {
      key: "learned",
      label: "What Ore learned",
      sub: learnedRules.length ? `${learnedRules.length} rules` : "from your feedback",
      has: learnedRules.length > 0,
    },
  ].map((n) => ({ ...n, side: "right" as const, href: href(n.key) }));

  const learnNotice =
    feedback === "sent"
      ? "Got it. Ore is reading your feedback; its reply and any new rules show up here in a minute or two."
      : feedback === "empty"
        ? "Write some feedback first."
        : rule === "edit"
          ? "Rule saved."
          : rule === "delete"
            ? "Rule removed. Ore won't follow it any more."
            : rule === "stale"
              ? "That rule changed since the page loaded. Here's the latest; try again."
              : null;
  const brainNotice =
    learnNotice ??
    (brainerror === "size"
      ? "That file is over 8 MB. Try a smaller one, or paste the part that matters."
      : brainerror === "type"
        ? "Ore can read PDFs, Word docs (.docx), and text, Markdown or CSV files."
        : brainerror === "empty"
          ? "Ore couldn't find any text in that file (a scanned PDF?). Paste the text instead."
          : brain === "added"
            ? "Added to the brand brain. Every report, iteration, brief and script reads it from now on. Refresh the research to work it into the brief too."
            : brain === "removed"
              ? "Removed from the brand brain."
              : brain === "nothing"
                ? "Type something or attach a file first."
                : null);
  const notice =
    brainNotice ??
    (queued
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
            : null);

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
                Why buyers failed before (the problem) and why your product is the fix (the solution), written for the
                awareness stage your research says to target. Tick the ones you like to save them.
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
                  If your product has ingredients, list them. Ore finds published studies for each one and writes claims
                  you can use in copy, with references.
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
            {ing.claims ? <Markdown text={ing.claims} /> : <p className="empty">No ingredient claims yet.</p>}
          </>
        ) : tab === "notes" ? (
          <>
            <form action={addToBrain} className="tab-form brain-add">
              <input type="hidden" name="brand" value={brand} />
              <p className="muted">
                Tell Ore anything about the brand, or attach a doc: a new price, a word to never use, a sales call
                summary, a strategy deck, a customer survey. Every report, iteration, brief and script reads it, and
                where it disagrees with the research, your words win.
              </p>
              <label className="field">
                <span className="sr-only">Title</span>
                <input name="title" placeholder="Title (optional)" maxLength={120} />
              </label>
              <label className="field">
                <span className="sr-only">Note</span>
                <textarea
                  name="note"
                  rows={5}
                  placeholder="e.g. We just dropped the price to $9.99 a month. Never call it a 'shot', say 'your weekly dose'."
                />
              </label>
              <div className="brain-add-row">
                <label className="file-pick">
                  <input type="file" name="file" accept=".pdf,.docx,.md,.markdown,.txt,.csv,.json,.html,text/*" />
                  <span className="muted">PDF, Word, text or CSV, up to 8 MB</span>
                </label>
                <button type="submit" className="btn-primary">
                  Add to the brain
                </button>
              </div>
            </form>
            {added.length ? (
              <ul className="brain-items">
                {added.map((it) => (
                  <li key={it.id} className="panel">
                    <div className="brain-item-head">
                      <div>
                        <strong>{it.title}</strong>
                        <p className="mono muted">
                          {it.kind === "doc" ? `Document · ${it.filename}` : "Note"} ·{" "}
                          {new Date(it.added).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                          {it.text.length.toLocaleString()} characters
                          {it.source_key ? " (a digest; the full file is kept)" : ""}
                        </p>
                      </div>
                      <form action={removeFromBrain}>
                        <input type="hidden" name="brand" value={brand} />
                        <input type="hidden" name="id" value={it.id} />
                        <button type="submit" className="btn-quiet btn-small">
                          Remove
                        </button>
                      </form>
                    </div>
                    <details>
                      <summary className="muted">Show what Ore reads</summary>
                      <pre className="brain-text">
                        {it.text.slice(0, 4000)}
                        {it.text.length > 4000 ? "\n…" : ""}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Nothing added yet.</p>
            )}
          </>
        ) : tab === "learned" ? (
          <>
            {learning ? <meta httpEquiv="refresh" content="8" /> : null}
            <p className="muted tab-intro">
              The rules Ore follows whenever it writes for {name}, learned from feedback on its copy. Give feedback on
              any iteration or brief, or paste it below. Remove anything that's wrong.
            </p>
            {learnedRules.length ? (
              <ol className="rule-list">
                {learnedRules.map((r) => (
                  <li key={`${r.index}-${r.raw.length}`} className="panel">
                    <p>{r.text}</p>
                    <div className="rule-foot">
                      <small className="muted">{r.source}</small>
                      <details className="rule-edit">
                        <summary className="link-quiet">Edit</summary>
                        <form action={brandRuleAction} className="tab-form">
                          <input type="hidden" name="brand" value={brand} />
                          <input type="hidden" name="op" value="edit" />
                          <input type="hidden" name="index" value={r.index} />
                          <input type="hidden" name="raw" value={r.raw} />
                          <input type="hidden" name="source" value={r.source} />
                          <textarea name="text" rows={4} defaultValue={r.text} required />
                          <button type="submit" className="btn-primary btn-small">
                            Save
                          </button>
                        </form>
                      </details>
                      <form action={brandRuleAction}>
                        <input type="hidden" name="brand" value={brand} />
                        <input type="hidden" name="op" value="delete" />
                        <input type="hidden" name="index" value={r.index} />
                        <input type="hidden" name="raw" value={r.raw} />
                        <button type="submit" className="link-quiet">
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">Nothing yet. Ore learns as you give it feedback.</p>
            )}

            <h2 id="feedback" className="tab-sub">
              Give Ore feedback
            </h2>
            <form action={giveFeedback} className="tab-form panel feedback-form">
              <input type="hidden" name="brand" value={brand} />
              <input type="hidden" name="back" value={`/b/${brand}/research?step=learned`} />
              <label className="field">
                <span className="sr-only">Who's it from</span>
                <input name="who" placeholder="Who's it from? (you, the brand owner, a creator…)" maxLength={80} />
              </label>
              <label className="field">
                <span className="sr-only">Feedback</span>
                <textarea
                  name="text"
                  rows={5}
                  required
                  placeholder="What would you change? Paste notes on any copy Ore wrote, as they are."
                />
              </label>
              <button type="submit" className="btn-primary">
                Send to Ore
              </button>
            </form>

            {feedbackItems.length ? (
              <ul className="feedback-list">
                {feedbackItems.slice(0, 8).map((f) => (
                  <li key={f.id} className="panel">
                    <p className="mono muted small">
                      {f.who || "Feedback"} ·{" "}
                      {new Date(f.added).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {f.about ? ` · ${f.about}` : f.doc ? ` · ${f.doc}` : ""}
                    </p>
                    <details>
                      <summary>{f.text.split("\n")[0].slice(0, 140)}</summary>
                      <pre className="brain-text">{f.text}</pre>
                    </details>
                    <p className={`ore-reply${f.learned ? "" : " waiting"}`}>
                      <span className="mono">Ore</span>
                      {f.learned ? f.reply || "Got it. I've folded this into the rules above." : "Reading it…"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
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
                <span className="muted">
                  Add more: paste comments, reviews or DMs, with a blank line between each one.
                </span>
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
