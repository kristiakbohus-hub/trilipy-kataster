import { createFileRoute, Link } from "@tanstack/react-router";
import { getOverview } from "../lib/api/kataster.functions";
import { STATUS_META, type AppPath, type Dataset } from "../lib/domain";
import { Badge, Card, Icon, Meter, SectionHeader, Stat } from "../components/kit";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Mission Control — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getOverview(),
  component: MissionControl,
});

function MissionControl() {
  const { datasets, counts, avgCoverage, recentAudit } = Route.useLoaderData();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-fg">Mission Control</h1>
          <Badge color="#9a7b3e">ready_with_warnings · 99 %</Badge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pravdivý prevádzkový panel. Ukazuje čo je pripravené, čo je odvodené a čo je blokované —
          nie univerzálny semafor právnej ani geodetickej istoty.
        </p>
      </div>

      {/* Release readiness */}
      <Card className="p-5" style={{ borderColor: "#9a7b3e40", background: "#9a7b3e0d" }}>
        <SectionHeader title="Release readiness" hint="Manažérsky stav pred interným pilotom." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface/60 p-3">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#9a7b3e" }} />
            <div className="text-sm">
              <div className="font-medium text-fg">Rotácia bootstrap prístupov</div>
              <div className="text-muted">Pred externým handoffom nutná rotácia a security preflight.</div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface/60 p-3">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#9a7b3e" }} />
            <div className="text-sm">
              <div className="font-medium text-fg">Geometry precision coverage</div>
              <div className="text-muted">Zatiaľ neumožňuje plošné tvrdenia o hraniciach ({avgCoverage} % priemer).</div>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Datasety" value={counts.datasets} sub={`${counts.ready} ready · ${counts.warnings} warn · ${counts.blocked} blocked`} />
        <Stat label="Parcely" value={counts.parcels} sub="s odvodenou geometriou" />
        <Stat label="Príležitosti" value={counts.opportunities} sub="E-KN a business kandidáti" />
        <Stat label="Reporty" value={counts.reports} sub="evidenčné listy, packy" />
      </div>

      {/* Dataset readiness */}
      <div>
        <SectionHeader
          title="Datasety podľa pripravenosti"
          hint="Každý dataset drží stav, geometry coverage a canonical confidence."
          action={<Link to="/datasety" className="text-xs text-brand hover:underline">Všetky datasety →</Link>}
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {datasets.map((d) => (
            <DatasetCard key={d.id} d={d} />
          ))}
        </div>
      </div>

      {/* Audit + quick actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader title="Audit stopa" hint="Posledné prevádzkové udalosti." />
          <Card className="divide-y divide-line">
            {recentAudit.length === 0 ? (
              <div className="p-4 text-sm text-muted">Zatiaľ žiadne záznamy.</div>
            ) : (
              recentAudit.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-3">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="font-mono text-fg">{a.action}</span>
                      <span>·</span>
                      <span>{a.actor_role}</span>
                      <span className="ml-auto">{a.created_at}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-fg">{a.detail}</div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
        <div>
          <SectionHeader title="Rýchle akcie" />
          <div className="space-y-2">
            <QuickLink to="/mapa" icon="map" title="Otvoriť mapu / GIS" desc="Identify, meranie, výbery" />
            <QuickLink to="/import" icon="upload" title="Import & intake" desc="SPI/SGI/VGI/DBF quality gate" />
            <QuickLink to="/reporty" icon="report" title="Report Center" desc="Evidenčné listy a packy" />
            <QuickLink to="/prilezitosti" icon="target" title="Príležitosti" desc="E-KN a business kandidáti" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DatasetCard({ d }: { d: Dataset }) {
  const meta = STATUS_META[d.status];
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">{d.ku_name}</div>
          <div className="text-xs text-muted">{d.region} · {d.kn_type} · k.ú. {d.ku_code}</div>
        </div>
        <Badge color={meta.color}>{meta.label}</Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted">{d.note}</p>
      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Geometry coverage</span>
            <span className="tabular-nums text-fg">{d.geometry_coverage} %</span>
          </div>
          <Meter value={d.geometry_coverage} color={meta.color} />
        </div>
        <div className="flex justify-between text-[11px] text-muted">
          <span>Canonical confidence</span>
          <span className="tabular-nums text-fg">{Math.round(d.canonical_confidence * 100)} %</span>
        </div>
      </div>
      <Link
        to="/datasety/$id"
        params={{ id: d.id }}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-2"
      >
        Otvoriť dataset <Icon name="arrow" size={13} />
      </Link>
    </Card>
  );
}

function QuickLink({ to, icon, title, desc }: { to: AppPath; icon: string; title: string; desc: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:bg-surface-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg text-brand" style={{ background: "#3333331f" }}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="truncate text-xs text-muted">{desc}</div>
      </div>
      <Icon name="arrow" size={15} className="ml-auto text-muted" />
    </Link>
  );
}
