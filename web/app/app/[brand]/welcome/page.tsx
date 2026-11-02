import Link from "next/link";
import { headers } from "next/headers";
import { ensureInvite, inviteUrl } from "@/lib/invites";
import CopyLink from "../../CopyLink";
import { brandName, setupState } from "@/lib/brands";
import { listCreators } from "@/lib/creators";
import GlowBg from "@/app/app/GlowBg";
import { Logo } from "../../ui";
import Refresh from "./Refresh";

export const dynamic = "force-dynamic";

/** After onboarding: a calm "Ore is on it" screen that turns into "your market is ready". */
export default async function Welcome({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const [name, state, creators, token, hdrs] = await Promise.all([brandName(brand), setupState(brand), listCreators(brand), ensureInvite(brand), headers()]);
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const link = inviteUrl(host, hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https"), token);
  const steps = [
    { label: "Learning what you sell", done: state.profile },
    { label: "Finding your competitors", done: state.competitors || state.organic },
    { label: "Reading what your buyers say", done: state.voc },
    { label: "Pulling the ads that are winning", done: state.ads },
    { label: "Writing your brand brief", done: state.brief },
  ];
  const now = steps.findIndex((s) => !s.done);

  return (
    <header className="oa-band full">
      <GlowBg />
      <div className="oa-wrap">
        <nav className="oa-nav">
          <Logo />
        </nav>
        {state.ready ? (
          <div className="ob ob-done">
            <div className="ob-mark" aria-hidden="true">✓</div>
            <p className="oa-label">{name}</p>
            <h1>Your market is ready.</h1>
            <p className="oa-sub">Ore found your competitors, read what your buyers say and studied the ads that are winning. Here's what's working this week.</p>
            <div className="ob-nav">
              <span />
              <Link href={`/app/${brand}`} className="oa-btn white">See what's working</Link>
            </div>
          </div>
        ) : (
          <div className="ob ob-wait">
            <Refresh />
            <div className="ob-orb" aria-hidden="true"><i /><i /><i /></div>
            <p className="oa-label">{name}</p>
            <h1>Ore is researching your market.</h1>
            <p className="oa-sub">This takes about 15 minutes. You don't need to stay here: this page moves on by itself, and your brand will be ready on This week when it's done.</p>
            <ol className="ob-progress">
              {steps.map((s, i) => (
                <li key={s.label} className={s.done ? "done" : i === now ? "now" : ""}>
                  <i aria-hidden="true" />
                  {s.label}
                </li>
              ))}
            </ol>
            <div className="ob-invite">
              <b>While you wait, send this to your creators</b>
              <span className="oa-small">They fill in who they are in about 3 minutes, no account needed, and every brief gets written in their voice.{creators.length ? ` ${creators.length} creator${creators.length > 1 ? "s have" : " has"} joined so far.` : ""}</span>
              <CopyLink url={link} />
              <Link href={`/app/${brand}/creators`}>Or add them yourself →</Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
