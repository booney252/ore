import Link from "next/link";
import { notFound } from "next/navigation";
import LogOut from "@/app/LogOut";
import Wordmark from "@/app/Wordmark";
import { checkSlug, listBrands, listDocs } from "@/lib/brands";
import BrandSwitcher from "./BrandSwitcher";
import Nav from "./Nav";

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
  const [brands, reports, iterations, briefs] = await Promise.all([
    listBrands(),
    listDocs(brand, "reports"),
    listDocs(brand, "iterations"),
    listDocs(brand, "briefs"),
  ]);
  const counts = { reports: reports.length, iterations: iterations.length, briefs: briefs.length };

  return (
    <div className="shell">
      <aside className="rail">
        <Wordmark />
        <BrandSwitcher current={brand} brands={brands} />
        <Nav brand={brand} counts={counts} />
        <div className="rail-foot">
          <Link href="/">All brands</Link>
          <LogOut />
        </div>
      </aside>
      <div className="stage">{children}</div>
    </div>
  );
}
