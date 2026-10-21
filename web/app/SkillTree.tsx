"use client";

import { useEffect, useRef, useState } from "react";
import { changeSkillAction } from "@/app/actions";
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
export default function SkillTree({
  tree,
  brand,
  brandName,
  owner,
}: {
  tree: Map<string, Lesson[]>;
  brand: string;
  brandName: string;
  owner: boolean;
}) {
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
  const [editing, setEditing] = useState<string | null>(null);
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
        onClose={() => {
          setOpen(null);
          setEditing(null);
        }}
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
                <Skill
                  key={l.id}
                  l={l}
                  on={l.id === open?.id}
                  brand={brand}
                  brandName={brandName}
                  canChange={owner || l.kind === "brand"}
                  editing={editing === l.id}
                  setEditing={(v) => setEditing(v ? l.id : null)}
                />
              ))}
            </ol>
          </div>
        )}
      </dialog>
    </>
  );
}

/** One skill in the popup, with what you can do to it. */
function Skill({
  l,
  on,
  brand,
  brandName,
  canChange,
  editing,
  setEditing,
}: {
  l: Lesson;
  on: boolean;
  brand: string;
  brandName: string;
  canChange: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const rule = l.text.replace(/\s*\(decide\)/i, "");
  const fields = (
    <>
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="kind" value={l.kind} />
      <input type="hidden" name="index" value={l.index} />
      <input type="hidden" name="raw" value={l.raw} />
      <input type="hidden" name="source" value={l.source} />
      <input type="hidden" name="decide" value={l.decide ? "1" : ""} />
      <input type="hidden" name="rule" value={rule} />
      <input type="hidden" name="id" value={l.id.replace(/^s-/, "")} />
    </>
  );
  const sure = (msg: string) => (e: React.FormEvent) => {
    if (!window.confirm(msg)) e.preventDefault();
  };
  return (
    <li id={`skill-${l.id}`} className={on ? "on" : undefined}>
      {editing ? (
        <form action={changeSkillAction} className="st-edit-form">
          {fields}
          <input type="hidden" name="op" value="save" />
          <textarea name="text" rows={5} defaultValue={rule} required autoFocus />
          <div className="st-actions">
            <button type="submit" className="btn-primary">
              Save
            </button>
            <button type="button" className="st-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p>
          <span className={`st-key ${l.kind}${l.decide ? " decide" : ""}`} aria-hidden="true" />
          {rule}
        </p>
      )}
      <small className="muted">
        {l.kind === "brand" ? `${brandName} only` : KIND[l.kind]}
        {l.decide ? " · needs your call" : ""}
        {l.source ? ` · ${l.source}` : ""}
      </small>
      {canChange && !editing && (
        <div className="st-actions">
          {l.kind === "pending" && (
            <form action={changeSkillAction}>
              {fields}
              <input type="hidden" name="op" value="approve" />
              <button type="submit" className="st-btn go">
                Approve for every brand
              </button>
            </form>
          )}
          {l.decide && (
            <form action={changeSkillAction}>
              {fields}
              <input type="hidden" name="op" value="confirm" />
              <button type="submit" className="st-btn go">
                Confirm
              </button>
            </form>
          )}
          <button type="button" className="st-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          {l.kind === "pending" ? (
            <form action={changeSkillAction}>
              {fields}
              <input type="hidden" name="op" value="dismiss" />
              <button type="submit" className="st-btn">
                Dismiss
              </button>
            </form>
          ) : (
            <form
              action={changeSkillAction}
              onSubmit={sure(
                l.kind === "craft" ? "Delete this skill for every brand?" : `Delete this skill from ${brandName}?`,
              )}
            >
              {fields}
              <input type="hidden" name="op" value="delete" />
              <button type="submit" className="st-btn danger">
                Delete
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
