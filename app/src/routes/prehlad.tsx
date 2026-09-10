import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDashboard, type Dashboard } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";

export const Route = createFileRoute("/prehlad")({
  head: () => ({ meta: [{ title: "Prehľad / Dashboard — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getDashboard({ data: {} }).catch((): Dashboard | null => null),
  component: PrehladPage,
});

const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK"));
const eur = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €/m²");

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

      <div className="text-[11px] text-muted">Dashboard je cachovaný ~60 min (ťažké súčty sa nerátajú pri každom načítaní — D1 free tier). „Obnoviť" prepočíta teraz.</div>
    </div>
  );
}
