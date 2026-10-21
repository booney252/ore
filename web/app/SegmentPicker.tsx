import { brandSegments } from "@/lib/brands";

/** "Who's it for?": write for one of the brand's audience segments (only shown if it has some). */
export default async function SegmentPicker({ brand }: { brand: string }) {
  const segments = await brandSegments(brand);
  if (!segments.length) return null;
  return (
    <label className="per-ad creator-pick">
      <span className="mono muted">Who's it for</span>
      <select name="segment" defaultValue="">
        <option value="">Everyone</option>
        {segments.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
