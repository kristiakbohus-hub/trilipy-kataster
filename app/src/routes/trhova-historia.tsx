import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getMarketHistory, getMarketTree, getListingPriceHistory, type MarketTreeRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader, Disclaimer } from "../components/kit";

export const Route = createFileRoute("/trhova-historia")({
  head: () => ({ meta: [{ title: "Trhová história — TRI LIPY KATASTER CORE" }] }),
  loader: async () => {
    const tree = await getMarketTree({ data: { deal: "predaj" } }).catch((): MarketTreeRow[] => []);
    const init = await getMarketHistory({ data: { okres: "Čadca", ptype: "pozemok", deal: "predaj" } })
      .catch((): Awaited<ReturnType<typeof getMarketHistory>> => ({ series: [], movers: [], deal: "predaj", ptype: "pozemok" }));
    return { tree, init };
  },
  component: TrhovaHistoriaPage,
});

const PTYPES = [{ id: "pozemok", l: "Pozemky" }, { id: "byt", l: "Byty" }, { id: "dom", l: "Domy" }, { id: "chata", l: "Chaty" }];
const eur = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("sk-SK"));

function TrendChart({ series }: { series: Awaited<ReturnType<typeof getMarketHistory>>["series"] }) {
  const W = 640, H = 220, padL = 48, padB = 28, padT = 12, padR = 12;
  if (series.length === 0) return <div className="py-8 text-center text-sm text-muted">Zatiaľ žiadne dáta pre tieto podmienky.</div>;
  const vals = series.flatMap((s) => [s.median_eur_m2, s.p25 ?? s.median_eur_m2, s.p75 ?? s.median_eur_m2]);
  const min = Math.min(...vals) * 0.95, max = Math.max(...vals) * 1.05;
  const n = series.length;
  const x = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const line = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(s.median_eur_m2).toFixed(1)}`).join(" ");
  const band = [...series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(s.p75 ?? s.median_eur_m2).toFixed(1)}`),
    ...series.slice().reverse().map((s, i) => `L${x(n - 1 - i).toFixed(1)} ${y(s.p25 ?? s.median_eur_m2).toFixed(1)}`), "Z"].join(" ");
  const ticks = [min, (min + max) / 2, max];
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="max-w-full" role="img" aria-label="Graf mediánu €/m² v čase">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--tl-line, #e5e0d5)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#8a8578">{Math.round(t)}</text>
          </g>
        ))}
        <path d={band} fill="#9a7b3e22" stroke="none" />
        <path d={line} fill="none" stroke="#9a7b3e" strokeWidth={2} />
        {series.map((s, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(s.median_eur_m2)} r={3} fill="#9a7b3e" />
            <text x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize={9} fill="#8a8578">{s.day.slice(5)}</text>
          </g>
        ))}
        <text x={padL} y={padT + 2} fontSize={10} fill="#8a8578">€/m² (medián · pásmo p25–p75)</text>
      </svg>
    </div>
  );
}

function Sparkline({ pts }: { pts: { day: string; price_eur: number | null }[] }) {
  const fpts = pts.filter((p) => p.price_eur != null);
  if (fpts.length < 2) return <div className="py-1 text-[11px] text-muted">Zatiaľ len 1 cenový bod — krivka narastie s dňami zberu.</div>;
  const W = 340, H = 64, pad = 8;
  const vals = fpts.map((p) => p.price_eur as number);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => pad + (i / (fpts.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - 2 * pad - 8);
  const line = fpts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.price_eur as number).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} className="max-w-full" role="img" aria-label="Krivka ceny inzerátu">
      <path d={line} fill="none" stroke="#9a7b3e" strokeWidth={1.5} />
      {fpts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.price_eur as number)} r={2.5} fill="#9a7b3e" />
          <text x={x(i)} y={H - 1} textAnchor="middle" fontSize={8} fill="#8a8578">{p.day.slice(5)}</text>
        </g>
      ))}
    </svg>
  );
}

function TrhovaHistoriaPage() {
  const { tree, init } = Route.useLoaderData();
  const [okres, setOkres] = useState("Čadca");
  const [ptype, setPtype] = useState("pozemok");
  const [deal, setDeal] = useState("predaj");
  const [res, setRes] = useState(init);
  const [busy, setBusy] = useState(false);

  const okresy = useMemo(() => {
    const s = new Set<string>();
    for (const r of tree) if (r.grain === "okres" && r.okres) s.add(r.okres);
    return [...s].sort((a, b) => a.localeCompare(b, "sk"));
  }, [tree]);

  async function run(o = okres, pt = ptype, dl = deal) {
    setBusy(true);
    try { setRes(await getMarketHistory({ data: { okres: o || undefined, ptype: pt, deal: dl } })); }
    finally { setBusy(false); }
  }

  const [openMover, setOpenMover] = useState<number | null>(null);
  const [curve, setCurve] = useState<Awaited<ReturnType<typeof getListingPriceHistory>>>([]);
  async function openCurve(i: number, m: (typeof res.movers)[number]) {
    if (openMover === i) { setOpenMover(null); return; }
    setOpenMover(i); setCurve([]);
    if (!m.source || !m.ext_id) return;
    try { setCurve(await getListingPriceHistory({ data: { source: m.source, ext_id: m.ext_id } })); } catch { setCurve([]); }
  }

  const s = res.series;
  const first = s[0], last = s[s.length - 1];
  const change = first && last && first.median_eur_m2 ? Math.round((last.median_eur_m2 / first.median_eur_m2 - 1) * 100) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Trhová história cien</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Ako sa <b>hýbali ceny</b> podľa podmienok — medián €/m² v čase (z denného scrapu) + najväčšie cenové pohyby inzerátov.
          Časový rad rastie s každým dňom zberu. Orientačné (verejná inzercia), nie znalecký posudok.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select value={okres} onChange={(e) => { setOkres(e.target.value); void run(e.target.value); }}
            className="rounded-lg border border-line bg-paper px-2 py-2 text-sm text-fg outline-none focus:border-brand">
            <option value="">Celé SR</option>
            {okresy.map((o) => <option key={o} value={o}>okres {o}</option>)}
          </select>
          <select value={ptype} onChange={(e) => { setPtype(e.target.value); void run(okres, e.target.value); }}
            className="rounded-lg border border-line bg-paper px-2 py-2 text-sm text-fg outline-none focus:border-brand">
            {PTYPES.map((p) => <option key={p.id} value={p.id}>{p.l}</option>)}
          </select>
          <select value={deal} onChange={(e) => { setDeal(e.target.value); void run(okres, ptype, e.target.value); }}
            className="rounded-lg border border-line bg-paper px-2 py-2 text-sm text-fg outline-none focus:border-brand">
            <option value="predaj">Predaj</option>
            <option value="prenajom">Prenájom</option>
          </select>
          {busy ? <span className="text-xs text-muted">…</span> : null}
          {change != null ? (
            <span className={"ml-auto rounded-full px-2.5 py-1 text-xs font-medium " + (change > 0 ? "bg-[#3f5a3c]/10 text-[#3f5a3c]" : change < 0 ? "bg-[#9c4a40]/10 text-[#9c4a40]" : "bg-surface-2 text-muted")}>
              {change > 0 ? "▲" : change < 0 ? "▼" : "="} {Math.abs(change)} % za obdobie
            </span>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title={`Medián €/m² v čase${okres ? ` — okres ${okres}` : " — SR"}`} hint={`${s.length} dní · ${last ? last.cnt + " inzerátov" : ""}`} />
        <TrendChart series={s} />
      </Card>

      <Card className="p-4">
        <SectionHeader title={`Najväčšie cenové pohyby (${res.movers.length})`} hint="pôvodná → aktuálna cena inzerátu" />
        {res.movers.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">Žiadne cenové zmeny pre tieto podmienky (dáta rastú časom).</div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {res.movers.slice(0, 25).map((m, i) => (
              <div key={i} className="py-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => void openCurve(i, m)} title="Zobraziť krivku ceny" className="w-14 shrink-0 text-center">
                    <div className={"text-sm font-bold tabular-nums " + (m.drop_pct > 0 ? "text-[#3f5a3c]" : "text-[#9c4a40]")}>{m.drop_pct > 0 ? "−" : "+"}{Math.abs(m.drop_pct)}%</div>
                  </button>
                  <button onClick={() => void openCurve(i, m)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-fg">{m.title || "inzerát"}</div>
                    <div className="truncate text-[12px] text-muted">{m.obec ?? "—"}{m.area_m2 ? ` · ${m.area_m2.toLocaleString("sk-SK")} m²` : ""} · {openMover === i ? "▴ krivka" : "▾ krivka"}</div>
                  </button>
                  <div className="shrink-0 text-right text-xs">
                    <div className="text-muted line-through">{eur(m.first_price)} €</div>
                    <div className="font-semibold text-fg">{eur(m.price_eur)} €</div>
                  </div>
                  {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-fg hover:border-ink">↗</a> : null}
                </div>
                {openMover === i ? <div className="mt-1 rounded-md border border-line bg-surface-2/30 p-2"><Sparkline pts={curve} /></div> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Disclaimer>
        Ceny sú z verejnej inzercie (denný scrap). Časový rad je agregovaný medián lokality/typu; per-inzerát pohyb je pôvodná vs aktuálna cena.
        Nejde o znalecký posudok ani úradné dáta.
      </Disclaimer>
    </div>
  );
}
