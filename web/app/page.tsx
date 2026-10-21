import Link from "next/link";
import { newBrand } from "./actions";
import { loadAds, stats } from "@/lib/ads";
import { listBrands } from "@/lib/brands";
import { playbookInbox } from "@/lib/lessons";
import LogOut from "./LogOut";
import Wordmark from "./Wordmark";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ taken?: string; missing?: string; cancelled?: string }>;
}) {
  const { taken, missing, cancelled } = await searchParams;
  const brands = await listBrands();
  const [rows, inbox] = await Promise.all([
    Promise.all(brands.map(async (b) => ({ ...b, s: stats(await loadAds(b.slug)) }))),
    playbookInbox(),
  ]);

  return (
    <div className="home-wrap">
      <header className="home-top">
        <Wordmark />
        <nav className="studio-nav">
          <Link href="/playbook" className="link-quiet playbook-link">
            Ore's playbook{inbox.length ? <span className="count">{inbox.length}</span> : null}
          </Link>
          <Link href="/studio" className="studio-badge mono">
            Creator Studio →
          </Link>
          <LogOut />
        </nav>
      </header>

      <main className="home">
        {cancelled && (
          <p className="notice quiet">
            <span className="dot" aria-hidden="true" />
            Setup cancelled and the brand was removed.
          </p>
        )}

        <section className="home-tag">
          <h1 className="display">Never stare at a blank page again.</h1>
          <p className="lede">
            Your market, your customers and everything that's winning, in one place. The next idea is always waiting.
          </p>
        </section>

        <section className="home-hero">
          <p className="mono muted">New brand</p>
          <h2 className="display home-new">What are we mining?</h2>
          <p className="lede">
            Tell Ore what you sell. It researches the market, maps your competitors in three rings, pulls their ads, and
            finds what's winning.
          </p>
        </section>

        <form action={newBrand} className="panel run new-brand">
          <label className="field">
            <span className="mono muted">Brand name</span>
            <input name="name" required maxLength={80} placeholder="PeptidePal" />
          </label>
          <label className="field">
            <span className="mono muted">Website or App Store link</span>
            <input name="website" maxLength={300} placeholder="peptidepal.app" />
          </label>
          <label className="field wide">
            <span className="mono muted">What do you sell?</span>
            <textarea
              name="about"
              required
              maxLength={600}
              rows={3}
              placeholder="An iPhone app that tracks your peptide doses, schedule and progress in one place."
            />
          </label>
          <label className="field wide">
            <span className="mono muted">Competitors you already know (optional)</span>
            <input name="competitors" maxLength={600} placeholder="Shotsy, Pep AI, MyFitnessPal" />
          </label>
          <label className="field wide">
            <span className="mono muted">Ingredients (if it has them)</span>
            <textarea
              name="ingredients"
              maxLength={3000}
              rows={3}
              placeholder={
                "One per line, with the dose if you know it.\nAshwagandha root extract (600 mg)\nMagnesium glycinate"
              }
            />
          </label>
          <label className="field wide">
            <span className="mono muted">Unique mechanism (optional)</span>
            <textarea
              name="mechanism"
              maxLength={1500}
              rows={2}
              placeholder="The mechanism your copy will use. Ore ties each ingredient's research back to it."
            />
          </label>
          {taken && (
            <p className="error wide">
              A brand called “{taken}” already exists. <Link href={`/b/${taken}`}>Open it</Link> or pick another name.
            </p>
          )}
          {missing && <p className="error wide">Add a name and a line about what you sell.</p>}
          <div className="wide new-brand-foot">
            <p className="muted">First it drafts your brand profile and competitor map. That takes a few minutes.</p>
            <button type="submit" className="btn-primary">
              Start digging
            </button>
          </div>
        </form>

        {rows.length > 0 && (
          <section className="block">
            <h2>Your brands</h2>
            <ul className="brand-rows">
              {rows.map((b) => (
                <li key={b.slug}>
                  <Link href={`/b/${b.slug}`}>
                    <span className="brand-row-name">{b.name}</span>
                    <span className="mono muted">
                      {b.s.total ? `${b.s.total} ads · ${b.s.advertisers} advertisers` : "Setting up"}
                    </span>
                    <span aria-hidden="true" className="arrow">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
