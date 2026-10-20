"use client";

import Link from "next/link";
import { FOLDS, HEMI } from "@/app/BrainMap";
import { usePathname } from "next/navigation";

const STEPS = [
  { href: "/reports", label: "Reports", note: "Find and break down winners", tone: "diamond" },
  { href: "/iterations", label: "Iterations", note: "Turn winners into your ads", tone: "emerald" },
  { href: "/briefs", label: "Creative briefs", note: "Docs ready to hand off", tone: "ruby" },
];

function OverviewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.6" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.6" />
    </svg>
  );
}

/** A small version of the Research page's brand brain: ruby left, emerald right. */
function BrainIcon() {
  return (
    <svg viewBox="300 70 400 310" aria-hidden="true" className="brain-icon">
      {[false, true].map((mirror) => (
        <g key={String(mirror)} transform={mirror ? "translate(1000,0) scale(-1,1)" : undefined}>
          <path d={HEMI} className={mirror ? "bi-hemi emerald" : "bi-hemi ruby"} />
          {FOLDS.slice(0, 4).map((f) => (
            <path key={f} d={f} className="bi-fold" />
          ))}
        </g>
      ))}
    </svg>
  );
}

export default function Nav({ brand, counts }: { brand: string; counts: Record<string, number> }) {
  const path = usePathname();
  const base = `/b/${brand}`;
  const on = (href: string) => (href === "" ? path === base || path.startsWith(`${base}/ads`) : path.startsWith(base + href));

  return (
    <nav className="nav" aria-label="Brand">
      <Link href={base} className={`nav-item${on("") ? " on" : ""}`} aria-current={on("") ? "page" : undefined}>
        <span className="nav-icon">
          <OverviewIcon />
        </span>
        Overview
      </Link>

      <p className="nav-label mono">Workflow</p>
      <ol className="flow">
        {STEPS.map((step, i) => {
          const active = on(step.href);
          const count = counts[step.href.slice(1)];
          return (
            <li key={step.href}>
              <Link
                href={base + step.href}
                className={`flow-step ${step.tone}${active ? " on" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="node" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="flow-text">
                  <strong>{step.label}</strong>
                  <small>{step.note}</small>
                </span>
                {count ? <span className="count">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>

      <Link
        href={`${base}/research`}
        className={`brain-link${on("/research") ? " on" : ""}`}
        aria-current={on("/research") ? "page" : undefined}
      >
        <BrainIcon />
        <span className="brain-link-text">
          <strong>BRAND BRAIN</strong>
          <small>RESEARCH</small>
        </span>
      </Link>
    </nav>
  );
}
