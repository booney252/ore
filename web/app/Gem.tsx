export type GemKind = "ruby" | "emerald" | "diamond" | "sapphire" | "amethyst";

const SHADES: Record<GemKind, [string, string, string]> = {
  ruby: ["#ff8aa5", "#e3134f", "#5e0420"],
  emerald: ["#8affc9", "#12b97b", "#033f2d"],
  diamond: ["#ffffff", "#bfe6ff", "#4f7594"],
  sapphire: ["#9cc3ff", "#2a5cf0", "#0a1a5e"],
  amethyst: ["#e2bcff", "#9b4dff", "#341060"],
};

const KINDS: GemKind[] = ["emerald", "ruby", "sapphire", "amethyst", "diamond"];

/** A stable gem for anything with a name (brands). */
export function gemFor(name: string): GemKind {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return KINDS[h % KINDS.length];
}

/** A brilliant-cut gem seen from the side: crown facets over pavilion facets. */
export default function Gem({ kind, size = 40, glow = true }: { kind: GemKind; size?: number; glow?: boolean }) {
  const [light, mid, dark] = SHADES[kind];
  const id = `gem-${kind}`;
  const A = "4,20", B = "18,4", D = "46,4", E = "22,20", F = "32,20", G = "42,20", H = "60,20", C = "32,54";
  const facets: [string, string, number][] = [
    // crown
    [`${A} ${B} ${E}`, `url(#${id}-top)`, 0.85],
    [`${B} ${F} ${E}`, `url(#${id}-top)`, 1],
    [`${B} ${D} ${F}`, light, 0.9],
    [`${D} ${G} ${F}`, `url(#${id}-top)`, 0.75],
    [`${D} ${H} ${G}`, `url(#${id}-top)`, 0.6],
    // pavilion
    [`${A} ${E} ${C}`, `url(#${id}-low)`, 0.7],
    [`${E} ${F} ${C}`, `url(#${id}-low)`, 1],
    [`${F} ${G} ${C}`, mid, 0.85],
    [`${G} ${H} ${C}`, `url(#${id}-low)`, 0.55],
  ];
  return (
    <svg
      className={`gem gem-${kind}${glow ? " glow" : ""}`}
      width={size}
      height={(size * 58) / 64}
      viewBox="0 0 64 58"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
        <linearGradient id={`${id}-low`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      {facets.map(([pts, fill, op], i) => (
        <polygon key={i} points={pts} fill={fill} fillOpacity={op} stroke={light} strokeOpacity="0.35" strokeWidth="0.6" strokeLinejoin="round" />
      ))}
      <polygon points="21,6 27,6 23,15" fill="#fff" fillOpacity="0.75" />
    </svg>
  );
}
