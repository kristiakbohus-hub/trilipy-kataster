import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import {
  listBuyerRequests, saveBuyerRequest, setBuyerRequestStatus, deleteBuyerRequest, matchBuyerRequest,
  type BuyerRequest, type BuyerLandMatch, type BuyerListingMatch,
} from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";

// KUPUJÚCI — evidencia dopytu a automatické párovanie (plán vlastníka 2026-11-10). BEZ `loader`
// (pamäť cf_app_ssr_loader_leak) — dáta až po prihlásení v useEffect.
export const Route = createFileRoute("/kupci")({
  head: () => ({ meta: [{ title: "Kupci a dopyt — TRI LIPY KATASTER CORE" }] }),
  component: KupciPage,
});

const KIND: Record<string, string> = { osoba: "Osoba", firma: "Firma", developer: "Developer", stavebna_firma: "Stavebná firma", investor: "Investor" };
const PTYPE: Record<string, string> = { pozemok: "Pozemok", byt: "Byt", dom: "Dom", chata: "Chata / chalupa", komercne: "Komerčný priestor" };
const PURPOSE: Record<string, string> = { residential: "bývanie", retail: "retail / obchod", industrial: "priemysel / sklad", rekreacia: "rekreácia" };
const STATUS: Record<string, string> = { aktivny: "Aktívny", pozastaveny: "Pozastavený", uzavrety: "Uzavretý" };
const eur = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} €`);
const m2 = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);
const range = (a: number | null, b: number | null) => (a == null && b == null ? "—" : `${a == null ? "" : Math.round(a).toLocaleString("sk-SK")}–${b == null ? "" : Math.round(b).toLocaleString("sk-SK")} m²`);

type Form = { id?: number; kind: string; name: string; ico: string; contact: string; ptype: string; purpose: string; areaMin: string; areaMax: string; budgetMax: string; locations: string; timeframe: string; note: string };
const EMPTY: Form = { kind: "osoba", name: "", ico: "", contact: "", ptype: "pozemok", purpose: "", areaMin: "", areaMax: "", budgetMax: "", locations: "", timeframe: "", note: "" };
const numOrU = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return s.trim() === "" || !Number.isFinite(n) ? undefined : n; };

function KupciPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<BuyerRequest[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [matches, setMatches] = useState<{ land: BuyerLandMatch[]; listings: BuyerListingMatch[] } | null>(null);
  const [filter, setFilter] = useState<"aktivny" | "vsetky">("aktivny");

  const load = useCallback(() => {
    if (!token) return;
    listBuyerRequests({ data: { token } }).then((r) => { setRows(r.rows); setCanEdit(r.canEdit); }).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (!token) return <div className="p-4 text-sm text-muted">Prihlás sa.</div>;

  const set = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  async function save() {
    if (!form || !token) return;
    if (form.name.trim().length < 2) { setMsg("Zadaj meno alebo názov záujemcu."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await saveBuyerRequest({ data: {
        token, id: form.id, kind: form.kind as never, name: form.name, ico: form.ico || undefined,
        contact: form.contact || undefined, ptype: form.ptype as never, purpose: (form.ptype === "pozemok" && form.purpose ? form.purpose : undefined) as never,
        areaMin: numOrU(form.areaMin), areaMax: numOrU(form.areaMax), budgetMax: numOrU(form.budgetMax),
        locations: form.locations || undefined, timeframe: form.timeframe || undefined, note: form.note || undefined,
      } });
      if (!r.ok) { setMsg(r.message ?? "Uloženie zlyhalo."); return; }
      setMsg(form.id ? "Dopyt upravený." : "Dopyt zaevidovaný."); setForm(null); load();
      if (r.id) void showMatches(r.id);
    } finally { setBusy(false); }
  }
  async function showMatches(id: number) {
    if (!token) return;
    if (open === id) { setOpen(null); setMatches(null); return; }
    setOpen(id); setMatches(null);
    const r = await matchBuyerRequest({ data: { token, id } });
    setMatches({ land: r.land, listings: r.listings });
  }
  async function status(id: number, st: string) {
    if (!token) return;
    await setBuyerRequestStatus({ data: { token, id, status: st as never } }); load();
  }
  async function remove(r: BuyerRequest) {
    if (!token || !window.confirm(`Zmazať dopyt „${r.name}"? Nedá sa to vrátiť.`)) return;
    await deleteBuyerRequest({ data: { token, id: r.id } }); load();
  }
  const edit = (r: BuyerRequest) => setForm({
    id: r.id, kind: r.kind, name: r.name, ico: r.ico ?? "", contact: r.contact === "—" ? "" : (r.contact ?? ""), ptype: r.ptype, purpose: r.purpose ?? "",
    areaMin: r.area_min?.toString() ?? "", areaMax: r.area_max?.toString() ?? "", budgetMax: r.budget_max?.toString() ?? "",
    locations: r.locations ?? "", timeframe: r.timeframe ?? "", note: r.note ?? "",
  });

  const shown = rows.filter((r) => filter === "vsetky" || r.status === "aktivny");
  const inp = "mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-fg";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Kupci a dopyt</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Kto chce čo kúpiť — osoby, firmy, developeri, stavebné firmy, investori. Ku každému dopytu appka sama
          nájde pozemkové príležitosti a aktuálne inzeráty. Pri každom pozemku (dossier parcely) zase ukáže
          zhodný dopyt, susedov a ďalších možných kupcov.
        </p>
      </div>

      {canEdit ? (
        form ? (
          <Card className="space-y-3 p-4">
            <SectionHeader title={form.id ? `Upraviť dopyt #${form.id}` : "Nový dopyt"} hint="kontakt zadaj ručne — appka kontakty osôb nedohľadáva" />
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-muted">Kto<select value={form.kind} onChange={(e) => set("kind", e.target.value)} className={inp}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="text-xs text-muted sm:col-span-2">Meno / názov<input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></label>
              <label className="text-xs text-muted">IČO (firma)<input value={form.ico} onChange={(e) => set("ico", e.target.value)} className={inp} /></label>
              <label className="text-xs text-muted sm:col-span-2">Kontakt<input value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="telefón / email / poznámka, ako ho zastihnúť" className={inp} /></label>
              <label className="text-xs text-muted">Čo hľadá<select value={form.ptype} onChange={(e) => set("ptype", e.target.value)} className={inp}>{Object.entries(PTYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {form.ptype === "pozemok" ? (
                <label className="text-xs text-muted">Na čo<select value={form.purpose} onChange={(e) => set("purpose", e.target.value)} className={inp}><option value="">neurčené</option>{Object.entries(PURPOSE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              ) : <span />}
              <label className="text-xs text-muted">Rozpočet do (€)<input value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} inputMode="numeric" className={inp} /></label>
              <label className="text-xs text-muted">Výmera od (m²)<input value={form.areaMin} onChange={(e) => set("areaMin", e.target.value)} inputMode="numeric" className={inp} /></label>
              <label className="text-xs text-muted">Výmera do (m²)<input value={form.areaMax} onChange={(e) => set("areaMax", e.target.value)} inputMode="numeric" className={inp} /></label>
              <label className="text-xs text-muted">Kedy<input value={form.timeframe} onChange={(e) => set("timeframe", e.target.value)} placeholder="napr. do 6 mesiacov" className={inp} /></label>
              <label className="text-xs text-muted sm:col-span-3">Kde (k.ú., obec alebo okres, oddelené čiarkou; prázdne = kdekoľvek)<input value={form.locations} onChange={(e) => set("locations", e.target.value)} placeholder="napr. Žilina, Budatín, okres Čadca" className={inp} /></label>
              <label className="text-xs text-muted sm:col-span-3">Poznámka<textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} className={inp} /></label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void save()} disabled={busy} className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-cream disabled:opacity-50">{busy ? "…" : "Uložiť a nájsť zhody"}</button>
              <button onClick={() => { setForm(null); setMsg(null); }} className="text-sm text-muted hover:text-fg">Zrušiť</button>
              {msg ? <span className="text-xs text-muted">{msg}</span> : null}
            </div>
          </Card>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => { setForm({ ...EMPTY }); setMsg(null); }} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream">+ Nový dopyt</button>
            {msg ? <span className="text-xs text-muted">{msg}</span> : null}
          </div>
        )
      ) : <p className="text-xs text-muted">Rola viewer vidí evidenciu, ale nemôže ju meniť.</p>}

      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionHeader title={`Dopyt (${shown.length})`} hint="klikni na Zhody — pozemky a inzeráty, ktoré mu zodpovedajú" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg">
            <option value="aktivny">len aktívne</option><option value="vsetky">všetky</option>
          </select>
        </div>
        {shown.length === 0 ? <p className="mt-2 text-sm text-muted">Zatiaľ žiadny dopyt. Pridaj prvého záujemcu tlačidlom vyššie.</p> : (
          <div className="mt-2 divide-y divide-line">
            {shown.map((r) => (
              <div key={r.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-fg">{r.name}</span>
                    <span className="ml-2 text-xs text-muted">{KIND[r.kind] ?? r.kind}{r.ico ? ` · IČO ${r.ico}` : ""}{r.contact ? ` · ${r.contact}` : ""}</span>
                    <div className="text-xs text-muted">
                      {PTYPE[r.ptype] ?? r.ptype}{r.purpose ? ` · ${PURPOSE[r.purpose] ?? r.purpose}` : ""} · {range(r.area_min, r.area_max)} · do {eur(r.budget_max)}
                      {r.locations ? ` · ${r.locations}` : " · kdekoľvek"}{r.timeframe ? ` · ${r.timeframe}` : ""}
                    </div>
                    {r.note ? <div className="mt-0.5 text-xs text-muted">{r.note}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => void showMatches(r.id)} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink">{open === r.id ? "Skryť zhody" : "Zhody"}</button>
                    {canEdit ? <>
                      <select value={r.status} onChange={(e) => void status(r.id, e.target.value)} className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-fg">
                        {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <button onClick={() => edit(r)} className="text-xs text-muted hover:text-fg">Upraviť</button>
                      <button onClick={() => void remove(r)} className="text-xs text-muted hover:text-fg">Zmazať</button>
                    </> : <span className="text-xs text-muted">{STATUS[r.status] ?? r.status}</span>}
                  </div>
                </div>
                {open === r.id ? <Matches m={matches} ptype={r.ptype} /> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Matches({ m, ptype }: { m: { land: BuyerLandMatch[]; listings: BuyerListingMatch[] } | null; ptype: string }) {
  if (!m) return <p className="mt-2 text-xs text-muted">Hľadám zhody…</p>;
  return (
    <div className="mt-2 grid gap-3 rounded-md border border-line p-2 md:grid-cols-2">
      <div>
        <div className="text-xs font-medium text-fg">Naše pozemkové príležitosti ({m.land.length})</div>
        {ptype !== "pozemok" ? <p className="text-xs text-muted">Pozemkové príležitosti sa párujú len pri dopyte na pozemok.</p>
          : m.land.length === 0 ? <p className="text-xs text-muted">Žiadna príležitosť v zadanej lokalite a výmere.</p> : (
          <ul className="mt-1 space-y-1 text-xs">
            {m.land.map((x, i) => {
              const first = (x.parcels ?? "").split(",")[0].trim();
              return (
                <li key={i} className="flex justify-between gap-2 border-b border-line/40 pb-1">
                  <span>
                    <b className={x.verdict === "MATCH" ? "text-green" : "text-muted"}>{x.verdict === "MATCH" ? "zhoda" : "podmienené"}</b>{" "}
                    {x.kuName ?? x.kodKu} · {m2(x.areaM2)} · {PURPOSE[x.purpose ?? ""] ?? x.purpose ?? ""}{x.zone ? ` · ${x.zone}` : ""}
                    <span className="block text-muted">parcely {x.parcels}</span>
                  </span>
                  {x.datasetId && first ? <Link to="/report/$datasetId/$parcelNo" params={{ datasetId: x.datasetId, parcelNo: first }} className="shrink-0 text-brand hover:underline">dossier →</Link> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-fg">Aktuálne inzeráty na trhu ({m.listings.length})</div>
        {m.listings.length === 0 ? <p className="text-xs text-muted">Žiadny aktuálny inzerát v zadanej lokalite, výmere a rozpočte.</p> : (
          <ul className="mt-1 space-y-1 text-xs">
            {m.listings.map((x, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-line/40 pb-1">
                <span className="min-w-0">{x.title ?? "inzerát"}<span className="block text-muted">{x.obec ?? x.okres ?? ""} · {m2(x.areaM2)} · {eur(x.priceEur)}{x.ppm2 ? ` (${Math.round(x.ppm2)} €/m²)` : ""}</span></span>
                {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-brand hover:underline">inzerát ↗</a> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-muted">Inzeráty majú len približnú polohu (obec/okres), nie konkrétnu parcelu. Cena je ponuková, nie predajná.</p>
      </div>
    </div>
  );
}
