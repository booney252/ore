import { giveFeedback } from "@/app/actions";
import { listFeedback } from "@/lib/lessons";

/** "What would you change?": feedback on a doc. Ore replies, and learns rules it follows from then on. */
export default async function FeedbackBox({ brand, doc, about }: { brand: string; doc: string; about: string }) {
  const here = (await listFeedback(brand)).filter((f) => f.doc === doc).reverse();
  const waiting = here.some((f) => !f.learned && Date.now() - Date.parse(f.added) < 15 * 60_000);
  const back = `/b/${brand}/${doc}`;
  return (
    <section id="feedback" className="feedback-box panel">
      {waiting ? <meta httpEquiv="refresh" content="8" /> : null}
      <h2>What would you change?</h2>
      <p className="muted small">Ore replies, and remembers it every time it writes for this brand.</p>
      {here.length ? (
        <ul className="feedback-thread">
          {here.map((f) => (
            <li key={f.id}>
              <p className="you">
                <span className="mono">{f.who || "You"}</span>
                {f.text}
              </p>
              <p className={`ore-reply${f.learned ? "" : " waiting"}`}>
                <span className="mono">Ore</span>
                {f.learned ? f.reply || "Got it. I'll follow this from now on." : "Reading it…"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={giveFeedback} className="tab-form">
        <input type="hidden" name="brand" value={brand} />
        <input type="hidden" name="doc" value={doc} />
        <input type="hidden" name="about" value={about} />
        <input type="hidden" name="back" value={back} />
        <label className="field">
          <span className="sr-only">Feedback</span>
          <textarea
            name="text"
            rows={4}
            required
            placeholder="What worked, what didn't, what you'd change. Paste the brand's notes as they are."
          />
        </label>
        <div className="feedback-row">
          <label className="field">
            <span className="sr-only">Who's it from</span>
            <input name="who" placeholder="Who's it from? (optional)" maxLength={80} />
          </label>
          <button type="submit" className="btn-primary">
            Send to Ore
          </button>
        </div>
      </form>
    </section>
  );
}
