import Link from "next/link";
import { notFound } from "next/navigation";
import { FORMAT_LABEL } from "@/app/FormatPicker";
import Grade from "@/app/Grade";
import Markdown from "@/app/Markdown";
import { hook, loadAds, posterUrl } from "@/lib/ads";
import { brandName } from "@/lib/brands";
import { explain } from "@/lib/score";
import { readScript, studioCreators } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function StudioScript({ params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const doc = await readScript(file);
  if (!doc) notFound();
  const { md, meta } = doc;
  const [name, ads, creators] = await Promise.all([brandName(meta.brand), loadAds(meta.brand), studioCreators()]);
  const byId = new Map(ads.map((a) => [a.ad_id, a]));
  const used = meta.ads.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const posters = await Promise.all(used.map((a) => posterUrl(a)));
  const who = creators.find((c) => c.id === meta.creator)?.name ?? "Any creator";

  return (
    <main className="home studio studio-read">
      <p className="crumbs mono">
        <Link href="/studio">Creator Studio</Link> / {name}
      </p>
      <header className="studio-read-head">
        <h1 className="display">{name}</h1>
        <p className="muted">
          {meta.count} {FORMAT_LABEL[meta.format] ?? meta.format} scripts · for {who}
          {meta.notes ? ` · “${meta.notes}”` : ""}
        </p>
      </header>

      {used.length > 0 && (
        <section className="studio-winners">
          <p className="mono muted">Built from {name}'s winning ads</p>
          <div className="sw-row">
            {used.map((a, i) => {
              const why = explain(a);
              return (
                <Link key={a.ad_id} href={`/b/${meta.brand}/ads/${a.ad_id}`} className="sw-card">
                  <span className="sw-poster">
                    {posters[i] ? <img src={posters[i]!} alt="" /> : <span className="ad-frame-empty" />}
                    <span className="sw-grade">
                      <Grade g={why.grade} size="sm" />
                    </span>
                  </span>
                  <span className="sw-hook">“{hook(a) || "No spoken hook"}”</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <Markdown text={md} />
    </main>
  );
}
