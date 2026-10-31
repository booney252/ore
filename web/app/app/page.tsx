import Link from "next/link";
import { listBrands } from "@/lib/brands";
import { current } from "@/lib/session";
import { Band, initials } from "./ui";

export const dynamic = "force-dynamic";

export default async function OreAppHome() {
  const who = await current();
  const all = await listBrands();
  const brands = who?.owner ? all : all.filter((b) => b.slug === who?.brand);
  return (
    <>
      <Band title="Your brands" sub="Pick a brand, or set up a new one. Ore researches the market and builds its brand brain for you." />
      <main className="oa-main">
        <div className="oa-wrap oa-creators">
          {who?.owner && (
            <Link href="/app/new" className="oa-card oa-creator" style={{ borderStyle: "dashed" }}>
              <div className="oa-creator-top">
                <span className="oa-cav c4">+</span>
                <div>
                  <h3>New brand</h3>
                  <p className="oa-small oa-muted">Tell Ore what you sell</p>
                </div>
              </div>
            </Link>
          )}
          {brands.map((b, i) => (
            <Link key={b.slug} href={`/app/${b.slug}`} className="oa-card oa-creator">
              <div className="oa-creator-top">
                <span className={`oa-cav c${i % 5}`}>{initials(b.name)}</span>
                <div>
                  <h3>{b.name}</h3>
                  <p className="oa-small oa-muted">Open this week's breakouts</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
