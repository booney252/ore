import { deleteKey, listKeys, readText, writeText } from "./storage";

export type JobType = "report" | "iterations" | "briefs" | "setup" | "research" | "ingredients" | "mechanisms" | "rank_mechanisms" | "scripts";
export type Job = {
  id: string;
  type: JobType;
  brand: string;
  format?: string;
  report?: string;
  ads?: number[];
  per_ad?: number;
  idea?: string;
  creator?: string;
  count?: number;
  notes?: string;
  iterations?: string;
  numbers?: number[];
  picks?: { iterations: string; number: number }[];
  created_at: string;
  status?: string;
  result?: string;
  error?: string;
};

const STATES = ["pending", "running", "done", "failed", "waiting", "cancelled"] as const;
const JOB_ID = /^[0-9]{14}-[a-z0-9]{1,12}$/;

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

export async function listJobs(brand: string, limit = 10, types?: JobType[]): Promise<Job[]> {
  const [jobs, cancelling] = await Promise.all([
    Promise.all(
      STATES.map(async (state) => {
        const out: Job[] = [];
        for (const key of await listKeys(`jobs/${state}/`)) {
          const raw = await readText(key);
          if (!raw) continue;
          const job = JSON.parse(raw) as Job;
          if (job.brand === brand && (!types || types.includes(job.type))) {
            out.push({ ...job, status: state });
          }
        }
        return out;
      }),
    ).then((lists) => lists.flat()),
    listKeys("jobs/cancel/"),
  ]);
  for (const job of jobs) {
    if (job.status === "running" && cancelling.includes(`jobs/cancel/${job.id}.json`)) {
      job.status = "cancelling";
    }
  }
  return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

/**
 * Cancel a request. Pending or waiting: removed now. Running: the worker stops at its next
 * step (it watches jobs/cancel/). Cancelling a brand's setup removes the brand too.
 * Returns whether the brand was removed right away.
 */
export async function cancelJob(brand: string, id: string): Promise<{ brandRemoved: boolean }> {
  if (!JOB_ID.test(id)) throw new Error("bad job id");
  for (const state of ["pending", "waiting", "running"] as const) {
    const key = `jobs/${state}/${id}.json`;
    const raw = await readText(key);
    if (!raw) continue;
    const job = JSON.parse(raw) as Job;
    if (job.brand !== brand) throw new Error("job belongs to another brand");
    const removeBrand = job.type === "setup";
    if (state === "running") {
      await writeText(`jobs/cancel/${id}.json`, JSON.stringify({ remove_brand: removeBrand }));
      return { brandRemoved: false };
    }
    await writeText(
      `jobs/cancelled/${id}.json`,
      JSON.stringify({ ...job, updated_at: new Date().toISOString() }, null, 2),
    );
    await deleteKey(key);
    if (removeBrand) {
      for (const k of await listKeys(`brands/${brand}/`)) await deleteKey(k);
    }
    return { brandRemoved: removeBrand };
  }
  return { brandRemoved: false };
}
