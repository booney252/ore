import { notFound } from "next/navigation";
import Markdown from "@/app/Markdown";
import "@/app/app/ore-app.css";
import { brandName, readDoc, type Kind } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { readText } from "@/lib/storage";
import { Logo } from "@/app/app/ui";

export const dynamic = "force-dynamic";

/** Only what the creator films from: the script's own heading on, minus Ore's notes to the strategist. */
function forCreator(md: string): { title: string; body: string } {
  const heads = [...md.matchAll(/^#\s+(.+)$/gm)];
  const last = heads[heads.length - 1];
  const from = last ? md.slice(last.index! + last[0].length) : md;
  const body = from
    .split("\n")
    .filter((l) => !/^\s*[-*]\s+\*\*(Built on|Why it should work for us|Write it like this|Source ads?)\b/i.test(l))
    .join("\n");
  return { title: last?.[1]?.replace(/[*_`]/g, "") ?? "Your brief", body };
}

/** What a creator sees: their brief, from a private link. No login. */
export default async function CreatorBrief({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) notFound();
  const raw = await readText(`shares/${token}.json`);
  if (!raw) notFound();
  const share = JSON.parse(raw) as { brand: string; kind: string; file: string; creator?: string };
  if (share.kind !== "iterations" && share.kind !== "briefs") notFound();
  const [md, name, creators] = await Promise.all([readDoc(share.brand, share.kind as Kind, share.file), brandName(share.brand), listCreators(share.brand)]);
  if (!md) notFound();
  const creator = creators.find((c) => c.id === share.creator);
  const { title, body } = forCreator(md);
  return (
    <div className="oa">
      <header className="oa-band">
        <div className="oa-wrap">
          <nav className="oa-nav"><Logo /></nav>
          <div className="oa-title">
            <p className="oa-label">{creator ? `For ${creator.name}` : "Your brief"} · {name}</p>
            <h1>{title}</h1>
            <p className="oa-sub">Say it in your own words. Keep the order of the beats and the facts the same.</p>
          </div>
        </div>
      </header>
      <main className="oa-main">
        <div className="oa-wrap" style={{ maxWidth: 900 }}>
          <article className="oa-card oa-doc">
            <Markdown text={body} />
          </article>
        </div>
      </main>
    </div>
  );
}
