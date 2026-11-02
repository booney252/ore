"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "This week" },
  { href: "/scripts", label: "Scripts" },
  { href: "/creators", label: "Creators" },
  { href: "/performance", label: "Performance" },
  { href: "/brand", label: "My brand" },
];

export default function Tabs({ brand }: { brand: string }) {
  const path = usePathname();
  const base = `/app/${brand}`;
  return (
    <div className="oa-tabs" role="navigation" aria-label="Sections">
      {TABS.map((t) => {
        const on = t.href === "" ? path === base : path.startsWith(base + t.href);
        return (
          <Link key={t.label} href={base + t.href} aria-current={on ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
