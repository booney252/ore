import Link from "next/link";
import { brandName } from "@/lib/brands";
import { listJobs } from "@/lib/jobs";
import { hookOf, listMasters, progress, stale } from "@/lib/masters";
import { statusesFor } from "@/lib/portal";
import { Band, Working } from "../../ui";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

/** The scripts, grouped by the day the idea came in, each with where its creators are. */
export default async function Scripts({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const q = await searchParams;
  const [name, masters, jobs, statuses] = await Promise.all([brandName(brand), listMasters(brand), listJobs(brand, 20), statusesFor(brand)]);
  const writing = q.writing || jobs.some((j) => (j.status === "pending" || j.status === "running") && j.type === "master");
  const groups: { day: string; items: typeof masters }[] = [];
  for (const m of masters) {
    const d = day(m.created_at);
    const g = groups.find((x) => x.day === d);
    if (g) g.items.push(m);
    else groups.push({ day: d, items: [m] });
  }
  const toReview = masters.filter((m) => m.status === "draft").length;
  return (
    <>
      <Band
        brand={brand}
        name={name}
        label="Scripts"
        title={masters.length ? (toReview ? `${toReview} script${toReview === 1 ? "" : "s"} to review.` : "Your scripts.") : "No scripts yet."}
        sub="Review each script once. Ore makes every creator's version from it."
      />
      <main className="oa-main">
        <div className="oa-wrap oa-stack">
          {writing && <Working text="Ore is writing and checking a new script." />}
          {masters.length === 0 && (
            <div className="oa-card oa-empty">Pick a breakout on This week and tap "Write the script". Ore writes one script you review, then a version for each creator.</div>
          )}
          {groups.map((g) => (
            <section key={g.day} className="oa-stack">
              <h2 className="oa-h2">{g.day}</h2>
              <div className="ms-list">
                {g.items.map((m) => {
                  const p = progress(m, statuses);
                  const ready = m.creators.filter((c) => m.versions[c]?.status === "ready" && !stale(m, m.versions[c])).length;
                  const sent = p.todo + p.filmed + p.edited + p.done;
                  return (
                    <Link key={m.id} href={`/app/${brand}/scripts/${m.id}`} className="oa-card ms-item">
                      <span className={`cp-pill ${m.status === "approved" ? "done" : "filmed"}`}>{m.status === "approved" ? "Approved" : "To review"}</span>
                      <b>{m.title}</b>
                      {hookOf(m.md) && <q>{hookOf(m.md)}</q>}
                      {p.creators > 0 && (
                        <div className="ms-prog">
                          <div className="cp-bar" aria-hidden>
                            {p.done > 0 && <i className="done" style={{ flex: p.done }} />}
                            {p.edited > 0 && <i className="edited" style={{ flex: p.edited }} />}
                            {p.filmed > 0 && <i className="filmed" style={{ flex: p.filmed }} />}
                            {p.todo + p.review > 0 && <i className="todo" style={{ flex: p.todo + p.review }} />}
                          </div>
                          <span className="oa-small oa-muted">
                            {sent === 0
                              ? ready
                                ? `${ready} creator version${ready === 1 ? "" : "s"} ready for you`
                                : `${p.creators} creator${p.creators === 1 ? "" : "s"}`
                              : [`${p.done} of ${p.creators} done`, p.edited && `${p.edited} edited`, p.filmed && `${p.filmed} filmed`, p.todo && `${p.todo} to film`, ready && `${ready} ready for you`].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
