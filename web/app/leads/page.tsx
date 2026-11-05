import { requireOwner } from "@/lib/session";
import { listKeys, readText } from "@/lib/storage";
import { loadReport } from "@/lib/teardown";

export const dynamic = "force-dynamic";

type Lead = { app: string; name?: string; email: string; creators?: string; notes?: string; at: string; token?: string };

/** Owner only: free teardown requests from the landing page, newest first, with each report's status. */
export default async function Leads() {
  await requireOwner();
  const keys = (await listKeys("leads/")).filter((k) => /^leads\/[^/]+\.json$/.test(k)).sort().reverse();
  const leads = (await Promise.all(keys.map((k) => readText(k)))).filter(Boolean).map((r) => JSON.parse(r!) as Lead);
  const reports = await Promise.all(leads.map((l) => (l.token ? loadReport(l.token) : null)));
  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Teardown requests ({leads.length})</h1>
      {leads.length === 0 && <p>None yet.</p>}
      {leads.map((l, i) => {
        const r = reports[i];
        return (
          <section key={l.at + l.email} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, margin: "12px 0" }}>
            <p style={{ margin: 0 }}>
              <b>{l.name ?? l.app}</b> · <a href={`mailto:${l.email}`}>{l.email}</a> · {new Date(l.at).toLocaleString()}
              {r && (
                <>
                  {" "}· <b>{r.status}</b>
                  {r.creator_count ? ` · ${r.creator_count} creators` : ""} · <a href={`/t/${r.token}`}>report</a>
                </>
              )}
            </p>
            {(r?.creators || l.creators) && <p style={{ whiteSpace: "pre-wrap" }}><b>Creators:</b> {r?.creators || l.creators}</p>}
            {l.notes && <p style={{ whiteSpace: "pre-wrap" }}><b>Notes:</b> {l.notes}</p>}
          </section>
        );
      })}
    </main>
  );
}
