import Link from "next/link";
import { brandName, listDocs, type Kind } from "@/lib/brands";
import { docLabel } from "./dates";

const COPY: Record<Kind, { title: string; lede: string; tone: string }> = {
  reports: {
    title: "Reports",
    lede: "Winning Ads Reports: the top 10 taken apart, the patterns, and iteration ideas.",
    tone: "diamond",
  },
  scripts: {
    title: "Scripts",
    lede: "Word-for-word UGC scripts for the ideas you picked. Pick ideas from a report to get more.",
    tone: "emerald",
  },
  briefs: {
    title: "Creative briefs",
    lede: "Full creative strategy briefs for you or your creators. Pick ideas from a report to get more.",
    tone: "ruby",
  },
};

export default async function DocIndex({ brand, kind }: { brand: string; kind: Kind }) {
  const [files, name] = await Promise.all([listDocs(brand, kind), brandName(brand)]);
  const c = COPY[kind];
  return (
    <main className="page">
      <header className="page-head">
        <p className="mono muted">{name}</p>
        <h1 className={`display tone-${c.tone}`}>{c.title}</h1>
        <p className="lede">{c.lede}</p>
      </header>
      {files.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ul className="doc-rows">
          {files.map((f) => {
            const { date, ideas, format } = docLabel(f);
            return (
              <li key={f}>
                <Link href={`/b/${brand}/${kind}/${f}`}>
                  <span className={`dot ${c.tone}`} aria-hidden="true" />
                  <span className="doc-date">{date}</span>
                  <span className="muted">
                    {[ideas ? `Ideas ${ideas}` : "", format].filter(Boolean).join(" · ")}
                  </span>
                  <span className="arrow" aria-hidden="true">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
