import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Markdown from "@/app/Markdown";
import { brandName } from "@/lib/brands";
import { scriptsFor, statusesFor } from "@/lib/portal";
import { portalSession, portalUpdate } from "../../../../../actions";
import { Shell, Stepper } from "../../../../../ui";

export const dynamic = "force-dynamic";

/** One script, with its status, the video link and a note to the brand. */
export default async function PortalScript({ params, searchParams }: { params: Promise<{ token: string; kind: string; file: string; n: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token, kind, file, n } = await params;
  const q = await searchParams;
  const s = await portalSession(token);
  if (!s) notFound();
  if ("locked" in s) redirect(`/c/p/${token}`);
  const key = `${kind}~${file}~${Number(n)}`;
  const [scripts, statuses, name] = await Promise.all([scriptsFor(s.brand, s.creator), statusesFor(s.brand), brandName(s.brand)]);
  const sc = scripts.find((x) => x.key === key);
  if (!sc) notFound();
  const cur = statuses[s.creator]?.[key];
  const here = `/c/p/${token}/s/${kind}/${file}/${n}`;
  const i = scripts.indexOf(sc);
  const next = scripts[i + 1];
  return (
    <Shell token={token} label={name} title={sc.title} sub="Say it in your own words. Keep the order of the beats and the facts the same.">
      <Link href={`/c/p/${token}`} className="oa-small cp-back">← All my scripts</Link>
      <div className="cp-script">
        <article className="oa-card oa-doc">
          <Markdown text={sc.body} />
        </article>
        <aside className="oa-stack oa-sticky">
          <div className="oa-card cp-side">
            <h2>Where is it?</h2>
            <Stepper token={token} scriptKey={key} status={cur?.status ?? "todo"} back={here} />
            {q.saved && <p className="oa-small" style={{ color: "var(--oa-cobalt)" }}>Saved.</p>}
          </div>
          <form action={portalUpdate} className="oa-card oa-form cp-side">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="back" value={here} />
            <label className="oa-field">
              <span>Link to the video</span>
              <input name="video" type="url" defaultValue={cur?.video ?? ""} placeholder="Google Drive, Dropbox, Frame.io..." />
            </label>
            <label className="oa-field">
              <span>Note for the brand</span>
              <textarea name="note" rows={3} defaultValue={cur?.note ?? ""} placeholder="Changed the hook a little, filmed 2 versions..." />
            </label>
            <button type="submit" className="oa-btn">Save</button>
          </form>
          {next && <Link href={`/c/p/${token}/s/${next.kind}/${next.file}/${next.n}`} className="oa-ins-link">Next script: {next.title} →</Link>}
        </aside>
      </div>
    </Shell>
  );
}
