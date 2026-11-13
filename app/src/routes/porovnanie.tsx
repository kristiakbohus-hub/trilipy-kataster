// POROVNANIE NEHNUTEĽNOSTÍ VEDĽA SEBA (2026-11-13) — 2 až 6 listov naraz: výmera, ÚP, hodnota, financovanie, riziká,
// terén, slnko, dostupnosť. Vstup: ?ds=kn-874604&p=3711/41,5531/22 (jedno k.ú.) alebo ?refs=kn-874604:3711/41,kn-866083:120/3
// alebo ?brief=<id> (najlepší kandidáti zadania). Tlač na šírku. BEZ `loader` (dáta až po prihlásení).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getFinanceMarket, getPropertyCore, getSearchBrief, type PropertyCore } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { fact, mainKey, zoneOf, type SheetData } from "../lib/property-eval";
import { financeOf, type FinMarket } from "../lib/finance";
import { legalRisk } from "../components/property-extra";

type Search = { ds?: string; p?: string; refs?: string; brief?: string };
export const Route = createFileRoute("/porovnanie")({
  head: () => ({ meta: [{ title: "Porovnanie nehnuteľností — TRI LIPY" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ds: typeof s.ds === "string" ? s.ds : undefined, p: typeof s.p === "string" ? s.p : undefined,
    refs: typeof s.refs === "string" ? s.refs : undefined, brief: typeof s.brief === "string" || typeof s.brief === "number" ? String(s.brief) : undefined,
  }),
  component: ComparePage,
});

const nf = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: d }));
const eur = (n: number | null | undefined) => (n == null ? "—" : `${nf(Math.round(n))} €`);

function ComparePage() {
  const s = Route.useSearch();
  const { token } = useAuth();
  const [items, setItems] = useState<{ ref: string; core: PropertyCore | null }[]>([]);
  const [market, setMarket] = useState<FinMarket | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    void (async () => {
      let refs: { ds: string; p: string }[] = [];
      if (s.refs) refs = s.refs.split(",").map((x) => { const [ds, p] = x.split(":"); return { ds, p }; }).filter((x) => x.ds && x.p);
      else if (s.ds && s.p) refs = s.p.split(",").map((p) => ({ ds: s.ds as string, p: p.trim() }));
      else if (s.brief) {
        const b = await getSearchBrief({ data: { token, id: Number(s.brief) } }).catch(() => null);
        refs = (b?.results ?? []).filter((r) => r.dataset_id).slice(0, 6).map((r) => ({ ds: r.dataset_id as string, p: String(r.parcels ?? "").split(/[,;\s]+/)[0] })).filter((x) => x.p);
        setNote(b?.brief ? `Zadanie #${s.brief}: ${b.brief.title}` : null);
      }
      refs = refs.slice(0, 6);
      setItems(refs.map((r) => ({ ref: `${r.ds}:${r.p}`, core: null })));
      getFinanceMarket({ data: { token } }).then((r) => setMarket(r.market)).catch(() => {});
      const cores = await Promise.all(refs.map((r) => getPropertyCore({ data: { token, datasetId: r.ds, kind: "parcela", ref: r.p } }).catch(() => null)));
      setItems(refs.map((r, i) => ({ ref: `${r.ds}:${r.p}`, core: cores[i] })));
    })();
  }, [token, s.ds, s.p, s.refs, s.brief]);
  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa.</div>;
  if (!items.length) return <div className="p-6 text-sm text-muted">Porovnanie: zadajte ?ds=…&p=a,b alebo ?brief=ID. <Link to="/nehnutelnost" className="text-brand underline">List nehnuteľnosti</Link></div>;
  const sheets = items.map((it) => (it.core?.ok ? ({ core: it.core, limits: null, access: null, zone: null, avm: null, medPoz: null, upDocs: [], ext: null, dev: null, generatedAt: new Date().toISOString(), fin: market } as SheetData) : null));
  const fins = sheets.map((d) => (d ? financeOf(d, market) : null));
  const row = (label: string, f: (d: SheetData, i: number) => ReactNode) => (
    <tr className="border-b border-line/50 align-top"><td className="py-1 pr-3 text-muted">{label}</td>{sheets.map((d, i) => <td key={i} className="py-1 pr-3 tabular-nums">{d ? f(d, i) : "…"}</td>)}</tr>
  );
  return (
    <div className="space-y-3 px-4 py-5 print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } .no-print, nav, aside, header.app, footer { display: none !important; } table { font-size: 8pt; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="text-[10px] uppercase tracking-[0.22em] text-muted">TRI LIPY · porovnanie nehnuteľností</div><h1 className="text-xl font-semibold">Porovnanie {items.length} nehnuteľností</h1>{note ? <div className="text-xs text-muted">{note}</div> : null}</div>
        <button onClick={() => window.print()} className="no-print rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream">Tlačiť / PDF</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-ink text-left"><th className="py-1 pr-3" />{sheets.map((d, i) => <th key={i} className="py-1 pr-3 font-semibold">{d ? <Link to="/nehnutelnost" search={{ ds: d.core.dataset?.id, p: d.core.main.parcelNo ?? undefined }} className="text-brand underline">{d.core.title}</Link> : items[i].ref}</th>)}</tr></thead>
          <tbody>
            {row("Katastrálne územie", (d) => (d.core.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, ""))}
            {row("Výmera", (d) => `${nf(d.core.parcels.reduce((x, p) => x + (p.area_m2 ?? 0), 0))} m²`)}
            {row("Územný plán", (d) => zoneOf(d).name ?? "—")}
            {row("Prístup", (d) => String(fact(d.core, "pristup", mainKey(d.core) ?? "")?.trieda ?? "—"))}
            {row("Sklon / orientácia", (d) => { const t = fact(d.core, "teren", mainKey(d.core) ?? ""); return t ? `${nf(Number(t.sklon_avg), 1)} % · ${String(t.orient ?? "—")}` : "—"; })}
            {row("Slnko 21. 12.", (d) => { const x = fact(d.core, "slnko", mainKey(d.core) ?? "")?.dec_slnko; return x != null ? `${nf(Number(x), 1)} h` : "—"; })}
            {row("Žilina autom", (d) => { const x = fact(d.core, "osm", mainKey(d.core) ?? "")?.t_za; return x != null ? `${String(x)} min` : "—"; })}
            {row("Vlastníci / ťarchy", (d) => `${d.core.owners.perLv.reduce((x, l) => x + l.count, 0)} / ${d.core.legal.reduce((x, l) => x + l.tarchyCount, 0)}`)}
            {row("Právne riziko", (d) => { const r = legalRisk(d); return `${r.score} (${r.level})`; })}
            {row("Odhad hodnoty", (d) => eur(d.core.compStats?.estimateEur))}
            {row("Cena v inzeráte", (d) => eur(d.core.listings.find((l) => !l.removed && l.price_eur)?.price_eur))}
            {row("Hypotéka mesačne (80 %)", (_d, i) => eur(fins[i]?.mortgage?.payment))}
            {row("Vlastné zdroje", (_d, i) => eur(fins[i]?.mortgage?.ownFunds.total))}
            {row("Ročné náklady vlastníctva", (_d, i) => eur(fins[i]?.costs.annualTotal))}
            {row("Hodnota o 5 rokov", (_d, i) => eur(fins[i]?.prediction?.scenarios[1].values[2]))}
            {row("Náklady pred stavbou", (_d, i) => eur(fins[i]?.costs.buildTotal))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted">Orientačné porovnanie z údajov listov (bez živých registrov limitov). Podrobnosti v liste každej nehnuteľnosti. Nie znalecký posudok.</p>
    </div>
  );
}
