import { createFileRoute, Link } from "@tanstack/react-router";
import { getActivity, type ActivityRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";

export const Route = createFileRoute("/aktivita")({
  head: () => ({ meta: [{ title: "Denník aktivity — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getActivity({ data: { limit: 150 } }).catch((): ActivityRow[] => []),
  component: ActivityPage,
});

const ACTION_LABEL: Record<string, string> = {
  "comment.add": "💬 komentár", "watch.add": "★ pridal do sledovaných", "auth.register": "👤 nový účet",
};

function subjectLink(a: ActivityRow) {
  if (!a.subject_id) return null;
  const [ds, no] = a.subject_id.split(":");
  if (a.subject_type === "lv") return <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: ds, lvNo: no }} search={{ typ: "vypis" as const }} className="text-brand hover:underline">LV {no}</Link>;
  return <span className="text-muted">{a.subject_type} {no}</span>;
}

function ActivityPage() {
  const rows = Route.useLoaderData();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Denník aktivity</h1>
        <p className="mt-1 text-sm text-muted">Kto čo robil naprieč parcelami, LV a dealmi — tímový prehľad.</p>
      </div>
      <Card className="p-4">
        <SectionHeader title={`Posledná aktivita (${rows.length})`} hint="najnovšie hore" />
        {rows.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">Zatiaľ žiadna aktivita.</div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {rows.map((a) => (
              <div key={a.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                <span className="w-32 shrink-0 text-[11px] text-muted">{a.created_at ? a.created_at.slice(0, 16) : ""}</span>
                <span className="shrink-0 font-medium text-fg">{a.author ?? "—"}</span>
                <span className="text-muted">{ACTION_LABEL[a.action] ?? a.action}</span>
                {subjectLink(a)}
                {a.detail ? <span className="truncate text-[12px] text-muted">— {a.detail}</span> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
