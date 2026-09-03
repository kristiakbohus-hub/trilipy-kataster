import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getDealRadar, getMarketTree, type MarketTreeRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader, Disclaimer } from "../components/kit";

export const Route = createFileRoute("/deal-radar")({
  head: () => ({ meta: [{ title: "Deal radar — TRI LIPY KATASTER CORE" }] }),
  loader: async () => {
    const tree = await getMarketTree({ data: { deal: "predaj" } }).catch((): MarketTreeRow[] => []);
    const init = await getDealRadar({ data: { limit: 40 } }).catch((): Awaited<ReturnType<typeof getDealRadar>> => ({ lv: [], market: [] }));
    return { tree, init };
  },
  component: DealRadarPage,
});

const eur = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("sk-SK"));

function DealRadarPage() {
  const { tree, init } = Route.useLoaderData();
  const [okres, setOkres] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [res, setRes] = useState(init);
  const [busy, setBusy] = useState(false);

  const okresy = useMemo(() => {
    const s = new Set<string>();
    for (const r of tree) if (r.grain === "okres" && r.okres) s.add(r.okres);
    return [...s].sort((a, b) => a.localeCompare(b, "sk"));
  }, [tree]);

  async function run(o = okres, ms = minScore) {
    setBusy(true);
    try { setRes(await getDealRadar({ data: { okres: o || undefined, minScore: ms || undefined, limit: 40 } })); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Deal radar</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Najlepšie príležitosti naprieč všetkými k.ú. — <b>LV signály</b> (nevysporiadané, SPF/štát, dedičské,
          absentéri, stavebný potenciál) aj <b>trhové ponuky pod cenou</b> (zníženia, pod trhom). Skóre je pracovný
          indikátor, nie právny záver.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select value={okres} onChange={(e) => { setOkres(e.target.value); void run(e.target.value); }}
            className="rounded-lg border border-line bg-paper px-2 py-2 text-sm text-fg outline-none focus:border-brand">
            <option value="">Všetky okresy</option>
            {okresy.map((o) => <option key={o} value={o}>okres {o}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            min. skóre {minScore}
            <input type="range" min={0} max={90} step={5} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))} onMouseUp={() => void run()} onTouchEnd={() => void run()}
              className="accent-brand" />
          </label>
          {busy ? <span className="text-xs text-muted">…</span> : null}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title={`LV príležitosti (${res.lv.length})`} hint="skórované naprieč k.ú." />
        {res.lv.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">Žiadne LV nad prahom skóre.</div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {res.lv.map((r) => (
              <div key={`${r.dataset_id}-${r.lv_no}`} className="flex items-center gap-3 py-2">
                <div className="w-10 shrink-0 text-center"><div className="text-lg font-bold tabular-nums text-fg">{r.score}</div></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">LV {r.lv_no} · {r.ku_name}</div>
                  <div className="truncate text-[12px] text-muted">{r.reasons.join(" · ") || "—"} · {r.total_area.toLocaleString("sk-SK")} m²</div>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: r.dataset_id, lvNo: String(r.lv_no) }} search={{ typ: "vypis" as const }} className="rounded-md border border-line px-2 py-1 text-fg hover:border-ink">Výpis</Link>
                  <a href={`/mapa?ds=${encodeURIComponent(r.dataset_id)}`} className="rounded-md border border-line px-2 py-1 text-fg hover:border-ink">Mapa</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader title={`Trhové ponuky pod cenou (${res.market.length})`} hint="zníženia / pod trhom" />
        {res.market.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">Žiadne trhové príležitosti (dáta rastú so scrapom).</div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {res.market.map((m, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="w-16 shrink-0 text-center text-[11px]">
                  {m.below_market_pct ? <div className="font-bold text-[#3f5a3c]">−{Math.round(m.below_market_pct)}%<div className="text-[9px] font-normal text-muted">pod trhom</div></div>
                    : m.price_drop_pct ? <div className="font-bold text-[#9a7b3e]">−{Math.round(m.price_drop_pct)}%<div className="text-[9px] font-normal text-muted">zníženie</div></div> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg">{m.title || "inzerát"}</div>
                  <div className="truncate text-[12px] text-muted">{[m.ptype, m.okres || m.obec].filter(Boolean).join(" · ")}{m.area_m2 ? ` · ${m.area_m2.toLocaleString("sk-SK")} m²` : ""}{m.days_on_market ? ` · ${m.days_on_market} dní na trhu` : ""}</div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-semibold text-fg">{eur(m.price_eur)} €</div>
                  {m.price_per_m2 ? <div className="text-muted">{Math.round(m.price_per_m2)} €/m²</div> : null}
                </div>
                {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-fg hover:border-ink">↗</a> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Disclaimer>
        Radar spája interné signály (kataster) a verejnú inzerciu. Skóre a „pod trhom" sú orientačné pracovné indikátory,
        nie právny ani znalecký záver. Vždy over na príslušnom úrade.
      </Disclaimer>
    </div>
  );
}
