import Link from "next/link";
import { docLabel } from "./dates";

/** A list of dated documents (reports, iterations, briefs), newest first. */
export default function DocRows({
  base,
  files,
  tone,
  empty,
  titles,
}: {
  base: string;
  files: string[];
  tone: string;
  empty: string;
  titles?: Record<string, string[]>;
}) {
  if (files.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="doc-rows">
      {files.map((f) => {
        const { date, format } = docLabel(f);
        const ads = f.match(/-ads-([\d-]+?)(?:-x\d|-broll|-static|-its|$)/)?.[1];
        const its = f.match(/-its-([\d-]+)$/)?.[1];
        const detail = [
          /-idea-[0-9a-f]{6}/.test(f) ? "your idea" : "",
          ads ? `winners #${ads.split("-").join(", #")}` : "",
          its ? `iterations ${its.split("-").join(", ")}` : "",
          /-picks-[0-9a-f]{6}$/.test(f) ? "picked iterations" : "",
          base.endsWith("/reports") ? "" : format,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={f}>
            <Link href={`${base}/${f}`}>
              <span className={`dot ${tone}`} aria-hidden="true" />
              <span className="doc-name">
                <span className="doc-date">{date}</span>
                {titles?.[f]?.length ? <span className="doc-titles">{titles[f].join(" · ")}</span> : null}
              </span>
              <span className="muted">{detail}</span>
              <span className="arrow" aria-hidden="true">→</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
