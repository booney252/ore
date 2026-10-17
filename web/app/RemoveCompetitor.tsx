"use client";

import { removeCompetitorAction } from "./actions";

export default function RemoveCompetitor({ brand, name }: { brand: string; name: string }) {
  return (
    <form
      action={removeCompetitorAction}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from your competitors?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="name" value={name} />
      <button type="submit" className="comp-remove" aria-label={`Remove ${name}`} title="Remove">
        ×
      </button>
    </form>
  );
}
