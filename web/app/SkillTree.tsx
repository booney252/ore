"use client";

import { useEffect, useRef, useState } from "react";
import { BRANCHES, type Lesson } from "@/lib/skilltree";

const W = 960;
const TOP = 104; // y of the highest node row; branch names sit above it
const GAP = 54;
const MAX = 6; // nodes drawn per branch; the rest show as "+N"
const MIN_SLOTS = 3; // locked slots keep a young branch looking like a branch

/** A hexagon around (x, y). */
function hex(x: number, y: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

const KIND = { brand: "This brand only", craft: "Craft, every brand", pending: "Ready to unlock" };

/**
 * The skill tree picture: Ore at the root, one branch per kind of lesson, one node per lesson.
 * Click a node (or a branch name) to read that branch's skills in a popup.
 */
export default function SkillTree({ tree, brandName }: { tree: Map<string, Lesson[]>; brandName: string }) {
  const learned = [...tree.values()].flat().filter((l) => l.kind !== "pending").length;
  const col = W / BRANCHES.length;
  const slotsOf = (n: number) => Math.min(MAX, Math.max(MIN_SLOTS, n));
  const tallest = Math.max(...BRANCHES.map((b) => slotsOf(tree.get(b.key)?.length ?? 0)));
  const baseY = TOP + (tallest - 1) * GAP;
  const root = { x: W / 2, y: baseY + 96 };
  const H = root.y + 44;

  const wrap = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<{ branch: string; id?: string } | null>(null);
  useEffect(() => {
    // on a narrow screen the tree scrolls sideways: start at the trunk, not the first branch
    const el = wrap.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (open?.id) document.getElementById(`skill-${open.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const show = (branch: string, id?: string) => setOpen({ branch, id });
  const keys = (branch: string, id?: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show(branch, id);
    }
  };
  const branch = open ? BRANCHES.find((b) => b.key === open.branch) : null;
  const items = open ? (tree.get(open.branch) ?? []) : [];

  return (
    <>
      <div className="skilltree-wrap" ref={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} className="skilltree" aria-label={`Skill tree: ${learned} skills learned`}>
          <defs>
            <radialGradient id="st-root" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#cfeaff" />
              <stop offset="100%" stopColor="#19d18b" />
            </radialGradient>
          </defs>
          {BRANCHES.map((b, i) => {
            const x = col * (i + 0.5);
            const list = tree.get(b.key) ?? [];
            const shown = list.slice(0, MAX);
            const slots = slotsOf(shown.length);
            const lit = list.filter((l) => l.kind !== "pending").length;
            const topY = baseY - (slots - 1) * GAP;
            return (
              <g key={b.key} className={`st-branch${lit ? " lit" : ""}`}>
                <path
                  d={`M${root.x},${root.y} C${root.x},${root.y - 50} ${x},${baseY + 56} ${x},${baseY}`}
                  className="st-link"
                />
                {slots > 1 && <line x1={x} y1={baseY} x2={x} y2={topY} className="st-link" />}
                {lit > 1 && (
                  <line x1={x} y1={baseY} x2={x} y2={baseY - (Math.min(lit, MAX) - 1) * GAP} className="st-link glow" />
                )}
                {Array.from({ length: slots }, (_, k) => {
                  const y = baseY - k * GAP;
                  const l = shown[k];
                  if (!l) return <polygon key={k} points={hex(x, y, 15)} className="st-node locked" />;
                  return (
                    <g
                      key={l.id}
                      className="st-hit"
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.label}: ${l.text.slice(0, 80)}`}
                      onClick={() => show(b.key, l.id)}
                      onKeyDown={keys(b.key, l.id)}
                    >
                      <polygon points={hex(x, y, 18)} className={`st-node ${l.kind}${l.decide ? " decide" : ""}`} />
                      <circle cx={x} cy={y} r={l.kind === "pending" ? 2.5 : 4} className="st-core" />
                    </g>
                  );
                })}
                {list.length > MAX && (
                  <text x={x} y={topY - 30} className="st-more">
                    +{list.length - MAX}
                  </text>
                )}
                <g
                  className={list.length ? "st-hit" : undefined}
                  role={list.length ? "button" : undefined}
                  tabIndex={list.length ? 0 : undefined}
                  onClick={list.length ? () => show(b.key) : undefined}
                  onKeyDown={list.length ? keys(b.key) : undefined}
                >
                  <text x={x} y={40} className="st-label">
                    {b.label}
                  </text>
                  <text x={x} y={58} className="st-level">
                    {lit ? `LV ${lit}` : "LOCKED"}
                  </text>
                </g>
              </g>
            );
          })}
          <g className="st-root">
            <circle cx={root.x} cy={root.y} r={30} className="st-root-halo" />
            <circle cx={root.x} cy={root.y} r={21} fill="url(#st-root)" />
            <text x={root.x} y={root.y + 4} className="st-root-text">
              {learned}
            </text>
          </g>
        </svg>
      </div>

      <dialog
        ref={dialog}
        className="st-dialog"
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        {branch && (
          <div className="st-dialog-body">
            <header>
              <div>
                <h2>{branch.label}</h2>
                <p className="mono muted small">
                  LV {items.filter((l) => l.kind !== "pending").length} · {branch.note}
                </p>
              </div>
              <button type="button" className="st-close" aria-label="Close" onClick={() => dialog.current?.close()}>
                ×
              </button>
            </header>
            <ol>
              {items.map((l) => (
                <li key={l.id} id={`skill-${l.id}`} className={l.id === open?.id ? "on" : undefined}>
                  <p>
                    <span className={`st-key ${l.kind}${l.decide ? " decide" : ""}`} aria-hidden="true" />
                    {l.text.replace(/\s*\(decide\)/i, "")}
                  </p>
                  <small className="muted">
                    {l.kind === "brand" ? `${brandName} only` : KIND[l.kind]}
                    {l.decide ? " · needs your call" : ""}
                    {l.kind === "pending" ? " · approve it under Ready to unlock" : ""}
                    {l.source ? ` · ${l.source}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        )}
      </dialog>
    </>
  );
}
