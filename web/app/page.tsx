import Link from "next/link";
import { newBrand } from "./actions";
import { loadAds, stats } from "@/lib/ads";
import { listBrands } from "@/lib/brands";
import LogOut from "./LogOut";
import Wordmark from "./Wordmark";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ taken?: string; missing?: string }>;
}) {
  const { taken, missing } = await searchParams;
  const brands = await listBrands();
  const rows = await Promise.all(brands.map(async (b) => ({ ...b, s: stats(await loadAds(b.slug)) })));

  return (
    <div className="home-wrap">
      <header className="home-top">
        <Wordmark />
        <LogOut />
      </header>

      <main className="home">
        <section className="home-hero">
          <p className="mono muted">New brand</p>
          <h1 className="display">What are we mining?</h1>
          <p className="lede">
            Tell Ore what you sell. It researches the market, maps your competitors in three rings,
            pulls their ads, and finds what's winning.
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
          {taken && (
            <p className="error wide">
              A brand called “{taken}” already exists. <Link href={`/b/${taken}`}>Open it</Link> or pick
              another name.
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
                    <span aria-hidden="true" className="arrow">→</span>
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
