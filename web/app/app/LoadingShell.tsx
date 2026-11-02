"use client";

import { usePathname } from "next/navigation";
import Tabs from "./Tabs";
import { Logo } from "./ui";

/** Shown the instant you click: the header and tabs, with the page's cards shimmering in. */
export default function LoadingShell() {
  const brand = usePathname().split("/")[2] ?? "";
  return (
    <>
      <header className="oa-band">
        <div className="oa-wrap">
          <nav className="oa-nav">
            <Logo />
            {brand && <Tabs brand={brand} />}
          </nav>
          <div className="oa-title" aria-hidden>
            <span className="sk sk-label" />
            <span className="sk sk-title" />
            <span className="sk sk-sub" />
          </div>
        </div>
      </header>
      <main className="oa-main" aria-busy="true" aria-label="Loading">
        <div className="oa-wrap sk-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="oa-card sk-card">
              <span className="sk sk-line w40" />
              <span className="sk sk-line w80" />
              <span className="sk sk-line w60" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
