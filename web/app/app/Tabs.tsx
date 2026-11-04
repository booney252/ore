"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "This week" },
  { href: "/ads", label: "Winning ads" },
  { href: "/scripts", label: "Scripts" },
  { href: "/performance", label: "Performance" },
  { href: "/creators", label: "Creators" },
  { href: "/brand", label: "My brand" },
];

export default function Tabs({ brand, tiktok = false }: { brand: string; tiktok?: boolean }) {
  const path = usePathname();
  const base = `/app/${brand}`;
  return (
    <div className="oa-tabs" role="navigation" aria-label="Sections">
      {(tiktok ? [{ href: "/tiktok", label: "TikTok" }, ...TABS] : TABS).map((t) => {
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
