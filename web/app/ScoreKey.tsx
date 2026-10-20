import Grade from "@/app/Grade";
import { ORGANIC_SCALES, ORGANIC_VERDICTS, PART_SCALES, VERDICTS } from "@/lib/score";

/** "What do the grades mean?": the five grades and how each ad earns one. */
export default function ScoreKey({ organic = false }: { organic?: boolean }) {
  const scales = organic ? ORGANIC_SCALES : PART_SCALES;
  const verdicts = organic ? ORGANIC_VERDICTS : VERDICTS;
  return (
    <details className="score-key">
      <summary>What do the grades mean?</summary>
      <div className="score-key-body">
        <p className="muted">
          {organic
            ? "A post proves itself by beating the account's normal. So the grade starts with how far it beat the account's usual views, then moves up or down one for how many people commented."
            : "Nobody keeps paying for an ad that loses money. So the grade starts with how long the ad has been live, then moves up or down one for the other two signs."}
        </p>
        <ul className="score-key-parts">
          {scales.map((p) => (
            <li key={p.label}>
              <strong>{p.label}</strong> <span className="muted">{p.effect}:</span>
              <span className="muted">{p.scale}</span>
            </li>
          ))}
        </ul>
        <ul>
          {verdicts.map((v) => (
            <li key={v.grade}>
              <Grade g={v.grade} size="sm" />
              <span>
                <strong>{v.verdict}.</strong> <span className="muted">{v.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">
          {organic ? "Views and comments are public numbers, not sales." : "It's a signal from public data, not their sales numbers."}
        </p>
      </div>
    </details>
  );
}
