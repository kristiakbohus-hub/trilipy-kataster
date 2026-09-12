import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDashboard, type Dashboard } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { DEAL_STATUS, DEAL_STATUS_ORDER } from "../lib/domain";

export const Route = createFileRoute("/prehlad")({
  head: () => ({ meta: [{ title: "Prehľad / Dashboard — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getDashboard({ data: {} }).catch((): Dashboard | null => null),
  component: PrehladPage,
});

const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK"));
const eur = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €/m²");
// Celé eurá (hodnota pipeline/spisov) — kompaktne (tis./mil.).
const eur0 = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("sk-SK", { maximumFractionDigits: 2 }) + " mil. €";
  if (n >= 10_000) return Math.round(n / 1000).toLocaleString("sk-SK") + " tis. €";
  return n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €";
};
const ago = (s: string | null | undefined) => {
  if (!s) return "—";
  const t = Date.parse(s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00" : "") + "Z");
  if (Number.isNaN(t)) return s.slice(0, 16);
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  if (days < 31) return `pred ${days} dňami`;
  return s.slice(0, 10);
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-fg">{value}</div>
      {hint ? <div className="text-[11px] text-muted">{hint}</div> : null}
    </div>
  );
}

function PrehladPage() {
  const initial = Route.useLoaderData();
  const [d, setD] = useState<Dashboard | null>(initial);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try { setD(await getDashboard({ data: { refresh: true } })); } finally { setBusy(false); }
  }
  useEffect(() => { if (!initial) void refresh(); /* eslint-disable-next-line */ }, []);

  if (!d) return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Prehľad</h1>
      <Card className="p-4"><div className="py-6 text-center text-sm text-muted">{busy ? "Počítam dashboard…" : "Dashboard sa nepodarilo načítať."}</div></Card>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Prehľad</h1>
          <p className="mt-1 text-sm text-muted">KPI naprieč katastrom, dealmi, trhom a územnými plánmi. {d.cached ? `Z cache${d.ageDays != null ? ` (~${Math.round((d.ageDays ?? 0) * 24)} h)` : ""}.` : "Čerstvé."}</p>
        </div>
        <button onClick={() => void refresh()} disabled={busy} className="rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:border-ink disabled:opacity-50">{busy ? "…" : "Obnoviť"}</button>
      </div>

      <Card className="p-4">
        <SectionHeader title="Kataster" hint="dátový rozsah" />
        <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Katastrálne územia" value={nf(d.kataster.datasets)} />
          <Kpi label="Parcely" value={nf(d.kataster.parcels)} />
          <Kpi label="Vlastníci" value={nf(d.kataster.owners)} />
          <Kpi label="Listy vlastníctva" value={nf(d.kataster.lvs)} />
          <Kpi label="Výmera" value={`${nf(d.kataster.area_ha)} ha`} />
        </div>
      </Card>

      {/* Fáza 4: Deal pipeline (hodnota + fázy) + Spisy */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Deal pipeline" hint="hodnota = zadané odkupy + AVM odhad" action={<Link to="/deals" className="text-xs text-brand hover:underline">Dealy →</Link>} />
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Otvorené dealy" value={nf(d.pipeline?.open)} />
            <Kpi label="Zadané odkupy" value={eur0(d.pipeline?.value_set)} hint="dohodnuté ceny" />
            <Kpi label="AVM odhad" value={eur0(d.pipeline?.value_est)} hint="bez zadanej ceny" />
            <Kpi label="Kúpené" value={eur0(d.pipeline?.won_eur)} hint={`zamietnuté: ${nf(d.pipeline?.lost)}`} />
          </div>
          {d.pipeline?.stages?.length ? (
            <div className="mt-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Podľa fázy</div>
              <div className="space-y-1">
                {DEAL_STATUS_ORDER.map((st) => {
                  const row = d.pipeline.stages.find((s) => s.status === st);
                  if (!row || row.count === 0) return null;
                  const meta = DEAL_STATUS[st];
                  return (
                    <div key={st} className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta?.color ?? "#888" }} />
                      <span className="flex-1 text-fg">{meta?.label ?? st}</span>
                      <span className="tabular-nums text-muted">{row.count}×</span>
                      <span className="w-24 text-right tabular-nums text-fg">{eur0(row.value_eur)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <div className="mt-3 text-sm text-muted">Zatiaľ žiadne dealy — pridaj z Deal radaru alebo výpisu LV.</div>}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Spisy (cases)" hint="AVM potenciál otvorených spisov" action={<Link to="/cases" className="text-xs text-brand hover:underline">Spisy →</Link>} />
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Otvorené" value={nf(d.cases?.open)} />
            <Kpi label="V revízii" value={nf(d.cases?.review)} />
            <Kpi label="Uzavreté" value={nf(d.cases?.done)} />
            <Kpi label="AVM potenciál" value={eur0(d.cases?.potential_eur)} hint={`${nf(d.cases?.linked_lvs)} LV v spisoch`} />
          </div>
          {(d.cases?.open ?? 0) + (d.cases?.review ?? 0) + (d.cases?.done ?? 0) === 0 ? (
            <div className="mt-3 text-sm text-muted">Zatiaľ žiadne spisy — založ spis z výpisu LV alebo dealu.</div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Deal-sourcing" hint="skóre ≥ 60 = hot" action={<Link to="/deal-radar" className="text-xs text-brand hover:underline">Deal radar →</Link>} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Kpi label="Hot príležitosti" value={nf(d.deal.hot)} />
            <Kpi label="Otvorené dealy" value={nf(d.deal.open_deals)} />
          </div>
          {d.deal.top.length ? (
            <div className="mt-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Top 5 LV podľa skóre</div>
              <div className="divide-y divide-line">
                {d.deal.top.map((t) => (
                  <div key={`${t.dataset_id}-${t.lv_no}`} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-8 text-center font-bold tabular-nums text-fg">{t.score}</span>
                    <span className="flex-1 truncate text-fg">{t.ku_name ?? t.dataset_id} · LV {t.lv_no}</span>
                    <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: t.dataset_id, lvNo: String(t.lv_no) }} search={{ typ: "vypis" as const }} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink">Výpis</Link>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Trh" hint="medián €/m² (predaj)" action={<Link to="/ceny" className="text-xs text-brand hover:underline">Ceny →</Link>} />
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Kpi label="Pozemok" value={eur(d.trh.medians.pozemok)} />
            <Kpi label="Byt" value={eur(d.trh.medians.byt)} />
            <Kpi label="Dom" value={eur(d.trh.medians.dom)} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Kpi label="Inzeráty" value={nf(d.trh.listings)} />
            <Kpi label="Cenové príležitosti" value={nf(d.trh.opps)} />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Územné plány" hint="monitoring" action={<Link to="/zoning" className="text-xs text-brand hover:underline">ÚP →</Link>} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Kpi label="Obce v registri" value={nf(d.up.obce)} />
            <Kpi label="Dokumenty ÚP" value={nf(d.up.docs)} />
            <Kpi label="Zmeny 7 dní" value={nf(d.up.changes_7d)} />
            <Kpi label="Zmeny 30 dní" value={nf(d.up.changes_30d)} />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Posledné notifikácie" hint="naprieč tímom" action={<Link to="/aktivita" className="text-xs text-brand hover:underline">Denník →</Link>} />
          {d.alerts.length ? (
            <div className="mt-2 divide-y divide-line">
              {d.alerts.map((a, i) => (
                <div key={i} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <span className="w-28 shrink-0 text-[11px] text-muted">{a.created_at ? a.created_at.slice(0, 16) : ""}</span>
                  <span className="truncate text-fg">{a.body}</span>
                </div>
              ))}
            </div>
          ) : <div className="mt-2 text-sm text-muted">Zatiaľ žiadne notifikácie.</div>}
        </Card>
      </div>

      {/* Fáza 4: čerstvosť dát + zmeny v katastri */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Stav dát" hint="čerstvosť zdrojov (vždy naživo)" />
          <div className="mt-2 space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted">Posledný import k.ú.</span>
              <span className="text-fg">{ago(d.status?.last_import)}{d.status?.last_import_ku ? <span className="text-muted"> · {d.status.last_import_ku}</span> : null}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted">Posledný scraper trhu</span>
              <span className="text-fg">{ago(d.status?.last_scrape)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted">Posledný beh alertov</span>
              <span className="text-fg">{ago(d.status?.last_alert)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Zmeny v katastri" hint="detegované pri re-importe (Fáza 3)" />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Kpi label="Zmeny 7 dní" value={nf(d.changes?.d7)} />
            <Kpi label="Zmeny 30 dní" value={nf(d.changes?.d30)} />
          </div>
          <div className="mt-3 text-[12px] text-muted">
            {d.changes?.last ? <>Posledná zmena: <span className="text-fg">{ago(d.changes.last)}</span>. Detaily v sekcii „História zmien" na výpise LV.</> : "Zmeny sa objavia po druhom importe k.ú. (starý ↔ nový stav)."}
          </div>
        </Card>
      </div>

      <div className="text-[11px] text-muted">Ťažké súčty (kataster, trh, ÚP) sú cachované ~12 h — D1 free tier; „Obnoviť" ich prepočíta. Pipeline, spisy, stav dát a zmeny sú vždy čerstvé.</div>
    </div>
  );
}
