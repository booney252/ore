import { listKeys, readText, writeText } from "./storage";

export type JobType = "report" | "scripts" | "briefs";
export type Job = {
  id: string;
  type: JobType;
  brand: string;
  idea_count?: number;
  ideas?: number[];
  report?: string;
  created_at: string;
  status?: string;
  result?: string;
  error?: string;
};

const STATES = ["pending", "running", "done", "failed", "waiting"] as const;

/** Drop a request into R2. The Python worker (`cse worker`) picks it up. */
export async function createJob(job: Omit<Job, "id" | "created_at">): Promise<string> {
  const now = new Date();
  const id = `${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await writeText(
    `jobs/pending/${id}.json`,
    JSON.stringify({ ...job, id, created_at: now.toISOString() }, null, 2),
  );
  return id;
}

export async function listJobs(brand: string, limit = 10): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const state of STATES) {
    for (const key of await listKeys(`jobs/${state}/`)) {
      const raw = await readText(key);
      if (!raw) continue;
      const job = JSON.parse(raw) as Job;
      if (job.brand === brand) jobs.push({ ...job, status: state });
    }
  }
  return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}
