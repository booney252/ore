import { editLessons, giveFeedback } from "@/app/actions";
import Markdown from "@/app/Markdown";
import { brandName } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { listFeedback, readLessons } from "@/lib/lessons";

export const dynamic = "force-dynamic";

export default async function Lessons({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ feedback?: string; saved?: string; edit?: string }>;
}) {
  const { brand } = await params;
  const { feedback, saved, edit } = await searchParams;
  const [name, lessons, items, jobs] = await Promise.all([
    brandName(brand),
    readLessons(brand),
    listFeedback(brand),
    listJobs(brand, 10, ["lessons"]),
  ]);
  const learning = jobs.some((j) => ["pending", "running"].includes(j.status ?? ""));
  const notice =
    feedback === "sent"
      ? "Got it. Ore is turning that feedback into lessons; they show up here in a minute or two."
      : feedback === "empty"
        ? "Write some feedback first."
        : saved
          ? "Saved."
          : null;

  return (
    <main className="page lessons-page">
      {learning ? <meta httpEquiv="refresh" content="8" /> : null}
      <header className="page-head">
        <p className="mono muted">{name}</p>
        <h1 className="display">Copy lessons</h1>
        <p className="lede">
          What Ore has learned from feedback on its copy. Every report, iteration, brief and script follows
          these. Give feedback on any brief or iteration, or paste it below.
        </p>
      </header>

      {notice && (
        <p className="notice">
          <span className="dot emerald" aria-hidden="true" />
          {notice}
        </p>
      )}
      {learning && (
        <p className="notice">
          <span className="dot ruby pulse" aria-hidden="true" />
          Ore is learning from new feedback…
        </p>
      )}

      <div className="lessons-grid">
        {(["brand", "craft"] as const).map((which) => {
          const text = lessons[which];
          const editing = edit === which;
          return (
            <section key={which} className="panel lessons-col">
              <div className="block-head">
                <h2>{which === "brand" ? `For ${name}` : "Craft, for every brand"}</h2>
                {!editing && text ? (
                  <a href={`?edit=${which}`} className="link-quiet">
                    Edit
                  </a>
                ) : null}
              </div>
              <p className="muted small">
                {which === "brand"
                  ? "This brand only: the owner's taste, the product's real why, words to use or avoid."
                  : "Good copy for any brand. Shared by every brand you run in Ore."}
              </p>
              {editing ? (
                <form action={editLessons} className="tab-form">
                  <input type="hidden" name="brand" value={brand} />
                  <input type="hidden" name="which" value={which} />
                  <textarea name="text" rows={18} defaultValue={text} />
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                </form>
              ) : text ? (
                <Markdown text={text} />
              ) : (
                <p className="empty">Nothing yet. It fills up as you give feedback.</p>
              )}
            </section>
          );
        })}
      </div>

      <section className="block">
        <h2>Add feedback</h2>
        <form action={giveFeedback} className="tab-form panel feedback-form">
          <input type="hidden" name="brand" value={brand} />
          <input type="hidden" name="back" value={`/b/${brand}/lessons`} />
          <label className="field">
            <span className="sr-only">Who's it from</span>
            <input name="who" placeholder="Who's it from? (you, the brand owner, a creator…)" maxLength={80} />
          </label>
          <label className="field">
            <span className="sr-only">What it's about</span>
            <input name="about" placeholder="What's it about? (e.g. the 3 creator briefs from last week)" maxLength={200} />
          </label>
          <label className="field">
            <span className="sr-only">Feedback</span>
            <textarea name="text" rows={8} required placeholder="Paste the feedback as it is." />
          </label>
          <button type="submit" className="btn-primary">
            Send to Ore
          </button>
        </form>
      </section>

      <section className="block">
        <h2>Feedback so far</h2>
        {items.length ? (
          <ul className="feedback-list">
            {items.map((f) => (
              <li key={f.id} className="panel">
                <p className="mono muted small">
                  {f.who || "Feedback"} · {new Date(f.added).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {f.about ? ` · ${f.about}` : f.doc ? ` · ${f.doc}` : ""} · {f.learned ? "learned" : "learning…"}
                </p>
                <details>
                  <summary>{f.text.split("\n")[0].slice(0, 140)}</summary>
                  <pre className="brain-text">{f.text}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No feedback yet.</p>
        )}
      </section>
    </main>
  );
}
