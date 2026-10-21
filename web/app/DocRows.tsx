import Link from "next/link";
import DeleteDoc from "./DeleteDoc";
import { docLabel } from "./dates";

/** A list of dated documents (reports, iterations, briefs), newest first. */
export default function DocRows({
  base,
  files,
  tone,
  empty,
  titles,
  remove,
  audiences,
}: {
  base: string;
  files: string[];
  tone: string;
  empty: string;
  titles?: Record<string, string[]>;
  /** Audience segment labels by key, for files written for one segment ("-to-her"). */
  audiences?: Record<string, string>;
  /** Show a delete × on each row: the brand and which kind of doc these are. */
  remove?: { brand: string; kind: "iterations" | "briefs" };
}) {
  if (files.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="doc-rows">
      {files.map((f) => {
        const { date, format } = docLabel(f);
        const ads = f.match(/-ads-([\d-]+?)(?:-x\d|-for-|-to-|-broll|-static|-talking|-its|$)/)?.[1];
        const forWho = f.match(/-for-([a-z0-9-]+?)(?:-to-|-broll|-static|-talking|-its|$)/)?.[1];
        const toWhom = f.match(/-to-([a-z0-9-]+?)(?:-broll|-static|-talking|-its|$)/)?.[1];
        const its = f.match(/-its-([\d-]+?)(?:-for-|-to-|$)/)?.[1];
        const detail = [
          /-idea-[0-9a-f]{6}/.test(f) ? "your idea" : "",
          ads ? `winners #${ads.split("-").join(", #")}` : "",
          its ? `iterations ${its.split("-").join(", ")}` : "",
          /-picks-[0-9a-f]{6}/.test(f) ? "picked iterations" : "",
          forWho ? `for ${forWho.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}` : "",
          toWhom ? `to ${audiences?.[toWhom] ?? toWhom}` : "",
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
            {remove ? (
              <DeleteDoc
                brand={remove.brand}
                kind={remove.kind}
                file={f}
                label={titles?.[f]?.join(", ") || `${date}${detail ? ` (${detail})` : ""}`}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
