import Link from "next/link";
import { notFound } from "next/navigation";
import LogOut from "@/app/LogOut";
import Wordmark from "@/app/Wordmark";
import { checkSlug, listBrands, listDocs } from "@/lib/brands";
import BrandSwitcher from "./BrandSwitcher";
import Nav from "./Nav";
import { listCreators } from "@/lib/creators";
import { current } from "@/lib/session";

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brand: string }>;
}) {
  const { brand } = await params;
  try {
    checkSlug(brand);
  } catch {
    notFound();
  }
  const who = await current();
  const [all, reports, iterations, briefs, creators] = await Promise.all([
    listBrands(),
    listDocs(brand, "reports"),
    listDocs(brand, "iterations"),
    listDocs(brand, "briefs"),
    listCreators(brand),
  ]);
  // A guest only ever sees their own brand in the switcher.
  const brands = who?.owner ? all : all.filter((b) => b.slug === brand);
  const counts = {
    reports: reports.length,
    iterations: iterations.length,
    briefs: briefs.length,
    creators: creators.length,
  };

  return (
    <div className="shell">
      <aside className="rail">
        <Wordmark />
        <BrandSwitcher current={brand} brands={brands} />
        <Nav brand={brand} counts={counts} />
        <div className="rail-foot">
          {who?.owner && <Link href="/">All brands</Link>}
          <Link href={`/b/${brand}/creators`} className="rail-creators">
            Creators{counts.creators ? <span className="count">{counts.creators}</span> : null}
          </Link>
          <LogOut />
        </div>
      </aside>
      <div className="stage">{children}</div>
    </div>
  );
}
