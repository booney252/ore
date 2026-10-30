/**
 * The Research page's navigation: the brand brain in the middle, with a stem out to each part of
 * the research. Inputs grow off the left (ruby) side, what's built from them off the right
 * (emerald). Plain SVG links; on narrow screens the page shows pill tabs instead.
 */

export type BrainNode = {
  key: string;
  label: string;
  sub: string;
  href: string;
  has: boolean;
  side: "left" | "right";
};

const W = 1000;
const H = 440;
const CX = 500;
const CY = 220;

// One hemisphere (the left); the right is its mirror image.
export const HEMI =
  "M496,92 C452,74 398,86 374,120 C340,122 318,152 322,184 C298,204 300,246 324,264 " +
  "C318,298 344,330 382,334 C402,362 448,370 474,352 C486,358 494,354 496,348 Z";
export const FOLDS = [
  "M470,108 C446,118 456,138 432,146 C414,152 418,170 400,176",
  "M486,150 C462,156 470,178 446,186 C424,194 432,214 408,222 C390,228 372,222 352,232",
  "M480,214 C456,222 466,244 440,252 C418,260 428,280 402,288",
  "M476,280 C456,290 468,308 446,318 C430,326 420,318 404,326",
  "M366,150 C356,166 368,180 356,196",
  "M352,262 C366,272 360,290 376,300",
];

/** Where each stem meets the brain's edge. */
function anchor(side: "left" | "right", i: number, n: number): [number, number] {
  const t = n === 1 ? 0.5 : i / (n - 1);
  const y = CY - 95 + t * 190;
  const dx = 150 * Math.sqrt(Math.max(0, 1 - ((y - CY) / 150) ** 2));
  return [side === "left" ? CX - dx - 8 : CX + dx + 8, y];
}

export default function BrainMap({ nodes, active }: { nodes: BrainNode[]; active: string }) {
  const sides = { left: nodes.filter((n) => n.side === "left"), right: nodes.filter((n) => n.side === "right") };
  return (
    <nav className="brain-map" aria-label="Research">
      <svg viewBox={`0 0 ${W} ${H}`} role="presentation">
        <defs>
          {/* Both hemispheres are drawn in left-side coordinates (the right one mirrored), so each
              gradient runs from the outer edge (x=320) to the middle (x=500). */}
          <linearGradient id="edge-ruby" gradientUnits="userSpaceOnUse" x1="320" x2="500" y1="0" y2="0">
            <stop offset="0" stopColor="#e5488f" />
            <stop offset="1" stopColor="#f7c6dc" />
          </linearGradient>
          <linearGradient id="edge-emerald" gradientUnits="userSpaceOnUse" x1="320" x2="500" y1="0" y2="0">
            <stop offset="0" stopColor="#705ce6" />
            <stop offset="1" stopColor="#ddd6fb" />
          </linearGradient>
          <linearGradient id="fill-ruby" gradientUnits="userSpaceOnUse" x1="320" x2="500" y1="0" y2="0">
            <stop offset="0" stopColor="#e5488f" stopOpacity="0.6" />
            <stop offset="1" stopColor="#2d63d8" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="fill-emerald" gradientUnits="userSpaceOnUse" x1="320" x2="500" y1="0" y2="0">
            <stop offset="0" stopColor="#705ce6" stopOpacity="0.6" />
            <stop offset="1" stopColor="#2d63d8" stopOpacity="0.3" />
          </linearGradient>
          <radialGradient id="brain-glow">
            <stop offset="0" stopColor="#2d63d8" stopOpacity="0.28" />
            <stop offset="1" stopColor="#2d63d8" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <ellipse className="brain-aura" cx={CX} cy={CY} rx="250" ry="190" fill="url(#brain-glow)" />

        {(["left", "right"] as const).map((side) =>
          sides[side].map((n, i) => {
            const [ax, ay] = anchor(side, i, sides[side].length);
            const nx = side === "left" ? 150 : W - 150;
            const ny = 60 + (i * (H - 120)) / Math.max(1, sides[side].length - 1);
            const mid = (nx + ax) / 2;
            const d = `M${nx},${ny} C${mid},${ny} ${mid},${ay} ${ax},${ay}`;
            const on = n.key === active;
            return (
              <a key={n.key} href={n.href} className={`brain-node ${side} ${on ? "on" : ""} ${n.has ? "is-done" : "is-todo"}`}>
                <title>{`${n.label}: ${n.sub}`}</title>
                <path className="stem-glow" d={d} />
                <path className="stem" d={d} />
                <circle className="node-halo" cx={nx} cy={ny} r="18" />
                <circle className="node-dot" cx={nx} cy={ny} r="7" />
                <circle className="node-end" cx={ax} cy={ay} r="3" />
                <text
                  x={side === "left" ? nx - 22 : nx + 22}
                  y={ny - 4}
                  textAnchor={side === "left" ? "end" : "start"}
                  className="node-label"
                >
                  {n.label}
                </text>
                <text
                  x={side === "left" ? nx - 22 : nx + 22}
                  y={ny + 18}
                  textAnchor={side === "left" ? "end" : "start"}
                  className="node-sub"
                >
                  {n.sub}
                </text>
                {/* a bigger, invisible hit area for the whole row */}
                <rect
                  x={side === "left" ? nx - 200 : nx - 24}
                  y={ny - 28}
                  width="224"
                  height="56"
                  fill="transparent"
                />
              </a>
            );
          }),
        )}

        <g className="brain">
          <g filter="url(#soft)" opacity="0.7">
            <path d={HEMI} fill="url(#fill-ruby)" />
            <path d={HEMI} fill="url(#fill-emerald)" transform={`translate(${W},0) scale(-1,1)`} />
          </g>
          {[false, true].map((mirror) => (
            <g key={String(mirror)} transform={mirror ? `translate(${W},0) scale(-1,1)` : undefined}>
              <path d={HEMI} className="hemi" stroke={mirror ? "url(#edge-emerald)" : "url(#edge-ruby)"} />
              {FOLDS.map((f) => (
                <path key={f} d={f} className="fold" />
              ))}
            </g>
          ))}
          <rect x={CX - 70} y={CY - 15} width="140" height="30" rx="15" className="brain-pill" />
          <text x={CX} y={CY + 5} textAnchor="middle" className="brain-word">
            BRAND BRAIN
          </text>
        </g>
      </svg>
    </nav>
  );
}
