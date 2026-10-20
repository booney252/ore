import Link from "next/link";
import { listCreators } from "@/lib/creators";

/** "Who's filming it?": write the iterations or briefs for one creator on the brand's roster. */
export default async function CreatorPicker({ brand }: { brand: string }) {
  const creators = await listCreators(brand);
  if (!creators.length) {
    return (
      <p className="per-ad creator-pick muted">
        <span className="mono muted">Who's filming it</span>
        <Link href={`/b/${brand}/creators`} className="link-quiet">
          Add creators →
        </Link>
      </p>
    );
  }
  return (
    <label className="per-ad creator-pick">
      <span className="mono muted">Who's filming it</span>
      <select name="creator" defaultValue="">
        <option value="">Any creator</option>
        {creators.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
