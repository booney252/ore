"use client";

import { cancelRequest } from "./actions";

/** Cancel a queued or running request. A brand's setup asks first, since it removes the brand. */
export default function CancelButton({ brand, id, setup }: { brand: string; id: string; setup?: boolean }) {
  return (
    <form
      action={cancelRequest}
      onSubmit={(e) => {
        if (setup && !confirm("Cancel the setup and remove this brand?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="cancel-button">
        {setup ? "Cancel and remove brand" : "Cancel"}
      </button>
    </form>
  );
}
