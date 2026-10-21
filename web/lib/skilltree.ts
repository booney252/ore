/**
 * The Skill Tree: Ore's copy lessons sorted into branches for the picture on the Skill Tree page.
 * Display only; the prompts still get the lessons as written (cse/lessons.py for_prompt).
 */

export type Branch = { key: string; label: string; note: string };

export const BRANCHES: Branch[] = [
  { key: "hooks", label: "Hooks", note: "The first second" },
  { key: "stakes", label: "The why", note: "Why it matters" },
  { key: "structure", label: "Structure", note: "Beats and belief shifts" },
  { key: "proof", label: "Trust", note: "Authority and proof" },
  { key: "awareness", label: "Awareness", note: "Funnel stage" },
  { key: "voice", label: "Voice", note: "Words and tone" },
  { key: "production", label: "Production", note: "Filming and edit" },
  { key: "compliance", label: "Compliance", note: "What we can claim" },
];

// First match wins, tested on a lesson's lead sentence (the rule itself, not its fine print).
const RULES: [string, RegExp][] = [
  ["compliance", /\b(claims?|ad limits|compliance|dosing|cures?|disclos\w*|FTC)\b/i],
  ["proof", /\b(trust\w*|credib\w*|authority|tenure|proof|testimonial\w*|social proof|results? screenshot)\b/i],
  ["hooks", /\b(hooks?|callout|call-out|opening line|first line|first (?:3|three) sec\w*|scroll)\b/i],
  ["awareness", /\b(TOFU|MOFU|BOFU|funnel|awareness|alternatives?|replaces?|notes app|unaware)\b/i],
  ["stakes", /\b(why|stakes?|so what|consequence|reason|half-life|mechanism|care)\b/i],
  ["structure", /\b(structure|belief shift|beats?|sections?|payoff|listicle|lists?|story|order|overwhelm\w*|angle)\b/i],
  ["production", /\b(b-roll|broll|shots?|film\w*|edit\w*|reuse|recycled|stock|visual|camera|creators?|variants?)\b/i],
];

export type Lesson = {
  id: string;
  text: string;
  source: string;
  kind: "brand" | "craft" | "pending";
  decide: boolean;
  branch: string;
};

/** A markdown bullet list -> one string per bullet (continuation lines kept), like cse/lessons.py bullets. */
export function bullets(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    if (/^\s*[-*]\s+/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, "").trim());
    else if (line.trim() && out.length) out[out.length - 1] += " " + line.trim();
  }
  return out.filter((b) => b && b !== "...");
}

export function branchOf(text: string): string {
  const lead = text
    .replace(/\((?:compliance check|decide)\)/gi, "")
    .replace(/^(?:keep(?: as an option)?|retire|avoid|never|don't)\s*:\s*/i, "")
    .split(/(?<=[.!?])\s/)[0];
  return RULES.find(([, re]) => re.test(lead))?.[0] ?? "voice";
}

/** "Rule text. [Who, Brief 1]" -> the rule and its source. */
function split(text: string): { text: string; source: string } {
  const m = text.match(/^(.*?)\s*\[([^\]]+)\]\s*$/s);
  return m ? { text: m[1].trim(), source: m[2].trim() } : { text, source: "" };
}

export function lesson(raw: string, kind: Lesson["kind"], id: string): Lesson {
  const { text, source } = split(raw);
  return { id, text, source, kind, decide: /\(decide\)/i.test(text), branch: branchOf(text) };
}

export function grow(brand: string, craft: string, pending: { id: string; text: string }[]): Map<string, Lesson[]> {
  const all = [
    ...bullets(brand).map((t, i) => lesson(t, "brand", `b${i + 1}`)),
    ...bullets(craft).map((t, i) => lesson(t, "craft", `c${i + 1}`)),
    ...pending.map((s) => lesson(s.text, "pending", `s-${s.id}`)),
  ];
  const tree = new Map(BRANCHES.map((b) => [b.key, [] as Lesson[]]));
  for (const l of all) tree.get(l.branch)!.push(l);
  // learned lessons grow from the trunk; ones waiting for approval sit at the tip
  for (const list of tree.values()) list.sort((a, b) => Number(a.kind === "pending") - Number(b.kind === "pending"));
  return tree;
}
