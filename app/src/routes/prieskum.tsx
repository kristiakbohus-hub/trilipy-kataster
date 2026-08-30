import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { nlQuery } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/prieskum")({
  head: () => ({ meta: [{ title: "NL prieskum — TRI LIPY KATASTER CORE" }] }),
  component: PrieskumPage,
});

type Res = Awaited<ReturnType<typeof nlQuery>>;

const EXAMPLES = [
  "absentér nevysporiadané 5 spoluvlastníkov",
  "SPF štát stavebný potenciál",
  "dedičské bez tiarch nad 5000",
  "nevysporiadané 3 podiely",
];

function PrieskumPage() {
  const { role } = useRole();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"score" | "area" | "owners">("score");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(query = q, s = sort) {
    if (!query.trim()) return;
    setBusy(true);
    try { setRes(await nlQuery({ data: { query: query.trim(), role, sort: s } })); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">NL prieskum katastra</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Písateľný dopyt <b>naprieč všetkými k.ú.</b> — signály (nevysporiadané, SPF/štát, dedičské,
          stavebný potenciál, spoluvlastníci, výmera) sa naživo <b>skórujú a zoraďujú</b>. Každý výsledok
          má odkaz na výpis LV aj mapu. Skóre je pracovný indikátor príležitosti, nie právny záver.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            placeholder="napr. absentér nevysporiadané 5 spoluvlastníkov nad 5000…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand"
          />
          <select
            value={sort}
            onChange={(e) => { const v = e.target.value as "score" | "area" | "owners"; setSort(v); void run(q, v); }}
            className="rounded-lg border border-line bg-paper px-2 py-2 text-sm text-fg outline-none focus:border-brand"
          >
            <option value="score">Zoradiť: skóre</option>
            <option value="area">výmera</option>
            <option value="owners">spoluvlastníci</option>
          </select>
          <button onClick={() => void run()} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {busy ? "…" : "Hľadať"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setQ(ex); void run(ex); }} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:border-ink hover:text-fg">
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {res ? (
        <Card className="p-4">
          <SectionHeader title={`Výsledky (${res.count})`} hint={res.count > 80 ? "zobrazených top 80 podľa skóre/zoradenia" : undefined} />
          {res.results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">Žiadne LV nezodpovedajú dopytu. Skús iné kľúčové slová.</div>
          ) : (
            <div className="mt-2 divide-y divide-line">
              {res.results.map((r) => (
                <div key={`${r.dataset_id}-${r.lv_no}`} className="flex items-center gap-3 py-2">
                  <div className="w-10 shrink-0 text-center">
                    <div className="text-lg font-bold tabular-nums text-fg">{r.score}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">LV {r.lv_no} · {r.ku_name}</div>
                    <div className="truncate text-[12px] text-muted">
                      {r.reasons.join(" · ") || "—"} · {r.co_owners} vlastníkov · {r.total_area.toLocaleString("sk-SK")} m²
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: r.dataset_id, lvNo: String(r.lv_no) }} search={{ typ: "vypis" as const }} className="rounded-md border border-line px-2 py-1 text-fg hover:border-ink">
                      Výpis
                    </Link>
                    <a href={`/mapa?ds=${encodeURIComponent(r.dataset_id)}`} className="rounded-md border border-line px-2 py-1 text-fg hover:border-ink">
                      Mapa
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
