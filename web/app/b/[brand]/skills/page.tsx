import { giveFeedback } from "@/app/actions";
import SkillTree from "@/app/SkillTree";
import { brandName } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { craftSuggestions, listFeedback, readLessons } from "@/lib/lessons";
import { current } from "@/lib/session";
import { grow } from "@/lib/skilltree";

export const dynamic = "force-dynamic";

const SKILL_NOTICE: Record<string, string> = {
  save: "Skill saved.",
  delete: "Skill deleted.",
  confirm: "Confirmed. It's a settled rule now.",
  approve: "Unlocked for every brand.",
  dismiss: "Dismissed. It stays out of the shared craft skills.",
  stale: "That skill changed since the page loaded. Here's the latest; try again.",
};

export default async function Skills({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ feedback?: string; skill?: string }>;
}) {
  const { brand } = await params;
  const { feedback, skill } = await searchParams;
  const [name, lessons, items, jobs, suggested, who] = await Promise.all([
    brandName(brand),
    readLessons(brand),
    listFeedback(brand),
    listJobs(brand, 10, ["lessons"]),
    craftSuggestions(brand),
    current(),
  ]);
  const pending = suggested.filter((s) => s.status === "pending");
  const tree = grow(lessons.brand, lessons.craft, pending);
  const learning = jobs.some((j) => ["pending", "running"].includes(j.status ?? ""));
  const notice =
    feedback === "sent"
      ? "Got it. Ore is turning that feedback into new skills; they grow on the tree in a minute or two."
      : feedback === "empty"
        ? "Write some feedback first."
        : skill
          ? (SKILL_NOTICE[skill] ?? null)
          : null;

  return (
    <main className="page lessons-page">
      {learning ? <meta httpEquiv="refresh" content="8" /> : null}
      <header className="page-head">
        <p className="mono muted">{name}</p>
        <h1 className="display">Skill Tree</h1>
        <p className="lede">
          What Ore has learned about writing from your feedback. Everything it writes follows these skills. Teach it
          more below and the tree grows.
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

      {pending.length ? (
        <p className="notice">
          <span className="dot diamond" aria-hidden="true" />
          Ore thinks {pending.length} of {name}'s skills hold for every brand. Click the dashed ones to approve or
          dismiss them.
        </p>
      ) : null}

      <section className="panel skilltree-panel">
        <SkillTree tree={tree} brand={brand} brandName={name} owner={Boolean(who?.owner)} />
        <ul className="st-legend mono">
          <li>
            <span className="st-key brand" /> {name} only
          </li>
          <li>
            <span className="st-key craft" /> Craft, every brand
          </li>
          <li>
            <span className="st-key pending" /> Ready to unlock
          </li>
          <li>
            <span className="st-key decide" /> Needs your call
          </li>
          <li className="st-hint">Click a skill to read, edit or decide it</li>
        </ul>
      </section>

      <section className="block first-after-tree">
        <h2>Teach Ore</h2>
        <form action={giveFeedback} className="tab-form panel feedback-form">
          <input type="hidden" name="brand" value={brand} />
          <input type="hidden" name="back" value={`/b/${brand}/skills`} />
          <label className="field">
            <span className="sr-only">Who's it from</span>
            <input name="who" placeholder="Who's it from? (you, the brand owner, a creator…)" maxLength={80} />
          </label>
          <label className="field">
            <span className="sr-only">What it's about</span>
            <input
              name="about"
              placeholder="What's it about? (e.g. the 3 creator briefs from last week)"
              maxLength={200}
            />
          </label>
          <label className="field">
            <span className="sr-only">Feedback</span>
            <textarea name="text" rows={5} required placeholder="Paste the feedback as it is." />
          </label>
          <button type="submit" className="btn-primary">
            Send to Ore
          </button>
        </form>
      </section>

      <details className="block feedback-history">
        <summary>
          <h2>Feedback so far</h2>
          <span className="muted small">{items.length}</span>
        </summary>
        {items.length ? (
          <ul className="feedback-list">
            {items.map((f) => (
              <li key={f.id} className="panel">
                <p className="mono muted small">
                  {f.who || "Feedback"} ·{" "}
                  {new Date(f.added).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
      </details>
    </main>
  );
}
