import Link from "next/link";
import Tabs from "./Tabs";

export function Logo() {
  return (
    <Link href="/app" className="oa-logo" aria-label="Ore">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 3 28 10v12L16 29 4 22V10L16 3Z" stroke="#fff" strokeWidth="2" />
        <path d="M16 3v26M4 10l12 7 12-7" stroke="#fff" strokeWidth="1.4" opacity=".7" />
      </svg>
      Ore
    </Link>
  );
}

/** The glow band at the top of every brand page: nav, then the page's title. */
export function Band({
  brand,
  name,
  label,
  title,
  sub,
  chips,
  children,
}: {
  brand?: string;
  name?: string;
  label?: string;
  title: string;
  sub?: string;
  chips?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="oa-band">
      <div className="oa-wrap">
        <nav className="oa-nav">
          <Logo />
          {brand && <Tabs brand={brand} />}
          {name && (
            <Link href="/app" className="oa-who">
              {name}
              <span className="oa-avatar">{initials(name)}</span>
            </Link>
          )}
        </nav>
        <div className="oa-title">
          {label && <p className="oa-label">{label}</p>}
          <h1>{title}</h1>
          {sub && <p className="oa-sub">{sub}</p>}
          {chips && <div className="oa-gchips">{chips}</div>}
          {children}
        </div>
      </div>
    </header>
  );
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "O"
  );
}

/** Shown while the worker has a job for this brand. */
export function Working({ text }: { text: string }) {
  return (
    <div className="oa-notice" role="status">
      <i aria-hidden="true" />
      {text}
    </div>
  );
}
