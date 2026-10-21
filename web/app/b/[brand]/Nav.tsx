"use client";

import Link from "next/link";
import { FOLDS, HEMI } from "@/app/BrainMap";
import { usePathname } from "next/navigation";

const STEPS = [
  { href: "/reports", label: "Reports", note: "Find winners", tone: "diamond" },
  {
    href: "/iterations",
    label: "Iterations",
    note: "Make it yours",
    tone: "emerald",
  },
  {
    href: "/briefs",
    label: "Creative briefs",
    note: "Hand them off",
    tone: "ruby",
  },
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

/** A small skill tree: a root and three lit branches. */
function TreeIcon() {
  return (
    <svg viewBox="0 0 40 32" aria-hidden="true" className="tree-icon">
      <path d="M20 29V18M20 18C20 13 9 14 9 8M20 18V6M20 18c0-5 11-4 11-10" className="ti-link" />
      <circle cx="20" cy="29" r="2.6" className="ti-root" />
      <circle cx="9" cy="7" r="3.4" className="ti-node emerald" />
      <circle cx="20" cy="5" r="3.4" className="ti-node diamond" />
      <circle cx="31" cy="7" r="3.4" className="ti-node ruby" />
    </svg>
  );
}

function CreatorsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="7.5" cy="7" r="2.8" />
      <path d="M2.5 16c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3" />
      <circle cx="14" cy="7.8" r="2.2" />
      <path d="M13.6 11.8c2 .1 3.4 1.4 3.9 3.6" />
    </svg>
  );
}

export default function Nav({ brand, counts }: { brand: string; counts: Record<string, number> }) {
  const path = usePathname();
  const base = `/b/${brand}`;
  const on = (href: string) =>
    href === "" ? path === base || path.startsWith(`${base}/ads`) : path.startsWith(base + href);

  return (
    <nav className="nav" aria-label="Brand">
      <Link href={base} className={`nav-item${on("") ? " on" : ""}`} aria-current={on("") ? "page" : undefined}>
        <span className="nav-icon">
          <OverviewIcon />
        </span>
        <span className="flow-text">
          <strong>Overview</strong>
          <small>What's winning</small>
        </span>
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

      <div className="nav-foot">
        <Link
          href={`${base}/creators`}
          className={`nav-item${on("/creators") ? " on" : ""}`}
          aria-current={on("/creators") ? "page" : undefined}
        >
          <span className="nav-icon">
            <CreatorsIcon />
          </span>
          <span className="flow-text">
            <strong>Creators</strong>
            <small>Who films</small>
          </span>
          {counts.creators ? <span className="count">{counts.creators}</span> : null}
        </Link>
        <Link
          href={`${base}/skills`}
          className={`brain-link tree-link${on("/skills") ? " on" : ""}`}
          aria-current={on("/skills") ? "page" : undefined}
        >
          <TreeIcon />
          <span className="brain-link-text">
            <strong>SKILL TREE</strong>
            <small>HOW ORE WRITES</small>
          </span>
        </Link>
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
      </div>
    </nav>
  );
}
