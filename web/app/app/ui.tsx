import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { readTextCached } from "@/lib/storage";
import Tabs from "./Tabs";

export function Logo({ href = "/app" }: { href?: string }) {
  return (
    <Link href={href} className="oa-logo" aria-label="Ore" prefetch={false}>
      <svg viewBox="42 42 116 116" fill="none" aria-hidden="true">
        <circle cx="100" cy="100" r="46" stroke="#fff" strokeWidth="17" />
        <path d="M148 46 C150 60 152 62 166 64 C152 66 150 68 148 82 C146 68 144 66 130 64 C144 62 146 60 148 46 Z" fill="#fff" transform="translate(100 100) scale(1.05) translate(-148 -64)" />
      </svg>
      Ore
    </Link>
  );
}

/** The glow band at the top of every brand page: nav, then the page's title. */
export async function Band({
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
  // brands that post on TikTok Shop (brand.md `tiktok_shop: true`) get the TikTok tab
  const tiktok = brand ? /^tiktok_shop:\s*true/m.test((await readTextCached(`brands/${brand}/brand.md`, 60_000)) ?? "") : false;
  return (
    <header className="oa-band">
      <div className="oa-wrap">
        <nav className="oa-nav">
          <Logo />
          {brand && <Tabs brand={brand} tiktok={tiktok} />}
          <ThemeToggle />
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
