import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getMarketStats, getMarketTree, getMarketSeries, getMarketOpportunities, refreshMarketData, refreshMarketListings, getMarketListings, type MarketTreeRow } from "../lib/api/kataster.functions";
import { useRole } from "../lib/role-context";
import { Card, Disclaimer, SectionHeader, Badge } from "../components/kit";

export const Route = createFileRoute("/ceny")({
  head: () => ({ meta: [{ title: "Trhové ceny — TRI LIPY KATASTER CORE" }] }),
  loader: async () => ({
    stats: await getMarketStats().catch((): Awaited<ReturnType<typeof getMarketStats>> => ({ meta: {}, latest: null, overview: [] })),
    tree: await getMarketTree({ data: { deal: "predaj" } }).catch((): MarketTreeRow[] => []),
  }),
  component: CenyPage,
});

const eur = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €/m²");
const PTYPES = [
  { id: "byt", label: "Byty" }, { id: "dom", label: "Domy" }, { id: "pozemok", label: "Pozemky" }, { id: "chata", label: "Chaty" },
];

type ObecNode = { obec: string; median: number | null; cnt: number };
type OkresNode = { okres: string; median: number | null; cnt: number; obce: ObecNode[] };
type KrajNode = { kraj: string; median: number | null; cnt: number; okresy: OkresNode[] };

function CenyPage() {
  const { stats: initial, tree: initialTree } = Route.useLoaderData();
  const { role } = useRole();
  const [stats, setStats] = useState(initial);
  const [tree, setTree] = useState<MarketTreeRow[]>(initialTree);
  const [ptype, setPtype] = useState("pozemok");
  const [okres, setOkres] = useState<string | null>(null);
  const [okSearch, setOkSearch] = useState("");
  const [openK, setOpenK] = useState<Set<string>>(new Set());
  const [openO, setOpenO] = useState<Set<string>>(new Set());
  const [series, setSeries] = useState<Awaited<ReturnType<typeof getMarketSeries>>>([]);
  const [opps, setOpps] = useState<Awaited<ReturnType<typeof getMarketOpportunities>>>([]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const canAdmin = role === "admin" || role === "manager";
  const [listings, setListings] = useState<Awaited<ReturnType<typeof getMarketListings>>>({ rows: [], total: 0 });
  const [lf, setLf] = useState({ obec: "", ptype: "", priceMax: "", onlyOpps: false, removed: false });
  const [lLoading, setLLoading] = useState(false);
  async function loadListings() {
    setLLoading(true);
    try { setListings(await getMarketListings({ data: { obec: lf.obec || undefined, ptype: lf.ptype || undefined, priceMax: lf.priceMax ? Number(lf.priceMax) : undefined, onlyOpps: lf.onlyOpps || undefined, removed: lf.removed || undefined, limit: 100 } })); }
    catch { setListings({ rows: [], total: 0 }); } finally { setLLoading(false); }
  }

  // Strom Kraj → Okres → Lokalita pre zvolený typ.
  const nested = useMemo<KrajNode[]>(() => {
    const forType = tree.filter((r) => r.ptype === ptype);
    const kMap = new Map<string, KrajNode>();
    const kget = (kraj: string) => { let k = kMap.get(kraj); if (!k) { k = { kraj, median: null, cnt: 0, okresy: [] }; kMap.set(kraj, k); } return k; };
    for (const r of forType) if (r.grain === "kraj") { const k = kget(r.kraj); k.median = r.median_eur_m2; k.cnt = r.cnt; }
    const oMap = new Map<string, OkresNode>();
    for (const r of forType) if (r.grain === "okres" && r.okres) { const k = kget(r.kraj); const o: OkresNode = { okres: r.okres, median: r.median_eur_m2, cnt: r.cnt, obce: [] }; k.okresy.push(o); oMap.set(r.kraj + "|" + r.okres, o); }
    for (const r of forType) if (r.grain === "obec" && r.okres && r.obec) { const o = oMap.get(r.kraj + "|" + r.okres); if (o) o.obce.push({ obec: r.obec, median: r.median_eur_m2, cnt: r.cnt }); }
    const arr = [...kMap.values()].sort((a, b) => (b.median ?? 0) - (a.median ?? 0) || a.kraj.localeCompare(b.kraj, "sk"));
    for (const k of arr) { k.okresy.sort((a, b) => (b.median ?? 0) - (a.median ?? 0)); for (const o of k.okresy) o.obce.sort((a, b) => (b.median ?? 0) - (a.median ?? 0)); }
    return arr;
  }, [tree, ptype]);

  // Filtrovaný pohľad podľa hľadania (pri hľadaní je všetko rozbalené).
  const q = okSearch.trim().toLowerCase();
  const view = useMemo(() => {
    if (!q) return nested.map((k) => ({ k, okresy: k.okresy }));
    const out: { k: KrajNode; okresy: OkresNode[] }[] = [];
    for (const k of nested) {
      const kMatch = k.kraj.toLowerCase().includes(q);
      const okresy: OkresNode[] = [];
      for (const o of k.okresy) {
        const oMatch = o.okres.toLowerCase().includes(q);
        const obce = (kMatch || oMatch) ? o.obce : o.obce.filter((b) => b.obec.toLowerCase().includes(q));
        if (kMatch || oMatch || obce.length) okresy.push({ ...o, obce });
      }
      if (kMatch || okresy.length) out.push({ k, okresy });
    }
    return out;
  }, [nested, q]);

  // Default: vyber najväčší okres (podľa počtu) pre trend, ak nič nie je zvolené.
  useEffect(() => {
    if (okres) return;
    let best: { okres: string; cnt: number } | null = null;
    for (const r of tree) if (r.grain === "okres" && r.okres && r.ptype === ptype && (!best || r.cnt > best.cnt)) best = { okres: r.okres, cnt: r.cnt };
    if (best) setOkres(best.okres);
  }, [tree, ptype, okres]);

  // Auto-refresh: keď admin/manažér otvorí a dáta sú staršie ako 12 h, natiahne sám (netreba klikať Načítať).
  useEffect(() => {
    const last = stats.meta.last_refresh;
    const staleMs = last ? Date.now() - new Date(last.replace(" ", "T") + "Z").getTime() : Infinity;
    if (canAdmin && stats.meta.source_url && staleMs > 12 * 3600 * 1000) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (okres) getMarketSeries({ data: { okres, ptype, deal: "predaj" } }).then(setSeries).catch(() => setSeries([]));
    getMarketOpportunities({ data: { okres: okres ?? undefined } }).then(setOpps).catch(() => setOpps([]));
  }, [okres, ptype]);

  async function refresh() {
    setBusy(true); setMsg(null);
    try {
      const r = await refreshMarketData({ data: { role, url: url.trim() || undefined } });
      if (!r.ok) { setMsg(r.message ?? "Zlyhalo."); return; }
      let ing = 0;
      const base = (url.trim() || stats.meta.source_url || "");
      for (let i = 0; i < (r.chunks ?? 0); i++) {
        const chunkUrl = base.replace("market-data.json", `market-listings-${i}.json`);
        const rr = await refreshMarketListings({ data: { role, url: chunkUrl } }).catch(() => ({ ok: false, count: 0 }));
        if (rr.ok) ing += rr.count;
        setMsg(`Načítavam inzeráty… ${i + 1}/${r.chunks} (${ing})`);
      }
      setMsg(`Načítané: ${r.index} index, ${r.opps} príležitostí, ${ing} inzerátov${r.generated ? ` (dáta z ${r.generated})` : ""}.`);
      setStats(await getMarketStats());
      setTree(await getMarketTree({ data: { deal: "predaj" } }).catch(() => []));
    } catch (e) { setMsg(e instanceof Error ? e.message : "Chyba."); } finally { setBusy(false); }
  }

  const toggleK = (k: string) => setOpenK((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleO = (key: string) => setOpenO((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const isOpenK = (k: string) => !!q || openK.has(k);
  const isOpenO = (key: string) => !!q || openO.has(key);

  const maxMed = Math.max(1, ...series.map((s) => s.median_eur_m2));
  const minMed = Math.min(...series.map((s) => s.median_eur_m2), maxMed);
  const trend = series.length >= 2 ? ((series[series.length - 1].median_eur_m2 - series[0].median_eur_m2) / series[0].median_eur_m2) * 100 : null;
  // Lineárna predikcia (least-squares) z časového radu — aktivuje sa po ~4 dňoch zberu.
  const predict = (() => {
    if (series.length < 4) return null;
    const n = series.length, xs = series.map((_, i) => i), ys = series.map((s) => s.median_eur_m2);
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let nu = 0, de = 0;
    for (let i = 0; i < n; i++) { nu += (xs[i] - mx) * (ys[i] - my); de += (xs[i] - mx) ** 2; }
    const slope = de ? nu / de : 0, last = ys[n - 1];
    return { proj90: Math.round(last + slope * 90), yearPct: last ? Math.round((slope * 365 / last) * 1000) / 10 : 0 };
  })();

  const hasData = tree.length > 0 || stats.overview.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <SectionHeader title="Trhové ceny nehnuteľností" hint="Zo scrapu inzercie (denne). Medián ceny za m² podľa kraja → okresu → lokality, trend, príležitosti." />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {PTYPES.map((p) => (
          <button key={p.id} onClick={() => setPtype(p.id)} className={`rounded-full border px-3 py-1 ${ptype === p.id ? "border-green bg-green/10 text-green" : "border-line text-muted hover:text-fg"}`}>{p.label}</button>
        ))}
        <span className="ml-auto text-xs text-muted">
          {stats.latest ? `Posledný index: ${stats.latest}` : "Zatiaľ bez dát"}{stats.meta.last_refresh ? ` · refresh ${String(stats.meta.last_refresh).slice(0, 16)}` : ""}
        </span>
      </div>

      {!hasData ? (
        <Card>
          <div className="text-sm text-muted">
            Zatiaľ žiadne trhové dáta. Denný scraper (na Macu) publikuje <b className="text-fg">market-data.json</b> na verejné URL;
            appka si ho stiahne nižšie tlačidlom (alebo automaticky). Nastav zdrojové URL a klikni „Načítať".
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Rozdeľovník: Kraj → Okres → Lokalita */}
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-fg">Medián ceny za m² — {PTYPES.find((p) => p.id === ptype)?.label}</span>
              <input value={okSearch} onChange={(e) => setOkSearch(e.target.value)} placeholder="hľadať kraj/okres/obec…" className="w-40 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-green" />
            </div>
            <div className="max-h-96 space-y-0.5 overflow-y-auto text-sm">
              {view.length === 0 ? <div className="py-3 text-center text-xs text-muted">Žiadne dáta{q ? ` pre „${okSearch}"` : ""}.</div> : null}
              {view.map(({ k, okresy }) => (
                <div key={k.kraj}>
                  {/* KRAJ */}
                  <button onClick={() => toggleK(k.kraj)} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left font-semibold text-fg hover:bg-surface-2/50">
                    <span className="flex items-center gap-1.5"><span className="w-3 text-[10px] text-muted">{isOpenK(k.kraj) ? "▾" : "▸"}</span>{k.kraj}</span>
                    <span className="tabular-nums text-muted">{eur(k.median)} <span className="text-[10px]">· {k.cnt}</span></span>
                  </button>
                  {/* OKRESY */}
                  {isOpenK(k.kraj) ? okresy.map((o) => {
                    const okey = k.kraj + "|" + o.okres;
                    const obce = o.obce.filter((b) => !(o.obce.length === 1 && b.obec === o.okres)); // skry redundantnú bazos-lokalitu = okres
                    return (
                      <div key={okey}>
                        <div className={`flex w-full items-center justify-between gap-2 rounded pl-5 pr-2 py-1 text-left ${okres === o.okres ? "bg-surface-2" : "hover:bg-surface-2/40"}`}>
                          <button onClick={() => { setOkres(o.okres); if (obce.length) toggleO(okey); }} className="flex flex-1 items-center gap-1.5 text-left text-fg">
                            <span className="w-3 text-[10px] text-muted">{obce.length ? (isOpenO(okey) ? "▾" : "▸") : ""}</span>{o.okres}
                          </button>
                          <span className="tabular-nums text-muted">{eur(o.median)} <span className="text-[10px]">· {o.cnt}</span></span>
                        </div>
                        {/* LOKALITY (obce) */}
                        {isOpenO(okey) && obce.length ? obce.map((b, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 rounded pl-10 pr-2 py-0.5 text-[13px] text-muted hover:bg-surface-2/30">
                            <span className="truncate">{b.obec}</span>
                            <span className="tabular-nums">{eur(b.median)} <span className="text-[10px]">· {b.cnt}</span></span>
                          </div>
                        )) : null}
                      </div>
                    );
                  }) : null}
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-muted">Klik na okres = trend nižšie. Cena za m² = medián inzerátov (mimo-rozsahové hodnoty vylúčené).</div>
          </Card>

          {/* Trend graf */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-fg">Trend — {okres ?? "—"}</div>
              {trend != null ? <Badge color={trend >= 0 ? "#5b7a58" : "#a05252"}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)} %</Badge> : null}
            </div>
            {series.length >= 2 ? (
              <svg viewBox="0 0 300 120" className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
                <polyline fill="none" stroke="#5b7a58" strokeWidth="2"
                  points={series.map((s, i) => `${(i / (series.length - 1)) * 300},${120 - ((s.median_eur_m2 - minMed) / Math.max(1, maxMed - minMed)) * 110 - 5}`).join(" ")} />
              </svg>
            ) : <div className="py-6 text-center text-sm text-muted">Málo bodov na trend (treba viac dní zberu).</div>}
            <div className="mt-1 flex justify-between text-[10px] text-muted"><span>{series[0]?.day ?? ""}</span><span>{series[series.length - 1]?.day ?? ""}</span></div>
            {predict ? (
              <div className="mt-2 rounded border border-line bg-surface-2/30 p-2 text-xs">
                <span className="text-muted">Predikcia (lineárny trend): </span>
                <b className="text-fg">~ {eur(predict.proj90)}</b> o ~3 mes · <span style={{ color: predict.yearPct >= 0 ? "#5b7a58" : "#a05252" }}>{predict.yearPct >= 0 ? "+" : ""}{predict.yearPct} %/rok</span>
              </div>
            ) : series.length >= 2 ? <div className="mt-2 text-[10px] text-muted">Predikcia sa objaví po ~4 dňoch zberu.</div> : null}
          </Card>
        </div>
      )}

      {/* Príležitosti */}
      <div className="mt-4">
        <SectionHeader title="Cenové príležitosti" hint="Znížené ceny · dlho na trhu · pod trhovou cenou." />
        {opps.length === 0 ? (
          <Card><div className="text-sm text-muted">Zatiaľ žiadne cenové príležitosti (čaká na dáta zo scrapu).</div></Card>
        ) : (
          <Card className="divide-y divide-line">
            {opps.slice(0, 40).map((o, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <a href={String(o.url ?? "#")} target="_blank" rel="noreferrer" className="block truncate font-medium text-fg hover:underline">{String(o.title ?? "inzerát")}</a>
                  <div className="text-xs text-muted">{String(o.okres ?? "")}{o.obec ? ` · ${o.obec}` : ""} · {String(o.ptype ?? "")} · {o.area_m2 ? `${o.area_m2} m²` : ""}</div>
                </div>
                <div className="whitespace-nowrap text-right">
                  <div className="tabular-nums text-fg">{o.price_eur ? Number(o.price_eur).toLocaleString("sk-SK") + " €" : "—"}</div>
                  <div className="flex justify-end gap-1 text-[10px]">
                    {String(o.flags ?? "").includes("drop") ? <span className="rounded px-1" style={{ background: "#5b7a5822", color: "#3f5a3c" }}>−{Number(o.price_drop_pct ?? 0).toFixed(0)} %</span> : null}
                    {String(o.flags ?? "").includes("below") ? <span className="rounded px-1" style={{ background: "#c9a45c22", color: "#8a6d2f" }}>pod trhom {Number(o.below_market_pct ?? 0).toFixed(0)} %</span> : null}
                    {String(o.flags ?? "").includes("long") ? <span className="rounded px-1" style={{ background: "#9c4a4022", color: "#9c4a40" }}>{Number(o.days_on_market ?? 0)} dní</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Inzeráty — celé SR, prehľadávateľné (história navždy) */}
      <div className="mt-4">
        <SectionHeader title="Inzeráty (celé SR)" hint="Všetky inzeráty zo scrapu — filtrovateľné. Uvidíš, čo presne bolo v inzercii." />
        <Card className="p-3">
          <div className="mb-2 flex flex-wrap items-end gap-2 text-sm">
            <input value={lf.obec} onChange={(e) => setLf({ ...lf, obec: e.target.value })} placeholder="obec/okres…" className="w-32 rounded-lg border border-line bg-surface px-2 py-1.5 text-fg outline-none focus:border-green" />
            <select value={lf.ptype} onChange={(e) => setLf({ ...lf, ptype: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-fg">
              <option value="">všetky typy</option>{PTYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input value={lf.priceMax} onChange={(e) => setLf({ ...lf, priceMax: e.target.value.replace(/\D/g, "") })} placeholder="cena do €" className="w-28 rounded-lg border border-line bg-surface px-2 py-1.5 text-fg outline-none focus:border-green" />
            <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={lf.onlyOpps} onChange={(e) => setLf({ ...lf, onlyOpps: e.target.checked })} /> len príležitosti</label>
            <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={lf.removed} onChange={(e) => setLf({ ...lf, removed: e.target.checked })} /> stiahnuté/predané</label>
            <button onClick={() => void loadListings()} disabled={lLoading} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-50">{lLoading ? "…" : "Filtrovať"}</button>
            <span className="ml-auto text-xs text-muted">{listings.total.toLocaleString("sk-SK")} inzerátov</span>
          </div>
          {listings.rows.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">{lLoading ? "Načítavam…" : "Klikni Filtrovať (alebo zatiaľ bez dát — počkaj na plný scrape)."}</div>
          ) : (
            <div className="max-h-[28rem] divide-y divide-line overflow-y-auto">
              {listings.rows.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <a href={o.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate font-medium text-fg hover:underline">{o.title ?? "inzerát"}</a>
                    <div className="text-xs text-muted">{o.obec ?? ""}{o.okres && o.okres !== o.obec ? ` · okr. ${o.okres}` : ""}{o.psc ? ` · ${o.psc}` : ""} · {o.ptype ?? ""} · {o.area_m2 ? `${o.area_m2} m²` : "—"}{o.ppm2 ? ` · ${Math.round(o.ppm2)} €/m²` : ""}</div>
                  </div>
                  <div className="whitespace-nowrap text-right">
                    <div className="tabular-nums text-fg">{o.price_eur ? o.price_eur.toLocaleString("sk-SK") + " €" : "—"}</div>
                    <div className="flex justify-end gap-1 text-[10px]">
                      {o.flags?.includes("drop") ? <span className="rounded px-1" style={{ background: "#5b7a5822", color: "#3f5a3c" }}>zníženie</span> : null}
                      {o.flags?.includes("below") ? <span className="rounded px-1" style={{ background: "#c9a45c22", color: "#8a6d2f" }}>pod trhom</span> : null}
                      {o.flags?.includes("long") ? <span className="rounded px-1" style={{ background: "#9c4a4022", color: "#9c4a40" }}>dlho</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Admin: zdroj dát */}
      {canAdmin ? (
        <div className="mt-4">
          <SectionHeader title="Zdroj dát (admin)" hint="URL verejného market-data.json, ktorý publikuje denný scraper." />
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={stats.meta.source_url ?? "https://…/market-data.json"} className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-green" />
              <button onClick={() => void refresh()} disabled={busy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">{busy ? "Načítavam…" : "Načítať dáta"}</button>
            </div>
            {msg ? <div className="mt-2 text-sm text-muted">{msg}</div> : null}
            {stats.meta.source_url ? <div className="mt-1 text-[11px] text-muted">Aktuálny zdroj: {stats.meta.source_url}</div> : null}
          </Card>
        </div>
      ) : null}

      <Disclaimer>
        Ceny sú z verejných inzerátov (scrape) — orientačné, nie znalecký posudok. „Cena za m²" = medián €/m² inzerátov v lokalite (mimo-rozsahové hodnoty vylúčené); „celková cena" = inzerovaná cena nehnuteľnosti. „Pod trhom" = €/m² oproti mediánu lokality.
      </Disclaimer>
    </div>
  );
}
