"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; tone?: string }[] = [
  { href: "", label: "Overview" },
  { href: "/ads", label: "Winning ads" },
  { href: "/research", label: "Research" },
  { href: "/reports", label: "Reports", tone: "diamond" },
  { href: "/scripts", label: "Scripts", tone: "emerald" },
  { href: "/briefs", label: "Creative briefs", tone: "ruby" },
];

export default function Nav({ brand, counts }: { brand: string; counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Brand">
      {ITEMS.map((item) => {
        const href = `/b/${brand}${item.href}`;
        const on = item.href === "" ? path === href : path.startsWith(href);
        const count = counts[item.href.slice(1)];
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={on ? "on" : ""}>
            <span className={`dot ${item.tone ?? ""}`} aria-hidden="true" />
            {item.label}
            {count ? <span className="count">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
