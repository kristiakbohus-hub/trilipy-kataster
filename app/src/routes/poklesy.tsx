import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getPriceDrops, getBuildingLand, type PriceDrop, type BuildingDeal } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/poklesy")({
  head: () => ({ meta: [{ title: "Cenové poklesy — TRI LIPY KATASTER CORE" }] }),
  component: PoklesyPage,
});

const eur = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("sk-SK") + " €");

function PoklesyPage() {
  const { role } = useRole();
  const [drops, setDrops] = useState<PriceDrop[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  const [minDrop, setMinDrop] = useState(8);
  const [land, setLand] = useState<BuildingDeal[] | null>(null);
  const [landMed, setLandMed] = useState<Record<string, number>>({});

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      const r = await getPriceDrops({ data: { role, minDrop, refresh } });
      setDrops(r.drops);
      setAge(r.cached ? (r.ageDays ?? null) : 0);
    } catch { setDrops([]); }
    finally { setBusy(false); }
  }, [role, minDrop]);

  const loadLand = useCallback(async (refresh = false) => {
    try {
      const r = await getBuildingLand({ data: { role, refresh } });
      setLand(r.deals); setLandMed(r.medians ?? {});
    } catch { setLand([]); }
  }, [role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadLand(); }, [loadLand]);

  const byOkres: Record<string, number> = {};
  (drops ?? []).forEach((d) => { const o = d.okres ?? "—"; byOkres[o] = (byOkres[o] ?? 0) + 1; });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Cenové poklesy</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Inzeráty, ktorým klesla cena (motivovaný predajca) v okresoch Čadca, Kysucké Nové Mesto a Žilina — najčistejší deal signál.
          Rovnaké dáta ako denný Telegram ranný radar. Orientačné; over si aktuálnosť inzerátu.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeader
            title={`Poklesy${drops ? ` (${drops.length})` : ""}`}
            hint={Object.keys(byOkres).length ? Object.entries(byOkres).map(([o, n]) => `${o}: ${n}`).join(" · ") : undefined}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">min. pokles
              <select value={minDrop} onChange={(e) => setMinDrop(Number(e.target.value))} className="ml-1 rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg">
                {[5, 8, 10, 15, 20].map((v) => <option key={v} value={v}>{v} %</option>)}
              </select>
            </label>
            <button onClick={() => void load(true)} disabled={busy} className="rounded-md border border-line px-3 py-1.5 text-sm text-fg hover:border-ink disabled:opacity-50">
              {busy ? "…" : "Obnoviť"}
            </button>
          </div>
        </div>
        {age != null ? <div className="mt-1 text-[11px] text-muted">{age === 0 ? "čerstvé (práve prepočítané)" : `z cache · ~${age} dní`}</div> : null}

        {drops == null ? (
          <div className="mt-3 text-sm text-muted">Načítavam…</div>
        ) : drops.length === 0 ? (
          <div className="mt-3 text-sm text-muted">Žiadne poklesy nad prahom.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-1">Typ</th>
                  <th className="px-2 py-1">Pôvodne</th>
                  <th className="px-2 py-1">Teraz</th>
                  <th className="px-2 py-1 text-right">Pokles</th>
                  <th className="px-2 py-1">Lokalita</th>
                  <th className="px-2 py-1">Inzerát</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {drops.map((d, i) => (
                  <tr key={i} className="hover:bg-surface-2/40">
                    <td className="px-2 py-1 text-fg">{d.ptype ?? "—"}</td>
                    <td className="px-2 py-1 tabular-nums text-muted line-through">{eur(d.first_price)}</td>
                    <td className="px-2 py-1 tabular-nums font-medium text-fg">{eur(d.price_eur)}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold" style={{ color: "#a3341f" }}>−{Math.round(d.drop_pct)} %</td>
                    <td className="px-2 py-1 text-muted">{d.obec && d.okres && d.obec !== d.okres ? `${d.obec} (${d.okres})` : (d.obec || d.okres || "—")}</td>
                    <td className="px-2 py-1">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-dotted hover:no-underline" title={d.title ?? ""}>otvoriť ↗</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader
          title={`🏗️ Stavebné pozemky${land ? ` (${land.length})` : ""}`}
          hint={Object.keys(landMed).length ? "medián €/m²: " + Object.entries(landMed).map(([o, m]) => `${o} ${m}`).join(" · ") : "stavebné pozemky v Čadca/KNM/Žilina"}
        />
        <p className="mt-1 text-[12px] text-muted">Stavebné pozemky (podľa názvu inzerátu) zoradené podľa hodnoty — „pod med." = €/m² pod mediánom stavebných pozemkov v okrese+veľkostnom pásme. Orientačné (mikro-poloha), over ručne.</p>
        {land == null ? (
          <div className="mt-3 text-sm text-muted">Načítavam…</div>
        ) : land.length === 0 ? (
          <div className="mt-3 text-sm text-muted">Žiadne stavebné pozemky.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-1">Cena</th>
                  <th className="px-2 py-1 text-right">Výmera</th>
                  <th className="px-2 py-1 text-right">€/m²</th>
                  <th className="px-2 py-1 text-right">Pod med.</th>
                  <th className="px-2 py-1 text-right">Pokles</th>
                  <th className="px-2 py-1">Lokalita</th>
                  <th className="px-2 py-1">Inzerát</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {land.map((d, i) => (
                  <tr key={i} className="hover:bg-surface-2/40">
                    <td className="px-2 py-1 tabular-nums font-medium text-fg">{eur(d.price_eur)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted">{d.area_m2 ? Math.round(d.area_m2).toLocaleString("sk-SK") + " m²" : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg">{d.ppm2 != null ? Math.round(d.ppm2) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={d.below_pct != null && d.below_pct > 0 ? { color: "#2e7d32", fontWeight: 600 } : { color: "var(--muted,#888)" }}>{d.below_pct != null ? (d.below_pct > 0 ? `−${d.below_pct}%` : `+${-d.below_pct}%`) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={d.drop_pct ? { color: "#a3341f", fontWeight: 600 } : undefined}>{d.drop_pct ? `−${d.drop_pct}%` : "—"}</td>
                    <td className="px-2 py-1 text-muted">{d.obec && d.okres && d.obec !== d.okres ? `${d.obec} (${d.okres})` : (d.obec || d.okres || "—")}</td>
                    <td className="px-2 py-1">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-dotted hover:no-underline" title={d.title ?? ""}>otvoriť ↗</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
