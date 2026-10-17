import CancelButton from "./CancelButton";
import { FORMAT_LABEL } from "./FormatPicker";
import type { Job } from "@/lib/jobs";

const LABEL: Record<string, string> = {
  report: "Winning Ads Report",
  iterations: "Iterations",
  briefs: "Creative briefs",
  setup: "Brand setup",
  research: "Research refresh",
};
const ACTIVE = ["pending", "running", "waiting"];

function what(j: Job): string {
  const parts = [LABEL[j.type] ?? j.type];
  if (j.ads?.length) parts.push(`winners #${j.ads.join(", #")}`);
  if (j.numbers?.length) parts.push(`iterations ${j.numbers.join(", ")}`);
  if (j.format) parts.push(FORMAT_LABEL[j.format] ?? j.format);
  return parts.join(" · ");
}

/** Requests for one tab, newest first, with Cancel while they're queued or running. */
export default function Requests({ brand, jobs, back }: { brand: string; jobs: Job[]; back: string }) {
  if (jobs.length === 0) return null;
  return (
    <section className="block">
      <h2>Requests</h2>
      <ul className="jobs">
        {jobs.map((j) => (
          <li key={j.id}>
            <span className={`status ${j.status}`}>{j.status}</span>
            <span>{what(j)}</span>
            <span className="mono muted">{new Date(j.created_at).toLocaleString()}</span>
            {ACTIVE.includes(j.status ?? "") ? (
              <CancelButton brand={brand} id={j.id} setup={j.type === "setup"} back={back} />
            ) : null}
            {j.error ? <span className="error">{j.error}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
