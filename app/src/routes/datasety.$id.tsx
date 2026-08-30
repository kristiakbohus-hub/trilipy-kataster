import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getDataset, runReadinessRecheck } from "../lib/api/kataster.functions";
import {
  JOB_STATE_META,
  OPP_META,
  QUALITY_META,
  REPORT_KIND_LABEL,
  REPORT_STATUS_META,
  STATUS_META,
  canRunPipeline,
  eur,
  m2,
} from "../lib/domain";
import { Badge, Card, Disclaimer, Icon, Meter, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/datasety/$id")({
  head: () => ({ meta: [{ title: "Detail datasetu — TRI LIPY KATASTER CORE" }] }),
  loader: async ({ params }) => {
    const data = await getDataset({ data: { id: params.id, role: "viewer" } });
    if (!data.dataset) throw notFound();
    return data;
  },
  component: DatasetDetail,
});

function DatasetDetail() {
  const data = Route.useLoaderData();
  const d = data.dataset!;
  const { role } = useRole();
  const router = useRouter();
  const meta = STATUS_META[d.status];

  const [recheck, setRecheck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doRecheck() {
    setBusy(true);
    setRecheck(null);
    try {
      const r = await runReadinessRecheck({ data: { datasetId: d.id, role } });
      setRecheck(r.message ?? (r.ok ? "Hotovo." : "Neúspešné."));
      router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/datasety" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <Icon name="arrow" size={13} className="rotate-180" /> Datasety
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-fg">{d.ku_name}</h1>
              <Badge color={meta.color}>{meta.label}</Badge>
            </div>
            <div className="mt-1 text-sm text-muted">{d.region} · {d.kn_type} · k.ú. {d.ku_code} · import {d.import_version}</div>
          </div>
          <div className="flex gap-2">
            <Link to="/mapa" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2">
              <Icon name="map" size={15} /> Otvoriť v mape
            </Link>
            {canRunPipeline(role) ? (
              <button
                onClick={doRecheck}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-60"
              >
                {busy ? "Prebieha…" : "Readiness re-check"}
              </button>
            ) : null}
          </div>
        </div>
        {d.note ? <p className="mt-2 max-w-2xl text-sm text-muted">{d.note}</p> : null}
        {recheck ? (
          <div className="mt-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-fg">
            <span className="font-mono text-xs text-brand">readiness.recheck</span> → {recheck}
          </div>
        ) : null}
      </div>

      {/* Meta grid */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Geometry coverage</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{d.geometry_coverage} %</div>
          <div className="mt-2"><Meter value={d.geometry_coverage} color={meta.color} /></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Canonical confidence</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{Math.round(d.canonical_confidence * 100)} %</div>
          <div className="mt-2"><Meter value={d.canonical_confidence * 100} color="#6b6f86" /></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Parcely / LV / vlastníci</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{data.parcels.length} / {data.lvCount} / {data.ownerCount}</div>
          <div className="mt-1 text-xs text-muted">{data.opportunities.length} príležitostí · {data.reports.length} reportov</div>
        </Card>
      </div>

      {/* Parcely */}
      <div>
        <SectionHeader title="Parcely" hint="Odvodená pracovná geometria s kvalitou a LV." />
        {data.parcels.length === 0 ? (
          <Card className="p-4 text-sm text-muted">Žiadne parcely — quality gate neprešiel alebo chýba geometria.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Parcela</th>
                  <th className="px-4 py-2 font-medium">Výmera</th>
                  <th className="px-4 py-2 font-medium">Druh</th>
                  <th className="px-4 py-2 font-medium">LV</th>
                  <th className="px-4 py-2 font-medium">Geometria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.parcels.map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-surface-2/50">
                      <td className="px-4 py-2 font-mono text-fg">{p.parcel_no}</td>
                      <td className="px-4 py-2 tabular-nums text-muted">{m2(p.area_m2)}</td>
                      <td className="px-4 py-2 text-muted">{p.use_type}</td>
                      <td className="px-4 py-2 tabular-nums text-muted">{p.lv_no}</td>
                      <td className="px-4 py-2">
                        <span style={{ color: QUALITY_META[p.geometry_quality].color }}>{QUALITY_META[p.geometry_quality].label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-2 text-xs text-muted">
          Parcely sú napojené na LV cez canonical linker (CPA → LV). Reálni vlastníci (rolovo maskovaní na serveri)
          sú v <Link to="/browser" className="text-brand hover:underline">Kataster Browseri</Link> a v Identify na mape.
        </p>
      </div>

      {/* Import pipeline + reporty */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader title="Intake pipeline" hint="Kroky spracovania s quality gate." />
          <Card className="divide-y divide-line">
            {data.jobs.map((j) => {
              const jm = JOB_STATE_META[j.state] ?? { label: j.state, color: "#8a8a8a" };
              return (
                <div key={j.id} className="flex items-start gap-3 p-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: jm.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-fg">{j.step_no}. {j.step}</span>
                      <span className="text-xs" style={{ color: jm.color }}>{jm.label}</span>
                    </div>
                    {j.message ? <div className="mt-0.5 text-xs text-muted">{j.message}</div> : null}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
        <div>
          <SectionHeader title="Reporty & príležitosti" />
          <Card className="divide-y divide-line">
            {data.reports.length === 0 && data.opportunities.length === 0 ? (
              <div className="p-4 text-sm text-muted">Žiadne reporty ani príležitosti.</div>
            ) : (
              <>
                {data.reports.map((r) => (
                  <div key={"r" + r.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-fg">{r.title}</div>
                      <div className="text-xs text-muted">{REPORT_KIND_LABEL[r.kind] ?? r.kind}</div>
                    </div>
                    <Badge color={(REPORT_STATUS_META[r.status] ?? { color: "#8a8a8a" }).color}>
                      {(REPORT_STATUS_META[r.status] ?? { label: r.status }).label}
                    </Badge>
                  </div>
                ))}
                {data.opportunities.map((o) => (
                  <div key={"o" + o.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-fg">{o.kind}</div>
                      <div className="text-xs text-muted">score {o.score.toFixed(2)} · {eur(o.est_price_eur)}</div>
                    </div>
                    <Badge color={(OPP_META[o.status] ?? { color: "#8a8a8a" }).color}>
                      {(OPP_META[o.status] ?? { label: o.status }).label}
                    </Badge>
                  </div>
                ))}
              </>
            )}
          </Card>
        </div>
      </div>

      <Disclaimer>
        Canonical model (owners / LV / shares) je odvodená pracovná reprezentácia s confidence a lineage —
        nie náhrada úradného výpisu ani právneho potvrdenia. Owner-sensitive údaje sú rolovo chránené.
      </Disclaimer>
    </div>
  );
}
