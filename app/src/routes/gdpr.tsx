import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { submitDataSubjectRequest, listDataSubjectRequests, applyErasure, getDataSubjectRecord, type DsrRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/gdpr")({
  head: () => ({ meta: [{ title: "GDPR — práva dotknutých osôb — TRI LIPY KATASTER CORE" }] }),
  component: GdprPage,
});

const KIND_LABEL: Record<string, string> = { erasure: "výmaz (čl. 17)", objection: "námietka (čl. 21)", access: "prístup (čl. 15)", rectification: "oprava (čl. 16)" };

function GdprPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof listDataSubjectRequests>> | null>(null);
  const [kind, setKind] = useState<"erasure" | "objection" | "access" | "rectification">("objection");
  const [name, setName] = useState("");
  const [ku, setKu] = useState("");
  const [lv, setLv] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof getDataSubjectRecord>> | null>(null);
  const [lookupName, setLookupName] = useState("");

  const refresh = useCallback(() => { if (token) listDataSubjectRequests({ data: { token } }).then(setData).catch(() => {}); }, [token]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!token) return <div className="p-4 text-sm text-muted">Prihlás sa.</div>;

  async function submit() {
    if (name.trim().length < 2) { setMsg("Zadaj meno dotknutej osoby."); return; }
    setBusy(true);
    try {
      const r = await submitDataSubjectRequest({ data: { token: token!, kind, subjectName: name.trim(), subjectKu: ku || undefined, subjectLv: lv || undefined, reason: reason || undefined } });
      setMsg(r.ok ? `Žiadosť zaevidovaná${(kind === "objection" || kind === "erasure") ? " + osoba pridaná do suppression (neoslovovať)." : "."}` : (r.message ?? "Zlyhalo."));
      setName(""); setKu(""); setLv(""); setReason(""); refresh();
    } finally { setBusy(false); }
  }
  async function erase(id: number, subjectName: string) {
    if (!window.confirm(`Vymazať záznamy vlastníka „${subjectName}" z lv_owners? Nevratné.`)) return;
    const r = await applyErasure({ data: { token: token!, requestId: id, subjectName } });
    setMsg(r.ok ? `Výmaz hotový — odstránených ${r.removed} záznamov.` : (r.message ?? "Zlyhalo.")); refresh();
  }
  async function doLookup() {
    if (lookupName.trim().length < 2) return;
    const r = await getDataSubjectRecord({ data: { token: token!, name: lookupName.trim() } });
    setLookup(r);
  }

  const isAdmin = data?.access === true;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">GDPR — práva dotknutých osôb</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Evidencia žiadostí (výmaz / námietka / prístup / oprava) a suppression list (koho nespracúvať a neoslovovať). Orientačný nástroj — procesy a lehoty konzultuj s DPO/právnikom. Owner-sensitive dáta sú aj tak rolovo maskované.</p>
      </div>

      <Card className="p-4">
        <SectionHeader title="Zaevidovať žiadosť dotknutej osoby" hint="námietka/výmaz → hneď do suppression" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-sm text-muted">Typ
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg">
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Meno dotknutej osoby
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meno Priezvisko" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
          <label className="text-sm text-muted">k.ú. kód (nepovinné)
            <input value={ku} onChange={(e) => setKu(e.target.value)} placeholder="napr. 808393" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
          <label className="text-sm text-muted">LV (nepovinné)
            <input value={lv} onChange={(e) => setLv(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
          <label className="text-sm text-muted sm:col-span-2">Dôvod / poznámka (nepovinné)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => void submit()} disabled={busy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">{busy ? "…" : "Zaevidovať"}</button>
          {msg ? <span className="text-[12px] text-muted">{msg}</span> : null}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title={`Žiadosti${data ? ` (${data.requests.length})` : ""}`} hint={isAdmin ? `suppression: ${data?.suppressionCount ?? 0}` : "len admin vidí zoznam"} />
        {!isAdmin ? (
          <div className="mt-2 text-sm text-muted">Zoznam žiadostí a výmaz vidí len rola admin. Žiadosť vyššie môžeš zaevidovať aj bez toho.</div>
        ) : data && data.requests.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1">Dátum</th><th className="px-2 py-1">Typ</th><th className="px-2 py-1">Osoba</th><th className="px-2 py-1">k.ú./LV</th><th className="px-2 py-1">Stav</th><th className="px-2 py-1"></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.requests.map((r: DsrRow) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1 text-[11px] text-muted">{r.created_at?.slice(0, 16)}</td>
                    <td className="px-2 py-1 text-fg">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="px-2 py-1 text-fg">{r.subject_name}</td>
                    <td className="px-2 py-1 text-muted">{[r.subject_ku, r.subject_lv].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-2 py-1">{r.status === "resolved" ? <span className="text-green">vybavené</span> : <span className="text-muted">nové</span>}</td>
                    <td className="px-2 py-1">{r.kind === "erasure" && r.status !== "resolved" ? <button onClick={() => void erase(r.id, r.subject_name)} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink">Vybaviť výmaz</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-2 text-sm text-muted">Žiadne žiadosti.</div>}
      </Card>

      {isAdmin ? (
        <Card className="p-4">
          <SectionHeader title="Právo na prístup (čl. 15) — čo o osobe evidujeme" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={lookupName} onChange={(e) => setLookupName(e.target.value)} placeholder="Meno osoby" className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
            <button onClick={() => void doLookup()} className="rounded-md border border-line px-3 py-2 text-sm text-fg hover:border-ink">Vyhľadať</button>
          </div>
          {lookup ? (
            <div className="mt-2 text-[12px] text-muted">
              Nájdených záznamov: <b className="text-fg">{lookup.rows.length}</b>{lookup.suppressed ? " · v suppression (neoslovovať)" : ""}.
              {lookup.rows.length ? <div className="mt-1 max-h-48 overflow-auto rounded border border-line p-2 font-mono text-[11px] text-fg">{lookup.rows.map((r, i) => <div key={i}>{String(r.name)} · {String(r.dataset_id)} LV{String(r.lv_no)} · {[r.addr_obec, r.addr_cislo, r.addr_psc].filter(Boolean).join(", ")}</div>)}</div> : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
