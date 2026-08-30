import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getReportContent } from "../lib/api/kataster.functions";
import { REPORT_KIND_LABEL, REPORT_STATUS_META, canExport } from "../lib/domain";
import { Badge, Card, Disclaimer, Icon } from "../components/kit";
import { useRole } from "../lib/role-context";

type Content = Awaited<ReturnType<typeof getReportContent>>;

export const Route = createFileRoute("/reporty/$id")({
  head: () => ({ meta: [{ title: "Report — TRI LIPY KATASTER CORE" }] }),
  loader: async ({ params }) => {
    const id = Number(params.id);
    const content = await getReportContent({ data: { id, role: "viewer" } });
    if (!content.report) throw notFound();
    return { id, content };
  },
  component: ReportDetail,
});

function ReportDetail() {
  const { id, content: initial } = Route.useLoaderData();
  const { role } = useRole();
  const [content, setContent] = useState<Content>(initial);

  useEffect(() => {
    let alive = true;
    getReportContent({ data: { id, role } }).then((c) => alive && setContent(c));
    return () => { alive = false; };
  }, [id, role]);

  const r = content.report;
  if (!r) return null;
  const es = content.exportSafety;
  const sm = REPORT_STATUS_META[r.status] ?? { label: r.status, color: "#8a8a8a" };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reporty" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <Icon name="arrow" size={13} className="rotate-180" /> Report Center
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">{r.title}</h1>
            <div className="mt-1 text-sm text-muted">
              {REPORT_KIND_LABEL[r.kind] ?? r.kind} · {r.ku_name} · audit {r.audit_hash ?? "—"} · {r.created_at}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={sm.color}>{sm.label}</Badge>
            {es && canExport(role) ? (
              <button
                onClick={() => { if (typeof window !== "undefined") window.print(); }}
                className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream"
              >
                <Icon name="report" size={14} /> Export / tlač
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Export Safety */}
      {es ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#e3e3e8", background: "#ffffff", color: "#8a8a8a" }}
        >
          <Icon name="shield" size={14} />
          <span className="font-medium text-fg">Export Safety</span>
          <span>·</span>
          <span>owner prístup: <b className="text-fg">{es.ownerAccess}</b></span>
          <span>·</span>
          <span>export: <b style={{ color: es.exportAllowed ? "#5b7a58" : "#9c4a40" }}>{es.exportAllowed ? "povolený" : "blokovaný pre rolu"}</b></span>
          <span>·</span>
          <span>rola: <b className="text-fg">{es.role}</b></span>
        </div>
      ) : null}

      {/* Sekcie obsahu */}
      {content.sections.length === 0 ? (
        <Card className="p-4 text-sm text-muted">Report nemá obsah.</Card>
      ) : (
        content.sections.map((sec, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <span className="text-sm font-medium text-fg">{sec.title}</span>
              {sec.masked ? <Badge color="#9a7b3e">maskované (rola)</Badge> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                    {sec.head.map((h, hi) => <th key={hi} className="px-4 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sec.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-surface-2/50">
                      {row.map((cell, ci) => (
                        <td key={ci} className={"px-4 py-2 " + (ci === 0 ? "font-mono text-fg" : "text-muted")}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      <Disclaimer>
        Interný pracovný podklad TRI LIPY — nie je to úradný výpis z LV ani geodetické vytýčenie. Owner-sensitive
        obsah je maskovaný podľa role na serveri. Audit hash a report ID slúžia na spätnú kontrolu runtime stavu.
      </Disclaimer>
    </div>
  );
}
