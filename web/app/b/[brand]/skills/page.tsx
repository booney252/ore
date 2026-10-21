import { editLessons, giveFeedback, reviewCraft } from "@/app/actions";
import SkillTree from "@/app/SkillTree";
import { brandName } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { craftSuggestions, listFeedback, readLessons } from "@/lib/lessons";
import { grow } from "@/lib/skilltree";

export const dynamic = "force-dynamic";

export default async function Skills({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ feedback?: string; saved?: string; edit?: string; approved?: string; dismissed?: string }>;
}) {
  const { brand } = await params;
  const { feedback, saved, edit, approved, dismissed } = await searchParams;
  const [name, lessons, items, jobs, suggested] = await Promise.all([
    brandName(brand),
    readLessons(brand),
    listFeedback(brand),
    listJobs(brand, 10, ["lessons"]),
    craftSuggestions(brand),
  ]);
  const pending = suggested.filter((s) => s.status === "pending");
  const tree = grow(lessons.brand, lessons.craft, pending);
  const learning = jobs.some((j) => ["pending", "running"].includes(j.status ?? ""));
  const editing = edit === "brand" || edit === "craft" ? edit : null;
  const notice =
    feedback === "sent"
      ? "Got it. Ore is turning that feedback into new skills; they grow on the tree in a minute or two."
      : feedback === "empty"
        ? "Write some feedback first."
        : saved
          ? "Saved."
          : approved !== undefined
            ? `${approved} craft skill${approved === "1" ? "" : "s"} unlocked for every brand${Number(dismissed) ? `, ${dismissed} dismissed` : ""}.`
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

      <section className="panel skilltree-panel">
        <SkillTree tree={tree} brandName={name} />
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
          <li className="st-edit">
            <span className="st-hint">Click a skill to read it</span>
            <a href="?edit=brand" className="link-quiet">
              Edit {name}'s
            </a>
            <a href="?edit=craft" className="link-quiet">
              Edit craft
            </a>
          </li>
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

      {editing ? (
        <section className="block">
          <h2>{editing === "brand" ? `Edit ${name}'s skills` : "Edit craft skills (every brand)"}</h2>
          <p className="muted small">One rule per bullet. The source in [brackets] at the end of a rule is optional.</p>
          <form action={editLessons} className="tab-form">
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="which" value={editing} />
            <textarea name="text" rows={20} defaultValue={lessons[editing]} />
            <button type="submit" className="btn-primary">
              Save
            </button>
          </form>
        </section>
      ) : null}

      {pending.length ? (
        <section className="block">
          <h2>Ready to unlock</h2>
          <p className="muted">
            From {name}'s feedback, Ore thinks these hold for any brand. Approve the ones that do and they unlock for
            every brand. Dismiss the ones that are really just {name}'s taste (those still live in {name}'s skills).
          </p>
          <form action={reviewCraft} className="craft-review">
            <input type="hidden" name="brand" value={brand} />
            <ul className="suggestion-list">
              {pending.map((s) => (
                <li key={s.id} id={`s-${s.id}`} className="panel">
                  <p>{s.text}</p>
                  <div className="choice-row" role="radiogroup" aria-label="Approve or dismiss">
                    <label className="choice">
                      <input type="radio" name={`s_${s.id}`} value="approve" />
                      <span>Approve</span>
                    </label>
                    <label className="choice">
                      <input type="radio" name={`s_${s.id}`} value="dismiss" />
                      <span>Dismiss</span>
                    </label>
                    <label className="choice">
                      <input type="radio" name={`s_${s.id}`} value="later" defaultChecked />
                      <span>Later</span>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <button type="submit" className="btn-primary">
              Save decisions
            </button>
          </form>
        </section>
      ) : null}

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
