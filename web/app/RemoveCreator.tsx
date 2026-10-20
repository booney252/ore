"use client";

import { removeCreatorAction } from "./actions";

export default function RemoveCreator({ brand, id, name }: { brand: string; id: string; name: string }) {
  return (
    <form
      action={removeCreatorAction}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from your creators?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="link-quiet danger-link">
        Remove
      </button>
    </form>
  );
}
