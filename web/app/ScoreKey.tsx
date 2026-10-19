import { VERDICTS } from "@/lib/score";
import { tier } from "@/lib/ads";

/** "What do the scores mean?": the four bands and how the 100 points are made. */
export default function ScoreKey() {
  return (
    <details className="score-key">
      <summary>What do the scores mean?</summary>
      <div className="score-key-body">
        <p className="muted">
          Nobody keeps paying for an ad that loses money. So the score (out of 100) adds up the public signs that an
          ad is making money: <strong>how long it's been live</strong> (up to 50 points, full marks at 3 months),{" "}
          <strong>whether it's still running</strong> (25), and <strong>how many versions</strong> they've made of it
          (up to 25, full marks at 10). It's a signal, not their sales numbers.
        </p>
        <ul>
          {VERDICTS.map((v, i) => (
            <li key={v.verdict}>
              <span className={`score-num sm ${tier(v.min)}`}>
                {v.min}
                {i === 0 ? "+" : `–${VERDICTS[i - 1].min - 1}`}
              </span>
              <span>
                <strong>{v.verdict}.</strong> <span className="muted">{v.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
