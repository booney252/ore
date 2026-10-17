import Link from "next/link";
import { redirect } from "next/navigation";
import { listBrands } from "@/lib/brands";
import { loadAds, stats } from "@/lib/ads";
import Wordmark from "./Wordmark";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brands = await listBrands();
  if (brands.length === 1) redirect(`/b/${brands[0].slug}`);
  const rows = await Promise.all(brands.map(async (b) => ({ ...b, s: stats(await loadAds(b.slug)) })));

  return (
    <main className="home">
      <Wordmark />
      <h1 className="display">Brands</h1>
      {rows.length === 0 ? (
        <p className="muted">No brands yet. Create one with `cse init` for now.</p>
      ) : (
        <ul className="brand-rows">
          {rows.map((b) => (
            <li key={b.slug}>
              <Link href={`/b/${b.slug}`}>
                <span className="brand-row-name">{b.name}</span>
                <span className="mono muted">
                  {b.s.total} ads · {b.s.advertisers} advertisers
                </span>
                <span aria-hidden="true" className="arrow">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
