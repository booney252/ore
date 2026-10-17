import Link from "next/link";
import { notFound } from "next/navigation";
import Wordmark from "@/app/Wordmark";
import { winners, loadAds } from "@/lib/ads";
import { brandName, checkSlug, listBrands, listDocs } from "@/lib/brands";
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
  const [name, ads, reports, scripts, briefs, brands] = await Promise.all([
    brandName(brand),
    loadAds(brand),
    listDocs(brand, "reports"),
    listDocs(brand, "scripts"),
    listDocs(brand, "briefs"),
    listBrands(),
  ]);
  const counts = {
    ads: winners(ads, 99).length,
    reports: reports.length,
    scripts: scripts.length,
    briefs: briefs.length,
  };

  return (
    <div className="shell">
      <aside className="rail">
        <Wordmark href={`/b/${brand}`} />
        <div className="rail-brand">
          <span className="mono muted">Brand</span>
          <strong>{name}</strong>
        </div>
        <Nav brand={brand} counts={counts} />
        {brands.length > 1 && (
          <Link href="/" className="rail-foot">
            All brands
          </Link>
        )}
      </aside>
      <div className="stage">{children}</div>
    </div>
  );
}
