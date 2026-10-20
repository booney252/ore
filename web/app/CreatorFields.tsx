import { CREATOR_FIELDS, type Creator } from "@/lib/creators";

/** The creator profile fields, for the brand roster and the Creator Studio. */
export default function CreatorFields({ c }: { c?: Creator }) {
  return (
    <>
      <label className="field">
        <span className="mono muted">Name</span>
        <input name="name" required maxLength={80} defaultValue={c?.name} placeholder="Maya" />
      </label>
      {CREATOR_FIELDS.map((f) => (
        <label key={f.key} className={`field${f.long ? " wide" : ""}`}>
          <span className="mono muted">{f.label}</span>
          {f.long ? (
            <textarea name={f.key} rows={3} maxLength={1500} defaultValue={c?.[f.key]} placeholder={f.hint} />
          ) : (
            <input name={f.key} maxLength={1500} defaultValue={c?.[f.key]} placeholder={f.hint} />
          )}
        </label>
      ))}
    </>
  );
}
