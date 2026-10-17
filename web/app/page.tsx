import Link from "next/link";
import { listBrands } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brands = await listBrands();
  return (
    <main>
      <h1>Brands</h1>
      {brands.length === 0 ? (
        <p className="muted">No brands yet. Create one with `cse init` for now.</p>
      ) : (
        <ul className="cards">
          {brands.map((b) => (
            <li key={b.slug}>
              <Link href={`/b/${b.slug}`} className="card link">
                <strong>{b.name}</strong>
                <span className="muted">{b.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
