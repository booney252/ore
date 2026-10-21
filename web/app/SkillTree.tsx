"use client";

import { useEffect, useRef } from "react";
import { BRANCHES, type Lesson } from "@/lib/skilltree";

const W = 960;
const H = 540;
const ROOT = { x: W / 2, y: 492 };
const BASE_Y = 392;
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

/** The skill tree picture: Ore at the root, one branch per kind of lesson, one node per lesson. */
export default function SkillTree({ tree }: { tree: Map<string, Lesson[]> }) {
  const learned = [...tree.values()].flat().filter((l) => l.kind !== "pending").length;
  const col = W / BRANCHES.length;
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // on a narrow screen the tree scrolls sideways: start at the trunk, not the first branch
    const el = wrap.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);
  return (
    <div className="skilltree-wrap" ref={wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="skilltree"
        role="img"
        aria-label={`Skill tree: ${learned} lessons learned`}
      >
        <defs>
          <radialGradient id="st-root" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#cfeaff" />
            <stop offset="100%" stopColor="#19d18b" />
          </radialGradient>
        </defs>
        {BRANCHES.map((b, i) => {
          const x = col * (i + 0.5);
          const items = tree.get(b.key) ?? [];
          const shown = items.slice(0, MAX);
          const slots = Math.min(MAX, Math.max(MIN_SLOTS, shown.length));
          const lit = items.some((l) => l.kind !== "pending");
          const level = items.filter((l) => l.kind !== "pending").length;
          const topY = BASE_Y - (slots - 1) * GAP;
          return (
            <g key={b.key} className={`st-branch${lit ? " lit" : ""}`}>
              <path
                d={`M${ROOT.x},${ROOT.y} C${ROOT.x},${ROOT.y - 50} ${x},${BASE_Y + 56} ${x},${BASE_Y}`}
                className="st-link"
              />
              {slots > 1 && <line x1={x} y1={BASE_Y} x2={x} y2={topY} className="st-link" />}
              {lit && shown.length > 1 && (
                <line
                  x1={x}
                  y1={BASE_Y}
                  x2={x}
                  y2={BASE_Y - (shown.filter((l) => l.kind !== "pending").length - 1) * GAP}
                  className="st-link glow"
                />
              )}
              {Array.from({ length: slots }, (_, k) => {
                const y = BASE_Y - k * GAP;
                const l = shown[k];
                if (!l) return <polygon key={k} points={hex(x, y, 15)} className="st-node locked" />;
                return (
                  <a key={l.id} href={`#${l.id}`} className="st-hit">
                    <title>{`${l.kind === "pending" ? "Ready to unlock: " : ""}${l.text}`}</title>
                    <polygon points={hex(x, y, 18)} className={`st-node ${l.kind}${l.decide ? " decide" : ""}`} />
                    <circle cx={x} cy={y} r={l.kind === "pending" ? 2.5 : 4} className="st-core" />
                  </a>
                );
              })}
              {items.length > MAX && (
                <text x={x} y={topY - 30} className="st-more">
                  +{items.length - MAX}
                </text>
              )}
              <text x={x} y={40} className="st-label">
                {b.label}
              </text>
              <text x={x} y={58} className="st-level">
                {level ? `LV ${level}` : "LOCKED"}
              </text>
            </g>
          );
        })}
        <g className="st-root">
          <circle cx={ROOT.x} cy={ROOT.y} r={30} className="st-root-halo" />
          <circle cx={ROOT.x} cy={ROOT.y} r={21} fill="url(#st-root)" />
          <text x={ROOT.x} y={ROOT.y + 4} className="st-root-text">
            {learned}
          </text>
        </g>
      </svg>
    </div>
  );
}
