import { notFound } from "next/navigation";
import "@/app/app/ore-app.css";
import GlowBg from "@/app/app/GlowBg";
import { Logo } from "@/app/app/ui";
import { brandName } from "@/lib/brands";
import { inviteBrand } from "@/lib/invites";
import { joinAsCreator } from "../actions";

export const dynamic = "force-dynamic";

/** What a creator sees from the brand's invite link: a short profile, in their own words. */
export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const q = await searchParams;
  const brand = await inviteBrand(token);
  if (!brand) notFound();
  const name = await brandName(brand);
  const Q: [string, string, string, boolean?][] = [
    ["handle", "Your handle", "@yourname"],
    ["platforms", "Where you post", "TikTok, Instagram"],
    ["about", "About you in one line", "34, ex-personal trainer, two kids, lives in Austin", true],
    ["story", `Your story with ${name}`, "Are you using it? Since when, and why? What was hard at the start?", true],
    ["can_claim", "What's actually changed for you", "Only what's true for you. This keeps every script honest.", true],
    ["audience", "Who watches you", "Who's in your comments?"],
    ["can_film", "Where can you film", "Car, kitchen, gym, work, outside"],
    ["voice", "How do you talk on camera", "Calm, funny, blunt, storyteller, teacher. Paste a caption or two if you like.", true],
    ["avoid", "Anything you won't say or show", "Your face, your weight, your job, your kids…"],
  ];
  return (
    <div className="oa">
      <header className="oa-band full">
        <GlowBg />
        <div className="oa-wrap">
          <nav className="oa-nav">
            <Logo />
          </nav>
          {q.done ? (
            <div className="ob ob-done">
              <div className="ob-mark" aria-hidden="true">✓</div>
              <p className="oa-label">{name}</p>
              <h1>You're all set.</h1>
              <p className="oa-sub">Thanks. Every script {name} sends you will be written for you: your story, your voice, and only what you can honestly say.</p>
            </div>
          ) : (
            <form action={joinAsCreator} className="ob join">
              <p className="oa-label">{name} · creator profile</p>
              <h1>Tell us who you are.</h1>
              <p className="oa-sub">About 3 minutes. {name} uses this to write every script in your voice, so nobody hands you lines that don't sound like you.</p>
              {q.missing && <p className="ob-err">Add your name first.</p>}
              <input type="hidden" name="token" value={token} />
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
              <label className="join-f">
                <span>Your name</span>
                <input className="ob-in" name="name" required placeholder="First name is fine" />
              </label>
              {Q.map(([key, label, hint, long]) => (
                <label key={key} className="join-f">
                  <span>{label}</span>
                  {long ? <textarea className="ob-in" name={key} rows={3} placeholder={hint} /> : <input className="ob-in" name={key} placeholder={hint} />}
                </label>
              ))}
              <div className="ob-nav">
                <span />
                <button type="submit" className="oa-btn white">Send my profile</button>
              </div>
            </form>
          )}
        </div>
      </header>
    </div>
  );
}
