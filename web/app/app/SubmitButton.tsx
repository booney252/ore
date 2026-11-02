"use client";

import { useFormStatus } from "react-dom";

/** A submit button that reacts the moment it's pressed, and stays "working" until the page moves on. */
export default function SubmitButton({ children, className = "oa-btn", working = "Working...", style }: { children: React.ReactNode; className?: string; working?: string; style?: React.CSSProperties }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${className}${pending ? " is-pending" : ""}`} disabled={pending} aria-busy={pending} style={style}>
      {pending ? <><span className="spin" aria-hidden />{working}</> : children}
    </button>
  );
}
