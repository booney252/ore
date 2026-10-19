"use client";

import { deleteDocAction } from "./actions";

/** The × on an iteration set or brief row. Asks first; the doc goes to the brand's trash. */
export default function DeleteDoc({
  brand,
  kind,
  file,
  label,
}: {
  brand: string;
  kind: "iterations" | "briefs";
  file: string;
  label: string;
}) {
  return (
    <form
      action={deleteDocAction}
      className="doc-delete"
      onSubmit={(e) => {
        if (!confirm(`Delete "${label}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="file" value={file} />
      <button type="submit" className="comp-remove" aria-label={`Delete ${label}`} title="Delete">
        ×
      </button>
    </form>
  );
}
