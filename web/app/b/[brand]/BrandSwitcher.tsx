"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** The brand name in the sidebar; opens a list of brands. Switching keeps you on the same tab. */
export default function BrandSwitcher({
  current,
  brands,
}: {
  current: string;
  brands: { slug: string; name: string }[];
}) {
  const path = usePathname();
  const box = useRef<HTMLDetailsElement>(null);
  // Same tab in the other brand: /b/solis/reports/2026-10-17 -> /b/peptidepal/reports
  const tab = path.split("/")[3];
  const name = brands.find((b) => b.slug === current)?.name ?? current;

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const el = box.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details className="switcher" ref={box}>
      <summary aria-label={`Brand: ${name}. Switch brand`}>
        <span className="mono muted">Brand</span>
        <span className="switcher-current">
          <strong>{name}</strong>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </span>
      </summary>
      <div className="switcher-menu" role="menu">
        {brands.map((b) => (
          <Link
            key={b.slug}
            role="menuitem"
            href={`/b/${b.slug}${tab ? `/${tab}` : ""}`}
            className={b.slug === current ? "on" : ""}
            aria-current={b.slug === current ? "page" : undefined}
            onClick={() => box.current?.removeAttribute("open")}
          >
            <span className="switcher-initial" aria-hidden="true">
              {b.name.slice(0, 1).toUpperCase()}
            </span>
            {b.name}
            {b.slug === current ? <span className="switcher-check" aria-hidden="true">✓</span> : null}
          </Link>
        ))}
        <Link
          href="/"
          role="menuitem"
          className="switcher-new"
          onClick={() => box.current?.removeAttribute("open")}
        >
          <span className="switcher-initial" aria-hidden="true">+</span>
          New brand
        </Link>
      </div>
    </details>
  );
}
