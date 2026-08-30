import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { addZoningFinding, getDatasets, listZoning } from "../lib/api/kataster.functions";
import { ZONING_STATUS_META, canRunPipeline } from "../lib/domain";
import { Badge, Card, Disclaimer, Icon, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";

type Cat = "zoning" | "access";
type St = "screening" | "possible" | "unclear" | "review" | "unknown";

export const Route = createFileRoute("/zoning")({
  head: () => ({ meta: [{ title: "Územný plán & prístup — TRI LIPY KATASTER CORE" }] }),
  loader: async () => ({ zoning: await listZoning(), datasets: await getDatasets() }),
  component: ZoningPage,
});

const KIND_LABEL: Record<string, string> = {
  up_layer: "ÚP vrstva",
  up_pdf: "ÚP PDF",
  access_layer: "Prístupová vrstva",
};

function ZoningPage() {
  const { zoning, datasets } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const usable = datasets.filter((d) => d.status !== "blocked");

  const [datasetId, setDatasetId] = useState(usable[0]?.id ?? "");
  const [category, setCategory] = useState<Cat>("zoning");
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<St>("screening");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const zoningFindings = zoning.findings.filter((f) => f.category === "zoning");
  const accessFindings = zoning.findings.filter((f) => f.category === "access");

  async function add() {
    if (!datasetId || label.trim().length < 3) { setNote("Zadaj dataset a popis (min. 3 znaky)."); return; }
    setBusy(true); setNote(null);
    try {
      const r = await addZoningFinding({ data: { datasetId, category, label: label.trim(), status, target: target.trim() || undefined, role } });
      setNote(r.ok ? "Screening finding pridaný." : r.message ?? "Neúspešné.");
      if (r.ok) { setLabel(""); setTarget(""); }
      router.invalidate();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Územný plán &amp; prístup</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pracovný <b>screening</b> územnoplánovacieho a prístupového kontextu parciel. Nie je to právny ani
          územnoplánovací záver — cesta v mape ≠ právne zabezpečený prístup.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Zdroje ÚP/prístup" value={zoning.sources.length} />
        <Stat label="Zoning findings" value={zoningFindings.length} />
        <Stat label="Access findings" value={accessFindings.length} />
        <Stat label="Datasety" value={usable.length} />
      </div>

      {/* Zdroje */}
      <div>
        <SectionHeader title="Registrované zdroje" hint="Manuálne / screening-only vrstvy so zdrojom a dátumom." />
        <Card className="divide-y divide-line">
          {zoning.sources.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted">{KIND_LABEL[s.kind] ?? s.kind}</span>
              <span className="text-sm font-medium text-fg">{s.name}</span>
              <span className="text-xs text-muted">{s.ku_name}{s.source_date ? ` · ${s.source_date}` : ""}</span>
              <Badge color="#9a7b3e">screening-only</Badge>
              {s.note ? <span className="w-full text-xs text-muted md:w-auto md:flex-1">{s.note}</span> : null}
            </div>
          ))}
        </Card>
      </div>

      {/* Findings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <FindingList title="Územný plán (zoning)" icon="zone" findings={zoningFindings} />
        <FindingList title="Prístup (access review)" icon="map" findings={accessFindings} />
      </div>

      {/* Pridať finding */}
      <Card className="p-5">
        <SectionHeader title="Pridať screening finding" hint={canRunPipeline(role) ? "Manuálny review záznam." : "Rola nemá oprávnenie."} />
        <div className="grid gap-3 md:grid-cols-6">
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} disabled={!canRunPipeline(role)} className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50 md:col-span-2">
            {usable.map((d) => <option key={d.id} value={d.id}>{d.ku_name}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value as Cat)} disabled={!canRunPipeline(role)} className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50">
            <option value="zoning">Zoning</option>
            <option value="access">Access</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as St)} disabled={!canRunPipeline(role)} className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50">
            {(Object.keys(ZONING_STATUS_META) as St[]).map((k) => <option key={k} value={k}>{ZONING_STATUS_META[k].label}</option>)}
          </select>
          <input value={target} onChange={(e) => setTarget(e.target.value)} disabled={!canRunPipeline(role)} placeholder="Cieľ (parcela/výber/LV)" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canRunPipeline(role)} placeholder="Popis zistenia" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50 md:col-span-5" />
          <button onClick={add} disabled={!canRunPipeline(role) || busy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {busy ? "…" : "Pridať"}
          </button>
        </div>
        {note ? <div className="mt-3 text-sm text-muted">{note}</div> : null}
      </Card>

      <Disclaimer>
        Zoning a access výstupy sú automatický mapový/dátový screening, nie odborná interpretácia. Nevytvárajú
        boolean „stavebný" ani „má právny prístup". Odborný záver vyžaduje manuálne posúdenie a zdrojovú kontrolu.
      </Disclaimer>
    </div>
  );
}

function FindingList({ title, icon, findings }: { title: string; icon: string; findings: { id: number; label: string; status: string; target: string | null; note: string | null; source_ref: string | null; ku_name?: string }[] }) {
  return (
    <div>
      <SectionHeader title={title} hint={`${findings.length} záznamov`} />
      <Card className="divide-y divide-line">
        {findings.length === 0 ? (
          <div className="p-4 text-sm text-muted">Žiadne findings.</div>
        ) : (
          findings.map((f) => {
            const sm = ZONING_STATUS_META[f.status] ?? { label: f.status, color: "#8a8a8a" };
            return (
              <div key={f.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name={icon} size={15} className="text-muted" />
                    <span className="text-sm font-medium text-fg">{f.label}</span>
                  </div>
                  <Badge color={sm.color}>{sm.label}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {f.target ? <span className="text-fg">{f.target}</span> : null}
                  {f.source_ref ? ` · zdroj: ${f.source_ref}` : ""}
                </div>
                {f.note ? <div className="mt-1 text-xs text-muted">{f.note}</div> : null}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
