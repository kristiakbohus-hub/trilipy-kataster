import { createFileRoute, Link } from "@tanstack/react-router";
import { getDatasets } from "../lib/api/kataster.functions";
import { STATUS_META } from "../lib/domain";
import { Badge, Card, Icon, Meter } from "../components/kit";

export const Route = createFileRoute("/datasety/")({
  head: () => ({ meta: [{ title: "Datasety — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getDatasets(),
  component: DatasetsPage,
});

function DatasetsPage() {
  const datasets = Route.useLoaderData();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Datasety</h1>
        <p className="mt-1 text-sm text-muted">
          Katastrálne územia s vlastným stavom, geometry coverage a canonical confidence.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-12 gap-3 border-b border-line px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted md:grid">
          <div className="col-span-4">Katastrálne územie</div>
          <div className="col-span-2">Typ</div>
          <div className="col-span-2">Stav</div>
          <div className="col-span-3">Coverage</div>
          <div className="col-span-1 text-right">Verzia</div>
        </div>
        <div className="divide-y divide-line">
          {datasets.map((d) => {
            const meta = STATUS_META[d.status];
            return (
              <Link
                key={d.id}
                to="/datasety/$id"
                params={{ id: d.id }}
                className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-surface-2 md:grid-cols-12 md:items-center"
              >
                <div className="col-span-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-fg">
                    {d.ku_name}
                    <Icon name="arrow" size={13} className="text-muted" />
                  </div>
                  <div className="text-xs text-muted">{d.region} · k.ú. {d.ku_code}</div>
                </div>
                <div className="col-span-2 text-sm text-muted">{d.kn_type}</div>
                <div className="col-span-2"><Badge color={meta.color}>{meta.label}</Badge></div>
                <div className="col-span-3">
                  <div className="mb-1 flex justify-between text-[11px] text-muted">
                    <span className="tabular-nums text-fg">{d.geometry_coverage} %</span>
                    <span>conf {Math.round(d.canonical_confidence * 100)} %</span>
                  </div>
                  <Meter value={d.geometry_coverage} color={meta.color} />
                </div>
                <div className="col-span-1 text-left text-xs text-muted md:text-right">{d.import_version}</div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
