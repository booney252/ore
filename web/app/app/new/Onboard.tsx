"use client";

import { useState } from "react";
import { oaNewBrand } from "../actions";

const TOTAL = 2;

/** New brand, one question per screen: what you sell, then who you're up against. Creators get added while the research runs. */
export default function Onboard({ error }: { error?: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [sending, setSending] = useState(false);
  const canNext = step !== 0 || (name.trim() && about.trim().length > 10);
  const next = () => canNext && setStep((s) => Math.min(s + 1, TOTAL - 1));

  return (
    <form action={oaNewBrand} onSubmit={(e) => { if (step < TOTAL - 1) { e.preventDefault(); next(); return; } setSending(true); }} className="ob">
      <div className="ob-dots" aria-label={`Step ${step + 1} of ${TOTAL}`}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <i key={i} className={i === step ? "on" : i < step ? "done" : ""} />
        ))}
      </div>

      <section className={`ob-step${step === 0 ? " on" : ""}`} aria-hidden={step !== 0}>
        <p className="oa-label">Step 1 of 2</p>
        <h1>What do you sell?</h1>
        <p className="oa-sub">A sentence or two is enough. Ore does the rest.</p>
        {error && <p className="ob-err">{error}</p>}
        <input className="ob-in" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand name" autoFocus />
        <textarea className="ob-in" name="about" rows={3} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="An iPhone app that tracks peptide and GLP-1 doses, schedules and protein in one place." />
        <input className="ob-in" name="website" placeholder="Website or App Store link (optional)" />
      </section>

      <section className={`ob-step${step === 1 ? " on" : ""}`} aria-hidden={step !== 1}>
        <p className="oa-label">Step 2 of 2</p>
        <h1>Who are you up against?</h1>
        <p className="oa-sub">Name the ones you already watch. Ore finds the rest, so skip this if you're not sure.</p>
        <textarea className="ob-in" name="competitors" rows={3} placeholder="Shotsy, Pep AI, Peptide Tracker" />
      </section>


      <div className="ob-nav">
        {step > 0 ? (
          <button type="button" className="oa-btn quiet ob-back" onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < TOTAL - 1 ? (
          <button key="next" type="button" className="oa-btn white" disabled={!canNext} onClick={(e) => { e.preventDefault(); next(); }}>
            Next
          </button>
        ) : (
          <button key="submit" type="submit" className="oa-btn white" disabled={sending}>
            {sending ? "Starting…" : "Research my market"}
          </button>
        )}
      </div>
    </form>
  );
}
