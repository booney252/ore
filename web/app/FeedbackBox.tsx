import { giveFeedback } from "@/app/actions";

/** "How was this copy?": feedback on a doc, which Ore turns into lessons it follows from then on. */
export default function FeedbackBox({ brand, doc, about, back }: { brand: string; doc: string; about: string; back: string }) {
  return (
    <details className="feedback-box panel">
      <summary>
        <strong>Give feedback on this copy</strong>
        <span className="muted"> · Ore learns from it and won't make the same mistake twice</span>
      </summary>
      <form action={giveFeedback} className="tab-form">
        <input type="hidden" name="brand" value={brand} />
        <input type="hidden" name="doc" value={doc} />
        <input type="hidden" name="about" value={about} />
        <input type="hidden" name="back" value={back} />
        <label className="field">
          <span className="sr-only">Who's it from</span>
          <input name="who" placeholder="Who's it from? (you, the brand owner, a creator…)" maxLength={80} />
        </label>
        <label className="field">
          <span className="sr-only">Feedback</span>
          <textarea
            name="text"
            rows={6}
            required
            placeholder="What worked, what didn't, what you'd change. Paste the brand's notes as they are."
          />
        </label>
        <button type="submit" className="btn-primary">
          Send to Ore
        </button>
      </form>
    </details>
  );
}
