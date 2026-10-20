export const FORMATS = [
  { value: "ugc", label: "UGC video", hint: "Creator to camera" },
  { value: "broll", label: "B-roll", hint: "Footage + text" },
  { value: "static", label: "Static", hint: "One image" },
  { value: "talking", label: "Talking head", hint: "Organic, own page" },
] as const;

export const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  FORMATS.map((f) => [f.value, f.label]),
);

/** What kind of video or image to write. Plain radios, so it works without JS. */
export default function FormatPicker({
  name = "format",
  label = "Format",
  initial = "ugc",
}: {
  name?: string;
  label?: string;
  initial?: string;
}) {
  const start = FORMATS.some((f) => f.value === initial) ? initial : "ugc";
  return (
    <fieldset className="format-picker">
      <legend className="mono muted">{label}</legend>
      <div className="format-options">
        {FORMATS.map((f) => (
          <label key={f.value} className="format-option">
            <input type="radio" name={name} value={f.value} defaultChecked={f.value === start} />
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
