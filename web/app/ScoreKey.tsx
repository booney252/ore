import Grade from "@/app/Grade";
import { PART_SCALES, VERDICTS } from "@/lib/score";

/** "What do the grades mean?": the five grades and how each ad earns one. */
export default function ScoreKey() {
  return (
    <details className="score-key">
      <summary>What do the grades mean?</summary>
      <div className="score-key-body">
        <p className="muted">
          Nobody keeps paying for an ad that loses money. So the grade starts with how long the ad has been live,
          then moves up or down one for the other two signs.
        </p>
        <ul className="score-key-parts">
          {PART_SCALES.map((p) => (
            <li key={p.label}>
              <strong>{p.label}</strong> <span className="muted">{p.effect}:</span>
              <span className="muted">{p.scale}</span>
            </li>
          ))}
        </ul>
        <ul>
          {VERDICTS.map((v) => (
            <li key={v.grade}>
              <Grade g={v.grade} size="sm" />
              <span>
                <strong>{v.verdict}.</strong> <span className="muted">{v.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">It's a signal from public data, not their sales numbers.</p>
      </div>
    </details>
  );
}
