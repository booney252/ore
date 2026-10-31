"use client";

import { useState } from "react";

/** A share link with a Copy button; falls back to selecting the text if the clipboard is refused. */
export default function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="oa-link">
      <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link for your creator" />
      <button
        type="button"
        className="oa-btn ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setDone(true);
          } catch {
            (document.getElementById("share-url") as HTMLInputElement | null)?.select();
          }
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
