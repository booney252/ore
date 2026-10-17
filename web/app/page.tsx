import Link from "next/link";
import { listBrands } from "@/lib/brands";
import Gem, { gemFor } from "./Gem";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brands = await listBrands();
  return (
    <main>
      <p className="eyebrow">Your vault</p>
      <h1>Brands</h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Each brand gets its own weekly dig: the ads that are winning, why, and what to make next.
      </p>
      {brands.length === 0 ? (
        <p className="muted">No brands yet. Create one with `cse init` for now.</p>
      ) : (
        <ul className="cards">
          {brands.map((b) => (
            <li key={b.slug}>
              <Link href={`/b/${b.slug}`} className="card brand-card" data-gem={gemFor(b.slug)}>
                <Gem kind={gemFor(b.slug)} size={46} />
                <span>
                  <strong>{b.name}</strong>
                  <span className="muted">Open reports, scripts and briefs</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
