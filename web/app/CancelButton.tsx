"use client";

import { cancelRequest } from "./actions";

/** Cancel a queued or running request. A brand's setup asks first, since it removes the brand. */
export default function CancelButton({
  brand,
  id,
  setup,
  back,
}: {
  brand: string;
  id: string;
  setup?: boolean;
  back?: string;
}) {
  return (
    <form
      action={cancelRequest}
      onSubmit={(e) => {
        if (setup && !confirm("Cancel the setup and remove this brand?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back ?? ""} />
      <button type="submit" className="cancel-button">
        {setup ? "Cancel and remove brand" : "Cancel"}
      </button>
    </form>
  );
}
