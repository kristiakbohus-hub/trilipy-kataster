import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  searchContractPrices, exportContractPrices, contractPriceFacets,
  type ContractPriceFilter, type ContractPriceSearch, type ContractPricePoint,
} from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { Card, Disclaimer, SectionHeader, Badge, Stat } from "../components/kit";
import { csvDocument, csvLine } from "../lib/csv";

// Ceny z katastra (zadanie vlastníka 2026-11-13): vyhľadávanie v JEDNOTLIVÝCH zmluvách s cenou zo SPI
// (CEN + CAS od 2019). Filtre: miesto a typ, obdobie/cena/€/m²/výmera, druh pozemku a zastavané územie,
// číslo parcely/LV. Výstup: súhrn, graf po rokoch, mapa, zoznam, export (bez mien). Mená súčasných
// vlastníkov LV len pre plný prístup a len na obrazovke. Podozrivé ceny skryté, nikdy v mediánoch.
export const Route = createFileRoute("/ceny-katastra")({
  head: () => ({ meta: [{ title: "Ceny z katastra — TRI LIPY KATASTER CORE" }] }),
  component: CenyKatastraPage,
});

const KINDS = [
  { id: "pozemok", label: "Pozemok" }, { id: "byt", label: "Byt" }, { id: "dom", label: "Rodinný dom" },
  { id: "stavba", label: "Iná stavba" }, { id: "zmiesane", label: "Pozemok so stavbou" },
] as const;
type Kind = (typeof KINDS)[number]["id"];
const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));
const DRP: [number, string][] = [[2, "orná pôda"], [5, "záhrada"], [7, "trvalý trávny porast"], [6, "ovocný sad"], [10, "lesný pozemok"], [13, "zastavaná plocha"], [14, "ostatná plocha"], [11, "vodná plocha"]];
const DRP_LABEL: Record<number, string> = Object.fromEntries([...DRP, [3, "chmeľnica"], [4, "vinica"]]);
const SORTS = [{ id: "cas", label: "dátumu" }, { id: "cen", label: "ceny" }, { id: "ppm2", label: "€/m²" }, { id: "area", label: "výmery" }] as const;
type SortId = (typeof SORTS)[number]["id"];

const eur = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} €`);
const ppm = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("sk-SK", { maximumFractionDigits: n < 10 ? 2 : 0 })} €/m²`);
const m2 = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);
/** len tvar slova (číslo sa formátuje zvlášť s oddeľovačom tisícov) */
const pw = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const dateSk = (s: string) => { const [y, m, d] = s.split("-"); return `${Number(d)}. ${Number(m)}. ${y}`; };

type Form = {
  okres: string; obec: string; ds: string; kinds: Kind[]; from: string; to: string;
  cenMin: string; cenMax: string; ppm2Min: string; ppm2Max: string; areaMin: string; areaMax: string;
  drp: number[]; zu: "" | "v" | "mimo"; parcel: string; lv: string; showFlagged: boolean;
};
const EMPTY: Form = { okres: "", obec: "", ds: "", kinds: [], from: "", to: "", cenMin: "", cenMax: "", ppm2Min: "", ppm2Max: "", areaMin: "", areaMax: "", drp: [], zu: "", parcel: "", lv: "", showFlagged: false };
const num = (s: string) => { const x = Number(s.replace(/\s/g, "").replace(",", ".")); return s.trim() && Number.isFinite(x) && x >= 0 ? x : undefined; };
function toFilter(f: Form): ContractPriceFilter {
  return {
    okres: f.okres || undefined, obec: f.obec || undefined, datasetIds: f.ds ? [f.ds] : undefined,
    kinds: f.kinds.length ? f.kinds : undefined, from: f.from || undefined, to: f.to || undefined,
    cenMin: num(f.cenMin), cenMax: num(f.cenMax), ppm2Min: num(f.ppm2Min), ppm2Max: num(f.ppm2Max),
    areaMin: num(f.areaMin), areaMax: num(f.areaMax), drp: f.drp.length ? f.drp : undefined,
    zu: f.zu || undefined, parcel: f.parcel.trim() || undefined,
    lvNo: num(f.lv) ? Math.round(num(f.lv) as number) : undefined, showFlagged: f.showFlagged || undefined,
  };
}

function CenyKatastraPage() {
  const { token } = useAuth();
  const [facets, setFacets] = useState<Awaited<ReturnType<typeof contractPriceFacets>> | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [applied, setApplied] = useState<ContractPriceFilter>({});
  const [sort, setSort] = useState<SortId>("cas");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<ContractPriceSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const PAGE = 50;

  useEffect(() => {
    if (!token) return;
    contractPriceFacets({ data: { token } }).then(setFacets).catch(() => setFacets(null));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setBusy(true);
    searchContractPrices({ data: { token, f: applied, sort, dir, page, pageSize: PAGE } })
      .then((r) => { if (alive) setRes(r); })
      .catch(() => { if (alive) setRes(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [token, applied, sort, dir, page]);

  const kus = facets?.kus ?? [];
  const okresy = useMemo(() => [...new Set(kus.map((k) => k.okres).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sk")), [kus]);
  const obce = useMemo(() => [...new Set(kus.filter((k) => !form.okres || k.okres === form.okres).map((k) => k.obec).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "sk")), [kus, form.okres]);
  const kuOpts = kus.filter((k) => (!form.okres || k.okres === form.okres) && (!form.obec || k.obec === form.obec))
    .sort((a, b) => a.okres.localeCompare(b.okres, "sk") || a.kuName.localeCompare(b.kuName, "sk"));

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const submit = (e?: FormEvent) => { e?.preventDefault(); setPage(0); setApplied(toFilter(form)); };
  const reset = () => { setForm(EMPTY); setPage(0); setApplied({}); };
  const sortBy = (s: SortId) => { if (s === sort) setDir(dir === "desc" ? "asc" : "desc"); else { setSort(s); setDir("desc"); } setPage(0); };

  const doExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const r = await exportContractPrices({ data: { token, f: applied } });
      if (!r.ok) return;
      const head = ["Dátum zmluvy", "Okres", "Obec", "Katastrálne územie", "LV", "Typ", "Položky zmluvy", "Výmera m²", "Cena zo zmluvy €", "€/m²", "Druh pozemku", "Zastavané územie", "Odchýlka", "Šírka", "Dĺžka"];
      const lines = [csvLine(head), ...r.rows.map((x) => csvLine([
        x.cas, x.okres, x.obec, x.kuName, x.lvNo, KIND_LABEL[x.kind] ?? x.kind, x.items,
        x.flatM2 ?? x.landM2 ?? "", x.cen, x.ppm2 ?? "", x.drp ? DRP_LABEL[x.drp] ?? x.drp : "",
        x.inZu === 1 ? "v zastavanom území" : x.inZu === 0 ? "mimo zastavaného územia" : "", x.flag ?? "", x.lat ?? "", x.lon ?? "",
      ].map((v) => (typeof v === "number" ? String(v).replace(".", ",") : v))))];
      const blob = new Blob([csvDocument(lines)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `ceny-z-katastra-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } finally { setExporting(false); }
  };

  const s = res?.summary;
  const pages = res ? Math.max(1, Math.ceil(res.total / PAGE)) : 1;
  const inputCls = "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand/40";
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-brand bg-brand/10 text-fg" : "border-line text-muted hover:text-fg"}`;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Ceny z katastra"
        hint={`Ceny zo zmlúv zapísaných v katastri (SPI, od roku 2019)${facets?.kus.length ? ` · ${facets.kus.length} katastrálnych území` : ""}. Cena je za celú zmluvu; €/m² len pri čistých zmluvách (iba pozemky, alebo jeden byt s výmerou).`}
      />

      <Card className="p-4">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted">Okres
              <select className={inputCls} value={form.okres} onChange={(e) => setForm((f) => ({ ...f, okres: e.target.value, obec: "", ds: "" }))}>
                <option value="">všetky</option>{okresy.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">Obec
              <select className={inputCls} value={form.obec} onChange={(e) => setForm((f) => ({ ...f, obec: e.target.value, ds: "" }))}>
                <option value="">všetky</option>{obce.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">Katastrálne územie
              <select className={inputCls} value={form.ds} onChange={(e) => set("ds", e.target.value)}>
                <option value="">všetky</option>{kuOpts.map((k) => <option key={k.datasetId} value={k.datasetId}>{k.kuName} ({k.n.toLocaleString("sk-SK")})</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">Zastavané územie obce
              <select className={inputCls} value={form.zu} onChange={(e) => set("zu", e.target.value as Form["zu"])}>
                <option value="">nerozhoduje</option><option value="v">v zastavanom území</option><option value="mimo">mimo zastavaného územia</option>
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs text-muted">Typ zmluvy</div>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => <button type="button" key={k.id} className={chip(form.kinds.includes(k.id))} onClick={() => set("kinds", toggle(form.kinds, k.id))}>{k.label}</button>)}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted">Druh pozemku (prevažujúci vo zmluve)</div>
            <div className="flex flex-wrap gap-1.5">
              {DRP.map(([c, l]) => <button type="button" key={c} className={chip(form.drp.includes(c))} onClick={() => set("drp", toggle(form.drp, c))}>{l}</button>)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-xs text-muted">Dátum zmluvy
              <div className="mt-0.5 flex gap-1.5"><input type="date" className={inputCls} value={form.from} onChange={(e) => set("from", e.target.value)} aria-label="od" /><input type="date" className={inputCls} value={form.to} onChange={(e) => set("to", e.target.value)} aria-label="do" /></div>
            </div>
            <div className="text-xs text-muted">Cena zo zmluvy (€)
              <div className="mt-0.5 flex gap-1.5"><input inputMode="decimal" placeholder="od" className={inputCls} value={form.cenMin} onChange={(e) => set("cenMin", e.target.value)} /><input inputMode="decimal" placeholder="do" className={inputCls} value={form.cenMax} onChange={(e) => set("cenMax", e.target.value)} /></div>
            </div>
            <div className="text-xs text-muted">€/m²
              <div className="mt-0.5 flex gap-1.5"><input inputMode="decimal" placeholder="od" className={inputCls} value={form.ppm2Min} onChange={(e) => set("ppm2Min", e.target.value)} /><input inputMode="decimal" placeholder="do" className={inputCls} value={form.ppm2Max} onChange={(e) => set("ppm2Max", e.target.value)} /></div>
            </div>
            <div className="text-xs text-muted">Výmera (m², pozemok alebo byt)
              <div className="mt-0.5 flex gap-1.5"><input inputMode="decimal" placeholder="od" className={inputCls} value={form.areaMin} onChange={(e) => set("areaMin", e.target.value)} /><input inputMode="decimal" placeholder="do" className={inputCls} value={form.areaMax} onChange={(e) => set("areaMax", e.target.value)} /></div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted">Číslo parcely
              <input className={inputCls} placeholder="napr. 1500/2 alebo E 120/1" value={form.parcel} onChange={(e) => set("parcel", e.target.value)} />
            </label>
            <label className="text-xs text-muted">Číslo LV
              <input inputMode="numeric" className={inputCls} placeholder="napr. 1096" value={form.lv} onChange={(e) => set("lv", e.target.value)} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted sm:col-span-2">
              <input type="checkbox" checked={form.showFlagged} onChange={(e) => set("showFlagged", e.target.checked)} />
              Zobraziť aj podozrivé ceny (symbolická cena, extrémne €/m², malá parcela) — do mediánov sa nikdy nepočítajú
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">Hľadať</button>
            <button type="button" onClick={reset} className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-fg">Vymazať filtre</button>
            <button type="button" onClick={doExport} disabled={exporting || !res?.total} className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2 disabled:opacity-50">
              {exporting ? "Pripravujem…" : "Export do Excelu (CSV)"}
            </button>
          </div>
        </form>
      </Card>

      {busy && !res ? <p className="text-sm text-muted">Hľadám…</p> : null}
      {res && !res.ok ? <p className="text-sm text-muted">{res.message ?? "Vyhľadávanie zlyhalo."}</p> : null}

      {res?.ok ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Zmlúv" value={s!.n.toLocaleString("sk-SK")} sub={res.truncated ? "zobrazených prvých 40 000 — zúžte filter" : form.showFlagged ? `z toho podozrivých ${s!.nFlagged.toLocaleString("sk-SK")}` : "podozrivé ceny skryté"} />
            <Stat label="Medián ceny" value={eur(s!.medCen)} sub="za celú zmluvu, bez podozrivých" />
            <Stat label="Medián €/m²"
              value={<div className="space-y-0.5 text-lg">
                <div>{s!.nLand ? <>pozemky {ppm(s!.medLand)}</> : null}</div>
                <div>{s!.nFlat ? <>byty {ppm(s!.medFlat)}</> : null}</div>
                {!s!.nLand && !s!.nFlat ? <div>—</div> : null}
              </div>}
              sub={[s!.nLand ? `${s!.nLand.toLocaleString("sk-SK")} ${pw(s!.nLand, "čistá zmluva", "čisté zmluvy", "čistých zmlúv")} o pozemkoch` : "",
                s!.nFlat ? `${s!.nFlat.toLocaleString("sk-SK")} o bytoch` : ""].filter(Boolean).join(" · ") + ((s!.nLand && s!.nLand < 3) || (s!.nFlat && s!.nFlat < 3) ? " (medián od 3 zmlúv)" : "") || "bez čistých zmlúv"} />
            <Stat label="Na mape" value={(s!.n - s!.withoutGeo).toLocaleString("sk-SK")} sub={s!.withoutGeo ? `${s!.withoutGeo} bez polohy` : "všetky s polohou"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Mapa zmlúv</div>
              <PriceMap points={res.points} />
            </Card>
            <Card className="p-4 lg:col-span-2">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Vývoj po rokoch</div>
              <YearChart rows={res.byYear} />
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-muted">
              <span>{res.total.toLocaleString("sk-SK")} zmlúv · zoradené podľa {SORTS.find((x) => x.id === sort)?.label} ({dir === "desc" ? "zostupne" : "vzostupne"}){busy ? " · načítavam…" : ""}</span>
              {res.ownersShown ? <span>Vlastníci = SÚČASNÍ vlastníci LV, nemusia byť kupujúci z danej zmluvy.</span> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-surface-2/60 text-left text-xs text-muted">
                  <tr>
                    <Th label="Dátum" id="cas" sort={sort} dir={dir} onSort={sortBy} />
                    <th className="px-3 py-2">Miesto</th>
                    <th className="px-3 py-2">LV</th>
                    <th className="px-3 py-2">Typ a položky</th>
                    <Th label="Výmera" id="area" sort={sort} dir={dir} onSort={sortBy} right />
                    <Th label="Cena" id="cen" sort={sort} dir={dir} onSort={sortBy} right />
                    <Th label="€/m²" id="ppm2" sort={sort} dir={dir} onSort={sortBy} right />
                    <th className="px-3 py-2">Pozemok</th>
                    {res.ownersShown ? <th className="px-3 py-2">Súčasní vlastníci LV</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={`${r.datasetId}-${r.lvNo}-${r.cas}-${i}`} className="border-t border-line align-top">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dateSk(r.cas)}</td>
                      <td className="px-3 py-2"><div className="text-fg">{r.kuName}</div><div className="text-xs text-muted">{[r.obec, r.okres && `okres ${r.okres}`].filter(Boolean).join(" · ")}</div></td>
                      <td className="px-3 py-2"><Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: r.datasetId, lvNo: String(r.lvNo) }} search={{ typ: "vypis" as const }} className="text-brand hover:underline">{r.lvNo}</Link></td>
                      <td className="max-w-[320px] px-3 py-2">
                        <div className="text-fg">{KIND_LABEL[r.kind] ?? r.kind}{r.flag ? <span className="ml-1.5"><Badge color="#9a7b3e">{r.flag}</Badge></span> : null}</div>
                        <div className="text-xs text-muted">{r.items}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{m2(r.flatM2 ?? r.landM2)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-fg">{eur(r.cen)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{ppm(r.ppm2)}</td>
                      <td className="px-3 py-2 text-xs text-muted">{[r.drp ? DRP_LABEL[r.drp] : null, r.inZu === 1 ? "v zastavanom území" : r.inZu === 0 ? "mimo zastavaného územia" : null].filter(Boolean).join(" · ") || "—"}</td>
                      {res.ownersShown ? <td className="max-w-[260px] px-3 py-2 text-xs text-fg">{r.owners?.length ? `${r.owners.slice(0, 4).join(", ")}${r.owners.length > 4 ? ` a ďalší (${r.owners.length - 4})` : ""}` : "—"}</td> : null}
                    </tr>
                  ))}
                  {!res.rows.length ? <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted">Žiadna zmluva nezodpovedá filtru.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">← Predchádzajúca</button>
                <span>strana {page + 1} z {pages.toLocaleString("sk-SK")}</span>
                <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">Ďalšia →</button>
              </div>
            ) : null}
          </Card>

          <Disclaimer>
            Ceny pochádzajú zo zmlúv zapísaných v katastri (pole CEN a dátum CAS v SPI). Kataster pri každej položke zmluvy opakuje cenu celej zmluvy,
            preto je jedna zmluva jeden riadok. Nejde o znalecký posudok; pri zmluve s viacerými položkami €/m² nepočítame. Export neobsahuje mená.
          </Disclaimer>
        </>
      ) : null}
    </div>
  );
}

function Th({ label, id, sort, dir, onSort, right }: { label: string; id: SortId; sort: SortId; dir: "asc" | "desc"; onSort: (s: SortId) => void; right?: boolean }) {
  const on = sort === id;
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : ""}`}>
      <button type="button" onClick={() => onSort(id)} className={`inline-flex items-center gap-1 hover:text-fg ${on ? "text-fg" : ""}`} aria-sort={on ? (dir === "desc" ? "descending" : "ascending") : "none"}>
        {label}{on ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

// ——— Graf: medián po rokoch — €/m² pozemkov, €/m² bytov alebo cena zmluvy (prepínač), s počtom zmlúv ———
type Metric = "land" | "flat" | "cen";
const METRIC_LABEL: Record<Metric, string> = { land: "€/m² pozemky", flat: "€/m² byty", cen: "cena zmluvy" };
function YearChart({ rows }: { rows: ContractPriceSearch["byYear"] }) {
  const has = { land: rows.some((r) => r.medLand != null), flat: rows.some((r) => r.medFlat != null), cen: rows.some((r) => r.medCen != null) };
  const avail = (["land", "flat", "cen"] as Metric[]).filter((m) => has[m]);
  const [pick, setPick] = useState<Metric | null>(null);
  const metric: Metric = pick && has[pick] ? pick : avail[0] ?? "cen";
  const vals = rows.map((r) => (metric === "land" ? r.medLand : metric === "flat" ? r.medFlat : r.medCen));
  const max = Math.max(1, ...vals.map((v) => v ?? 0));
  if (!rows.length) return <p className="text-sm text-muted">Bez zmlúv.</p>;
  const usePpm = metric !== "cen";
  const W = 420, H = 220, pad = 28, bw = (W - pad * 2) / rows.length;
  return (
    <div>
      {avail.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {avail.map((m) => <button type="button" key={m} onClick={() => setPick(m)} className={`rounded-full border px-2.5 py-0.5 text-xs ${m === metric ? "border-brand bg-brand/10 text-fg" : "border-line text-muted hover:text-fg"}`}>{METRIC_LABEL[m]}</button>)}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Medián podľa rokov">
        {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1={pad} x2={W - pad} y1={H - pad - t * (H - pad * 2)} y2={H - pad - t * (H - pad * 2)} stroke="currentColor" strokeOpacity="0.08" />)}
        {rows.map((r, i) => {
          const v = vals[i]; const h = v == null ? 0 : (v / max) * (H - pad * 2);
          const x = pad + i * bw + bw * 0.15, w = bw * 0.7;
          return (
            <g key={r.y}>
              {v == null ? <rect x={x} y={H - pad - 4} width={w} height={4} fill="currentColor" fillOpacity="0.12" /> : <rect x={x} y={H - pad - h} width={w} height={h} rx="2" fill="#5b7a58" />}
              <text x={x + w / 2} y={H - pad + 14} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">{r.y}</text>
              {v != null ? <text x={x + w / 2} y={H - pad - h - 4} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.8">{Math.round(v).toLocaleString("sk-SK")}</text> : null}
              <title>{`${r.y}: ${r.n} zmlúv · medián ${metric === "land" ? ppm(r.medLand) : metric === "flat" ? ppm(r.medFlat) : eur(r.medCen)}`}</title>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted">{usePpm ? `Medián ${METRIC_LABEL[metric]} z čistých zmlúv` : "Medián ceny zmluvy"} po rokoch; rok s menej ako 3 zmluvami bez stĺpca. Najazdením na stĺpec uvidíte počet zmlúv.</p>
    </div>
  );
}

// ——— Mapa: ortofoto ZBGIS ako podklad + body zmlúv zafarbené podľa €/m² (ak chýba, podľa ceny) ———
const MW = 900, MH = 560, R = 6378137;
const merc = (lon: number, lat: number) => ({ x: (lon * Math.PI / 180) * R, y: Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R });
const PAL = ["#2f6f8f", "#5b9a8b", "#c9b458", "#d9853b", "#b5442f"];
function PriceMap({ points }: { points: ContractPricePoint[] }) {
  const navigate = useNavigate();
  const geo = useMemo(() => {
    if (!points.length) return null;
    const ps = points.map((p) => ({ ...p, m: merc(p.lon, p.lat) }));
    let x0 = Math.min(...ps.map((p) => p.m.x)), x1 = Math.max(...ps.map((p) => p.m.x));
    let y0 = Math.min(...ps.map((p) => p.m.y)), y1 = Math.max(...ps.map((p) => p.m.y));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max((x1 - x0) * 1.12, 600), h = Math.max((y1 - y0) * 1.12, 380);
    if (w / h > MW / MH) h = (w * MH) / MW; else w = (h * MW) / MH;
    x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
    // farba podľa €/m² len keď sú všetky body s €/m² jedného druhu (pozemky ALEBO byty), inak podľa ceny
    const ppKinds = new Set(ps.filter((p) => p.ppm2 != null).map((p) => p.kind));
    const usePpm = ppKinds.size === 1 && ps.filter((p) => p.ppm2 != null).length >= ps.length / 2;
    const vals = ps.map((p) => (usePpm ? p.ppm2 : p.cen)).filter((v): v is number => v != null).sort((a, b) => a - b);
    const scale = new Set(vals).size >= 5;   // pri pár zmluvách nemá päťstupňová škála zmysel
    const q = [0.2, 0.4, 0.6, 0.8].map((t) => vals[Math.min(vals.length - 1, Math.floor(t * vals.length))] ?? 0);
    const cls = (v: number | null) => (v == null ? -1 : !scale ? 2 : q.findIndex((b) => v <= b) === -1 ? 4 : q.findIndex((b) => v <= b));
    const bbox = `${x0},${y0},${x1},${y1}`;
    const orto = `https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get?${new URLSearchParams({ service: "WMS", version: "1.3.0", request: "GetMap", layers: "1", styles: "", crs: "EPSG:3857", format: "image/jpeg", width: String(MW), height: String(MH), bbox })}`;
    const dots = ps.map((p) => ({ p, x: ((p.m.x - x0) / w) * MW, y: ((y1 - p.m.y) / h) * MH, c: cls(usePpm ? p.ppm2 : p.cen) }));
    return { orto, dots, usePpm, q, scale };
  }, [points]);
  if (!geo) return <p className="text-sm text-muted">Žiadne zmluvy s polohou.</p>;
  const fmt = (v: number) => (geo.usePpm ? ppm(v) : eur(v));
  return (
    <figure>
      <div className="relative w-full overflow-hidden rounded border border-line bg-surface-2" style={{ aspectRatio: `${MW} / ${MH}` }}>
        <img src={geo.orto} alt="" className="absolute inset-0 h-full w-full" style={{ opacity: 0.75 }} />
        <svg viewBox={`0 0 ${MW} ${MH}`} className="absolute inset-0 h-full w-full">
          {geo.dots.map(({ p, x, y, c }, i) => (
            <circle key={i} cx={x} cy={y} r={points.length > 1500 ? 3.2 : 4.5} fill={c < 0 ? "#888" : PAL[c]} fillOpacity={p.flag ? 0.45 : 0.9} stroke="#fff" strokeWidth="0.8" className="cursor-pointer"
              onClick={() => navigate({ to: "/vypis/$datasetId/$lvNo", params: { datasetId: p.ds, lvNo: String(p.lv) }, search: { typ: "vypis" as const } })}>
              <title>{`${dateSk(p.cas)} · ${KIND_LABEL[p.kind] ?? p.kind} · ${eur(p.cen)}${p.ppm2 != null ? ` · ${ppm(p.ppm2)}` : ""} · LV ${p.lv}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {geo.scale ? <span>{geo.usePpm ? "€/m²:" : "Cena:"}</span> : null}
        {geo.scale && PAL.map((col, i) => (
          <span key={col} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: col }} />
            {i === 0 ? `do ${fmt(geo.q[0])}` : i === 4 ? `nad ${fmt(geo.q[3])}` : `${fmt(geo.q[i - 1])} – ${fmt(geo.q[i])}`}
          </span>
        ))}
        <span>· klik na bod otvorí LV · podklad © ÚGKK SR — ZBGIS ortofoto{points.length >= 4000 ? " · zobrazených 4 000 najnovších zmlúv" : ""}</span>
      </figcaption>
    </figure>
  );
}
