import { requireOwner } from "@/lib/session";
import { listKeys, readText } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Lead = { app: string; email: string; creators: string; notes: string; at: string };

/** Owner only: free teardown requests from the landing page, newest first. */
export default async function Leads() {
  await requireOwner();
  const keys = (await listKeys("leads/")).sort().reverse();
  const leads = (await Promise.all(keys.map((k) => readText(k)))).filter(Boolean).map((r) => JSON.parse(r!) as Lead);
  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Teardown requests ({leads.length})</h1>
      {leads.length === 0 && <p>None yet.</p>}
      {leads.map((l) => (
        <section key={l.at + l.email} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, margin: "12px 0" }}>
          <p style={{ margin: 0 }}>
            <b>{l.app}</b> · <a href={`mailto:${l.email}`}>{l.email}</a> · {new Date(l.at).toLocaleString()}
          </p>
          {l.creators && <p style={{ whiteSpace: "pre-wrap" }}><b>Creators:</b> {l.creators}</p>}
          {l.notes && <p style={{ whiteSpace: "pre-wrap" }}><b>Notes:</b> {l.notes}</p>}
        </section>
      ))}
    </main>
  );
}
