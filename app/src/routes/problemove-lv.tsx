import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listProblemLvs, type ProblemLv } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { Card, SectionHeader } from "../components/kit";

// PROBLÉMOVÉ LV (zadanie vlastníka 2026-11-11, body 14 a 15): LV s poznámkou v časti C — exekúcia, súdne konanie,
// konkurz, dražba, spochybnené vlastníctvo, zákaz nakladania — a rozostavané stavby. Signál, kto môže potrebovať
// predať, a zároveň riziko pri kúpe. Bez mien (tie sú na výpise LV pri plnom prístupe). BEZ `loader`.
export const Route = createFileRoute("/problemove-lv")({
  head: () => ({ meta: [{ title: "Problémové LV — TRI LIPY KATASTER CORE" }] }),
  component: ProblemPage,
});

const KINDS: { id: string; label: string }[] = [
  { id: "exekucia", label: "Exekúcia" }, { id: "drazba", label: "Dražba" }, { id: "konkurz", label: "Konkurz" },
  { id: "sudne_konanie", label: "Súdne konanie" }, { id: "spochybnene", label: "Spochybnené vlastníctvo" },
  { id: "zakaz", label: "Zákaz nakladania" }, { id: "rozostavana_stavba", label: "Rozostavaná budova" },
  { id: "rozostavany_priestor", label: "Rozostavaný byt / priestor" }, { id: "poznamka", label: "Iná poznámka" },
];

function ProblemPage() {
  const { token } = useAuth();
  const [kinds, setKinds] = useState<string[]>(["exekucia", "drazba", "konkurz"]);
  const [fromYear, setFromYear] = useState<string>(String(new Date().getFullYear() - 3));
  const [res, setRes] = useState<{ rows: ProblemLv[]; total: number; byKind: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!token || !kinds.length) return;
    setRes(null);
    listProblemLvs({ data: { token, kinds: kinds as never, fromYear: fromYear ? Number(fromYear) : undefined, limit: 300 } })
      .then((r) => setRes({ rows: r.rows, total: r.total, byKind: r.byKind })).catch(() => setRes({ rows: [], total: 0, byKind: {} }));
  }, [token, kinds, fromYear]);
  if (!token) return <div className="p-4 text-sm text-muted">Prihlás sa.</div>;
  const toggle = (k: string) => setKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  const label = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Problémové LV</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Listy vlastníctva s poznámkou v časti C (exekúcia, dražba, konkurz, súdne konanie, spochybnené vlastníctvo, zákaz
          nakladania) a rozostavané stavby. Vlastník pod tlakom môže chcieť predať — a kupca to upozorní na riziko.
          Poznámka môže byť staršia ako aktuálny stav; overte na výpise LV a v listine.
        </p>
      </div>
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => toggle(k.id)} aria-pressed={kinds.includes(k.id)}
              className={`rounded-full border px-2.5 py-1 text-xs max-md:py-1.5 ${kinds.includes(k.id) ? "border-ink bg-ink text-cream" : "border-line text-fg hover:border-ink"}`}>
              {k.label}{res?.byKind[k.id] != null ? <span className="ml-1 tabular-nums opacity-80">{res.byKind[k.id]}</span> : null}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">poznámka z roku od
          <select value={fromYear} onChange={(e) => setFromYear(e.target.value)} className="rounded-md border border-line bg-paper px-2 py-1 text-fg">
            <option value="">kedykoľvek</option>
            {[0, 1, 2, 3, 5, 10].map((d) => { const y = new Date().getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
          </select>
        </label>
      </Card>
      <Card className="p-4">
        <SectionHeader title={res ? `LV (${res.rows.length}${res.total > res.rows.length ? ` z ${res.total}` : ""})` : "LV"} hint="zoradené podľa roku poznámky, potom výmery" />
        {!kinds.length ? <p className="mt-2 text-sm text-muted">Vyber aspoň jeden druh.</p> : !res ? <p className="mt-2 text-sm text-muted">Načítavam…</p> : res.rows.length === 0 ? <p className="mt-2 text-sm text-muted">Nič pre tento výber.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-1 pr-3 font-medium">k.ú. · LV</th><th className="py-1 pr-3 font-medium">Príznaky</th><th className="py-1 pr-3 text-right font-medium">Rok</th>
                <th className="py-1 pr-3 text-right font-medium">Vlastníci</th><th className="py-1 pr-3 text-right font-medium">Výmera</th><th className="py-1 font-medium"></th>
              </tr></thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={`${r.datasetId}:${r.lvNo}`} className="border-t border-line/60 align-top">
                    <td className="py-1 pr-3 text-fg">{r.kuName ?? r.datasetId} · <b>LV {r.lvNo}</b>{r.parcels ? <span className="block text-[11px] text-muted">parc. {r.parcels.split(",").slice(0, 4).join(", ")}</span> : null}</td>
                    <td className="py-1 pr-3">{r.kinds.map((k) => label(k)).join(", ")}{(r.absenter ?? 0) >= 0.5 ? <span className="block text-[11px] text-muted">vlastníci bývajú inde</span> : null}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{r.lastYear ?? "—"}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{r.coOwners ?? "—"}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{r.totalArea ? `${Math.round(r.totalArea).toLocaleString("sk-SK")} m²` : "—"}</td>
                    <td className="py-1 text-right"><Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: r.datasetId, lvNo: String(r.lvNo) }} search={{ typ: "vypis" as const }} className="text-brand hover:underline">výpis LV →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Zdroj: kataster (SPI, poznámky časti C). Odvodený signál, nie právne posúdenie. Mená vidí len plný prístup na výpise LV.</p>
      </Card>
    </div>
  );
}
