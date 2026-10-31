import Markdown from "@/app/Markdown";
import { brandName, listDocs, readDoc } from "@/lib/brands";
import { Band } from "../../ui";

export const dynamic = "force-dynamic";

/** The full Winning Ads Report, for anyone who wants the deep read behind This week's cards. */
export default async function Report({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const [name, reports] = await Promise.all([brandName(brand), listDocs(brand, "reports")]);
  const md = reports[0] ? await readDoc(brand, "reports", reports[0]) : null;
  const date = reports[0] ? new Date(`${reports[0].slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "";
  return (
    <>
      <Band brand={brand} name={name} label={`Full breakdown · ${date}`} title="Why this week's winners win." sub="The patterns, every winning ad taken apart, and what nobody is saying yet." />
      <main className="oa-main">
        <div className="oa-wrap" style={{ maxWidth: 980 }}>
          <article className="oa-card oa-doc">
            {md ? <Markdown text={md.replace(/^#\s+.+\n/gm, "")} /> : <p className="oa-empty">No report yet.</p>}
          </article>
        </div>
      </main>
    </>
  );
}
