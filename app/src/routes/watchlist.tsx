import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { getWatchlist, updateWatch, type WatchRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";

export const Route = createFileRoute("/watchlist")({
  head: () => ({ meta: [{ title: "Watchlist — TRI LIPY KATASTER CORE" }] }),
  component: WatchlistPage,
});

const STATUS: [string, string][] = [["novy", "Nový"], ["rozpracovany", "Rozpracovaný"], ["hotovy", "Hotový"]];
const STATUS_COLOR: Record<string, string> = { novy: "#9a7b3e", rozpracovany: "#3f5a3c", hotovy: "#1c1c1a" };

function subjectLink(r: WatchRow) {
  const [ds, no] = (r.subject_id ?? "").split(":");
  if (r.subject_type === "lv") return <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: ds, lvNo: no }} search={{ typ: "vypis" as const }} className="text-brand hover:underline">Výpis LV {no}</Link>;
  return <a href={`/mapa?ds=${encodeURIComponent(ds)}`} className="text-brand hover:underline">Mapa · {r.subject_type} {no}</a>;
}

function WatchlistPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (token) getWatchlist({ data: { token } }).then(setRows).catch(() => {}); }, [token]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: number, status: string) { if (!token) return; setBusy(true); try { await updateWatch({ data: { token, id, status } }); load(); } finally { setBusy(false); } }
  async function assign(id: number) {
    if (!token) return;
    const email = window.prompt("Email kolegu na priradenie tejto položky:");
    if (!email) return;
    const r = await updateWatch({ data: { token, id, assigneeEmail: email.trim() } });
    if (!r.ok) window.alert(r.message ?? "Priradenie zlyhalo.");
    load();
  }

  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa pre zobrazenie watchlistu.</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Watchlist</h1>
        <p className="mt-1 text-sm text-muted">Sledované parcely a LV — stav dealu, priradenie kolegovi, notifikácie pri zmenách/komentároch.</p>
      </div>
      <Card className="p-4">
        <SectionHeader title={`Sledované (${rows.length})`} hint="tvoje + priradené tebe" />
        {rows.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">Zatiaľ nič nesleduješ. Pridaj cez ☆ Sledovať pri parcele/LV.</div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{r.label ?? r.subject_id}</div>
                  <div className="text-[12px] text-muted">{subjectLink(r)}{r.assignee_id ? " · priradené" : ""}{r.note ? ` · ${r.note}` : ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {STATUS.map(([val, lbl]) => (
                    <button key={val} onClick={() => setStatus(r.id, val)} disabled={busy}
                      className={"rounded-md border px-2 py-0.5 text-[11px] " + (r.status === val ? "text-cream" : "border-line text-muted hover:text-fg")}
                      style={r.status === val ? { background: STATUS_COLOR[val], borderColor: STATUS_COLOR[val] } : undefined}>
                      {lbl}
                    </button>
                  ))}
                  <button onClick={() => assign(r.id)} title="Priradiť kolegovi" className="rounded-md border border-line px-2 py-0.5 text-[11px] text-fg hover:border-ink">Priradiť</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
