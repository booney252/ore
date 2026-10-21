import Link from "next/link";
import { playbookAction } from "@/app/actions";
import LogOut from "@/app/LogOut";
import Wordmark from "@/app/Wordmark";
import { CRAFT_KEY, playbookInbox, rules } from "@/lib/lessons";
import { requireOwner } from "@/lib/session";
import { readText } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  add: "Added to the playbook. Every brand follows it from now on.",
  reword: "Reworded and added to the playbook.",
  skip: "Skipped. It stays with that brand only.",
  edit: "Rule saved.",
  delete: "Rule removed from the playbook.",
  new: "Rule added to the playbook.",
  stale: "That rule changed since the page loaded. Here's the latest; try again.",
};

/**
 * Ore's playbook (owner only): the copywriting rules every brand and every user gets. Strategists'
 * feedback on any brand can suggest a rule; it lands in the inbox here and joins only if you add it.
 */
export default async function Playbook({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  await requireOwner();
  const { done } = await searchParams;
  const [md, inbox] = await Promise.all([readText(CRAFT_KEY), playbookInbox()]);
  const list = rules(md ?? "");

  return (
    <div className="home-wrap">
      <header className="home-top">
        <Wordmark />
        <nav className="studio-nav">
          <Link href="/" className="link-quiet">
            All brands
          </Link>
          <LogOut />
        </nav>
      </header>

      <main className="page playbook-page">
        <header className="page-head">
          <p className="mono muted">Only you see this</p>
          <h1 className="display">Ore's playbook</h1>
          <p className="lede">
            The copywriting rules Ore follows for every brand and every user. When a strategist's feedback teaches
            something that holds for any brand, it shows up in the inbox. Nothing joins the playbook unless you add it.
          </p>
        </header>

        {done && DONE[done] && (
          <p className="notice">
            <span className="dot emerald" aria-hidden="true" />
            {DONE[done]}
          </p>
        )}

        <section className="block">
          <h2>
            Inbox <span className="muted small mono">{inbox.length}</span>
          </h2>
          {inbox.length ? (
            <ul className="rule-list">
              {inbox.map((s) => (
                <li key={`${s.brand}-${s.id}`} className="panel">
                  <p>{s.text.replace(/\s*\[[^\]]+\]\s*$/, "")}</p>
                  <div className="rule-foot">
                    <small className="muted">From {s.brandName}'s feedback</small>
                    <form action={playbookAction}>
                      <input type="hidden" name="op" value="add" />
                      <input type="hidden" name="brand" value={s.brand} />
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="btn-primary btn-small">
                        Add to playbook
                      </button>
                    </form>
                    <details className="rule-edit">
                      <summary className="link-quiet">Reword</summary>
                      <form action={playbookAction} className="tab-form">
                        <input type="hidden" name="op" value="reword" />
                        <input type="hidden" name="brand" value={s.brand} />
                        <input type="hidden" name="id" value={s.id} />
                        <textarea name="text" rows={4} defaultValue={s.text} required />
                        <button type="submit" className="btn-primary btn-small">
                          Add reworded
                        </button>
                      </form>
                    </details>
                    <form action={playbookAction}>
                      <input type="hidden" name="op" value="skip" />
                      <input type="hidden" name="brand" value={s.brand} />
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="link-quiet">
                        Skip
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Nothing waiting.</p>
          )}
        </section>

        <section className="block">
          <h2>
            The playbook <span className="muted small mono">{list.length}</span>
          </h2>
          {list.length ? (
            <ol className="rule-list numbered">
              {list.map((r) => (
                <li key={`${r.index}-${r.raw.length}`} className="panel">
                  <p>{r.text}</p>
                  <div className="rule-foot">
                    <small className="muted">{r.source}</small>
                    <details className="rule-edit">
                      <summary className="link-quiet">Edit</summary>
                      <form action={playbookAction} className="tab-form">
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
                    <form action={playbookAction}>
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
            <p className="empty">Empty so far.</p>
          )}
          <form action={playbookAction} className="tab-form panel playbook-new">
            <input type="hidden" name="op" value="new" />
            <input type="hidden" name="index" value={list.length} />
            <input type="hidden" name="raw" value="" />
            <label className="field">
              <span className="sr-only">New rule</span>
              <textarea
                name="text"
                rows={3}
                required
                placeholder="Write a rule of your own, e.g. Never open on the product name."
              />
            </label>
            <button type="submit" className="btn-primary">
              Add rule
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
