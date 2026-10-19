import { tone, type Grade as G } from "@/lib/score";

/** A letter grade, coloured by how good it is. */
export default function Grade({ g, size = "" }: { g: G; size?: "" | "sm" | "lg" }) {
  return <span className={`grade ${tone(g)} ${size}`}>{g}</span>;
}
