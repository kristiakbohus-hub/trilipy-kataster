import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  generateReport,
  getDatasets,
  listReports,
  setReportStatus,
} from "../lib/api/kataster.functions";
import { REPORT_KIND_LABEL, REPORT_STATUS_META, canExport, canSign } from "../lib/domain";
import { Badge, Card, Disclaimer, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

type Kind = "evidence_list" | "parcel_pack" | "map_sheet";

export const Route = createFileRoute("/reporty")({
  head: () => ({ meta: [{ title: "Reporty — TRI LIPY KATASTER CORE" }] }),
  loader: async () => ({ reports: await listReports(), datasets: await getDatasets() }),
  component: ReportsPage,
});

function ReportsPage() {
  const { reports, datasets } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();

  const usable = datasets.filter((d) => d.status !== "blocked");
  const [datasetId, setDatasetId] = useState(usable[0]?.id ?? "");
  const [kind, setKind] = useState<Kind>("evidence_list");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function generate() {
    if (!datasetId || title.trim().length < 3) {
      setNote("Zadaj dataset a názov (min. 3 znaky).");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const r = await generateReport({ data: { datasetId, kind, title: title.trim(), role } });
      setNote(r.ok ? `Report vytvorený (draft, audit ${r.hash}).` : r.message ?? "Neúspešné.");
      if (r.ok) setTitle("");
      router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: number, status: "review" | "signed") {
    const r = await setReportStatus({ data: { id, status, role } });
    if (!r.ok) setNote(r.message ?? "Neúspešné.");
    router.invalidate();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Report Center</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Evidenčné listy, parcel packy a mapové listy s audit hashom. Export a podpis sú rolovo gatované.
        </p>
      </div>

      {/* Generovať */}
      <Card className="p-5">
        <SectionHeader title="Generovať report" hint={canExport(role) ? "Vytvorí sa draft s audit stopou." : "Rola nemá oprávnenie generovať export."} />
        <div className="grid gap-3 md:grid-cols-4">
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} disabled={!canExport(role)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50">
            {usable.map((d) => <option key={d.id} value={d.id}>{d.ku_name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} disabled={!canExport(role)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50">
            <option value="evidence_list">Evidenčný list</option>
            <option value="parcel_pack">Parcel report pack</option>
            <option value="map_sheet">Mapový list</option>
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canExport(role)} placeholder="Názov reportu" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50 md:col-span-1" />
          <button onClick={generate} disabled={!canExport(role) || busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {busy ? "Generujem…" : "Generovať"}
          </button>
        </div>
        {note ? <div className="mt-3 text-sm text-muted">{note}</div> : null}
      </Card>

      {/* Zoznam */}
      <div>
        <SectionHeader title="Reporty" hint={`${reports.length} záznamov`} />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Report</th>
                <th className="px-4 py-2 font-medium">Územie</th>
                <th className="px-4 py-2 font-medium">Typ</th>
                <th className="px-4 py-2 font-medium">Audit</th>
                <th className="px-4 py-2 font-medium">Stav</th>
                <th className="px-4 py-2 font-medium text-right">Akcia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => {
                const sm = REPORT_STATUS_META[r.status] ?? { label: r.status, color: "#8a8a8a" };
                return (
                  <tr key={r.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-2 text-fg">{r.title}</td>
                    <td className="px-4 py-2 text-muted">{r.ku_name}</td>
                    <td className="px-4 py-2 text-muted">{REPORT_KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{r.audit_hash ?? "—"}</td>
                    <td className="px-4 py-2"><Badge color={sm.color}>{sm.label}</Badge></td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Link to="/reporty/$id" params={{ id: String(r.id) }} className="rounded-md border border-line px-2 py-1 text-xs text-fg hover:bg-surface-2">
                          Otvoriť
                        </Link>
                        {r.status === "draft" && canExport(role) ? (
                          <button onClick={() => changeStatus(r.id, "review")} className="rounded-md border border-line px-2 py-1 text-xs text-fg hover:bg-surface-2">→ review</button>
                        ) : null}
                        {r.status !== "signed" && canSign(role) ? (
                          <button onClick={() => changeStatus(r.id, "signed")} className="rounded-md border border-line px-2 py-1 text-xs text-brand hover:bg-surface-2">podpísať</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Disclaimer>
        Report je interný pracovný podklad — nezískava význam podľa toho, kto ho otvorí. Podpis (audit hash)
        potvrdzuje verziu a rolu, nie právnu ani geodetickú správnosť obsahu.
      </Disclaimer>
    </div>
  );
}
