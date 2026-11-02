"use client";

import { useOptimistic, useTransition } from "react";

const STEPS = [
  { key: "todo", label: "To film" },
  { key: "filmed", label: "Filmed" },
  { key: "edited", label: "Edited" },
  { key: "done", label: "Done" },
];

export default function Steps({ token, scriptKey, status, back, action }: { token: string; scriptKey: string; status: string; back: string; action: (form: FormData) => Promise<void> }) {
  const [shown, setShown] = useOptimistic(status);
  const [, start] = useTransition();
  const at = STEPS.findIndex((s) => s.key === shown);
  return (
    <div className="cp-steps" role="group" aria-label="Where this script is">
      {STEPS.map((s, i) => (
        <button
          key={s.key}
          type="button"
          className={i < at ? "past" : i === at ? "now" : ""}
          aria-pressed={i === at}
          onClick={() =>
            start(async () => {
              setShown(s.key);
              const f = new FormData();
              f.set("token", token);
              f.set("key", scriptKey);
              f.set("back", back);
              f.set("status", s.key);
              await action(f);
            })
          }
        >
          <i>{i < at ? "✓" : i + 1}</i>
          {s.label}
        </button>
      ))}
    </div>
  );
}
