export const FORMATS = [
  { value: "ugc", label: "UGC video", hint: "Creator to camera" },
  { value: "broll", label: "B-roll", hint: "Footage + text" },
  { value: "static", label: "Static", hint: "One image" },
] as const;

export const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  FORMATS.map((f) => [f.value, f.label]),
);

/** Three-way choice for what kind of ad to write. Plain radios, so it works without JS. */
export default function FormatPicker({ name = "format" }: { name?: string }) {
  return (
    <fieldset className="format-picker">
      <legend className="mono muted">Format</legend>
      <div className="format-options">
        {FORMATS.map((f, i) => (
          <label key={f.value} className="format-option">
            <input type="radio" name={name} value={f.value} defaultChecked={i === 0} />
            <span>
              <strong>{f.label}</strong>
              <span className="muted">{f.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
