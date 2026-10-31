import { requireOwner } from "@/lib/session";
import { oaNewBrand } from "../actions";
import { Logo } from "../ui";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Competitor map", "Direct, adjacent and nearby brands, plus any you add"],
  ["Customer research", "Real quotes from reviews and comments, with sources"],
  ["Winning ads", "Every competitor's top ads, broken down"],
  ["Psychographics", "What your buyers hope for, fear and believe"],
  ["Market awareness", "How much your buyers already know"],
  ["Research brief", "Your brand brain, which every brief reads"],
];

export default async function NewBrand({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireOwner();
  const q = await searchParams;
  return (
    <header className="oa-band full">
      <div className="oa-wrap">
        <nav className="oa-nav">
          <Logo />
        </nav>
        <div className="oa-setup">
          <form action={oaNewBrand} className="oa-stack">
            <div className="oa-title" style={{ paddingTop: 0 }}>
              <p className="oa-label">New brand</p>
              <h1>What do you sell?</h1>
              <p className="oa-sub">
                Tell Ore about your product in a sentence or two. It finds your competitors, reads what your buyers say,
                studies the ads that are winning, and builds your brand brain.
              </p>
            </div>
            {q.missing && <p className="oa-glass">Add a brand name and a line about what you sell.</p>}
            {q.taken && <p className="oa-glass">A brand called {q.taken} already exists.</p>}
            <label className="oa-glass oa-field">
              <span>Brand name</span>
              <input id="oa-name" name="name" required placeholder="PeptidePal" />
            </label>
            <label className="oa-glass oa-field">
              <span>What you sell</span>
              <textarea id="oa-about" name="about" rows={3} required placeholder="An iPhone app that tracks peptide and GLP-1 doses, schedules and protein in one place." />
            </label>
            <label className="oa-glass oa-field">
              <span>Website or app store link</span>
              <small>Optional</small>
              <input id="oa-website" name="website" placeholder="peptidepal.app" />
            </label>
            <label className="oa-glass oa-field">
              <span>Competitors you already know</span>
              <small>Optional, separated by commas. Ore finds the rest.</small>
              <input id="oa-competitors" name="competitors" placeholder="Shotsy, Pep AI" />
            </label>
            <div>
              <button type="submit" className="oa-btn white">Research my market</button>
            </div>
          </form>
          <aside className="oa-glass">
            <p className="oa-label">What Ore will build</p>
            <div className="oa-steps" style={{ marginTop: 14 }}>
              {STEPS.map(([b, s]) => (
                <div key={b} className="oa-step done">
                  <i aria-hidden="true" />
                  <div>
                    <b>{b}</b>
                    <span>{s}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </header>
  );
}
