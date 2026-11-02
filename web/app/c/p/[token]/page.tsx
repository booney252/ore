import Link from "next/link";
import { notFound } from "next/navigation";
import { brandName } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import { STATUSES, scriptsFor, statusesFor } from "@/lib/portal";
import { portalLogin, portalSession } from "../actions";
import { Shell, Stepper, statusLabel } from "../ui";

export const dynamic = "force-dynamic";

const firstLine = (body: string) =>
  body.match(/\|\s*\d[^|]*\|\s*"?([^|"\n]{8,})"?\s*\|/)?.[1]?.trim() ?? // a script table's first spoken line
  body.match(/\*\*Hook[^*]*\*\*[:\s]*"?([^"\n]+)/i)?.[1]?.trim() ??
  body.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("|"))?.replace(/[*_>#-]/g, "").trim() ??
  "";

/** A creator's portal: every script written for them and where each one is. */
export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const q = await searchParams;
  const s = await portalSession(token);
  if (!s) notFound();
  const [name, creators] = await Promise.all([brandName(s.brand), listCreators(s.brand)]);
  const creator = creators.find((c) => c.id === s.creator);
  const first = creator?.name.split(" ")[0] ?? "there";

  if ("locked" in s) {
    return (
      <Shell token={token} label={name} title={`Hi ${first}.`} sub="Your scripts for this brand live here. Enter the password they sent you." out={false}>
        <form action={portalLogin} className="oa-card oa-form cp-login">
          <input type="hidden" name="token" value={token} />
          <label className="oa-field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required autoFocus />
          </label>
          {q.wrong && <p className="oa-small" style={{ color: "#c2410c" }}>That password didn't work. Check the message the brand sent you.</p>}
          <button type="submit" className="oa-btn">Open my scripts</button>
        </form>
      </Shell>
    );
  }

  const [scripts, statuses] = await Promise.all([scriptsFor(s.brand, s.creator), statusesFor(s.brand)]);
  const mine = statuses[s.creator] ?? {};
  const st = (k: string) => mine[k]?.status ?? "todo";
  const counts = Object.fromEntries(STATUSES.map((x) => [x.key, scripts.filter((sc) => st(sc.key) === x.key).length]));
  const done = counts.done ?? 0;
  const order = (k: string) => (st(k) === "done" ? 1 : 0);
  const sorted = [...scripts].sort((a, b) => order(a.key) - order(b.key));

  return (
    <Shell
      token={token}
      label={`${name} · ${creator?.name ?? ""}`}
      title={scripts.length ? `Hi ${first}. ${scripts.length - done} script${scripts.length - done === 1 ? "" : "s"} to go.` : `Hi ${first}.`}
      sub="Tap a script to read it. Mark each one as you go so the brand knows where it is."
    >
      {scripts.length === 0 ? (
        <div className="oa-card oa-empty">No scripts yet. When the brand writes your first ones, they show up here.</div>
      ) : (
        <>
          <div className="oa-card cp-progress">
            <div className="cp-bar" aria-hidden>
              {STATUSES.map((x) => (counts[x.key] ? <i key={x.key} className={x.key} style={{ flex: counts[x.key] }} /> : null))}
            </div>
            <div className="cp-legend">
              {STATUSES.map((x) => (
                <span key={x.key} className={x.key}><b>{counts[x.key]}</b>{x.label}</span>
              ))}
            </div>
          </div>
          <div className="cp-list">
            {sorted.map((sc) => {
              const href = `/c/p/${token}/s/${sc.kind}/${sc.file}/${sc.n}`;
              return (
                <article key={sc.key} className={`oa-card cp-item ${st(sc.key)}`}>
                  <div className="cp-item-top">
                    <span className={`cp-pill ${st(sc.key)}`}>{statusLabel(st(sc.key))}</span>
                    <Link href={href} className="cp-item-title">{sc.title}</Link>
                    {firstLine(sc.body) && <q>{firstLine(sc.body)}</q>}
                  </div>
                  <Stepper token={token} scriptKey={sc.key} status={st(sc.key)} back={`/c/p/${token}`} />
                  <Link href={href} className="oa-ins-link">Open the script →</Link>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
