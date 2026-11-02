import "@/app/app/ore-app.css";
import { Logo } from "@/app/app/ui";
import { STATUSES, type Status } from "@/lib/portal";
import Steps from "./Steps";
import { portalLogout, portalStatus } from "./actions";

export function Shell({ token, label, title, sub, children, out = true }: { token: string; label: string; title: string; sub?: string; children: React.ReactNode; out?: boolean }) {
  return (
    <div className="oa cp">
      <header className="oa-band">
        <div className="oa-wrap">
          <nav className="oa-nav">
            <Logo href={`/c/p/${token}`} />
            {out && (
              <form action={portalLogout}>
                <input type="hidden" name="token" value={token} />
                <button className="oa-btn quiet" type="submit">Log out</button>
              </form>
            )}
          </nav>
          <div className="oa-title">
            <p className="oa-label">{label}</p>
            <h1>{title}</h1>
            {sub && <p className="oa-sub">{sub}</p>}
          </div>
        </div>
      </header>
      <main className="oa-main">
        <div className="oa-wrap oa-stack" style={{ maxWidth: 980 }}>{children}</div>
      </main>
    </div>
  );
}

/** To film -> Filmed -> Edited -> Done, one tap each (shows the new step at once, saves behind). */
export function Stepper({ token, scriptKey, status, back }: { token: string; scriptKey: string; status: Status; back: string }) {
  return <Steps token={token} scriptKey={scriptKey} status={status} back={back} action={portalStatus} />;
}

export const statusLabel = (s: Status) => STATUSES.find((x) => x.key === s)?.label ?? "To film";
