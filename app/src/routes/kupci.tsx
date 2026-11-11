import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import {
  listBuyerRequests, saveBuyerRequest, setBuyerRequestStatus, deleteBuyerRequest, matchBuyerRequestFull,
  type BuyerRequest, type BuyerHit, type BuyerHitSrc, type BuyerMatchStats,
} from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { MatchStatusSelect, ScorePill, MATCH_STATUS_SK } from "../components/buyer-ui";

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

type Form = { id?: number; kind: string; name: string; ico: string; contact: string; ptype: string; purpose: string; areaMin: string; areaMax: string; budgetMax: string; locations: string; timeframe: string; note: string; intravilan: boolean; cleanTitle: boolean; maxOwners: string };
const EMPTY: Form = { kind: "osoba", name: "", ico: "", contact: "", ptype: "pozemok", purpose: "", areaMin: "", areaMax: "", budgetMax: "", locations: "", timeframe: "", note: "", intravilan: false, cleanTitle: false, maxOwners: "" };
const parseMustUi = (s: string | null | undefined): { intravilan?: boolean; cleanTitle?: boolean; maxOwners?: number } => { try { return JSON.parse(s ?? "{}") ?? {}; } catch { return {}; } };
const numOrU = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return s.trim() === "" || !Number.isFinite(n) ? undefined : n; };

function KupciPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<BuyerRequest[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [matches, setMatches] = useState<{ hits: BuyerHit[]; stats: BuyerMatchStats | null; message?: string } | null>(null);
  const [filter, setFilter] = useState<"aktivny" | "vsetky">("aktivny");

  const load = useCallback(() => {
    if (!token) return;
    listBuyerRequests({ data: { token } }).then((r) => { setRows(r.rows); setCanEdit(r.canEdit); }).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (!token) return <div className="p-4 text-sm text-muted">Prihlás sa.</div>;

  const set = (k: keyof Form, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
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
        must: form.ptype === "pozemok" ? { intravilan: form.intravilan || undefined, cleanTitle: form.cleanTitle || undefined, maxOwners: numOrU(form.maxOwners) } : undefined,
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
    const r = await matchBuyerRequestFull({ data: { token, id } });
    setMatches({ hits: r.hits, stats: r.stats, message: r.ok ? undefined : r.message });
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
    intravilan: !!parseMustUi(r.must).intravilan, cleanTitle: !!parseMustUi(r.must).cleanTitle, maxOwners: parseMustUi(r.must).maxOwners?.toString() ?? "",
  });

  const shown = rows.filter((r) => filter === "vsetky" || r.status === "aktivny");
  const inp = "mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-fg";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Kupci a dopyt</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Kto chce čo kúpiť — osoby, firmy, developeri, stavebné firmy, investori. Ku každému dopytu appka prehľadá
          inzeráty, všetky parcely v zvolených k.ú., ponuky mimo trhu (dedičstvá, vlastníci bývajúci inde) a naše
          príležitosti — každú zhodu ohodnotí 0–100 s dôvodmi a tým, čo treba overiť. Vybrané zhody pošleš klientovi
          ako ponuku. Pri parcele (dossier) a inzeráte zase uvidíš, kto by to kúpil.
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
              {form.ptype === "pozemok" ? (
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg sm:col-span-3">
                  <legend className="mb-1 text-xs text-muted">Podmienky pre hľadanie v parcelách (nepovinné)</legend>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.intravilan} onChange={(e) => set("intravilan", e.target.checked)} />len v zastavanom území obce</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.cleanTitle} onChange={(e) => set("cleanTitle", e.target.checked)} />LV bez ťarchy a poznámky</label>
                  <label className="flex items-center gap-1.5">najviac<input value={form.maxOwners} onChange={(e) => set("maxOwners", e.target.value)} inputMode="numeric" className="w-14 rounded-md border border-line bg-paper px-1.5 py-0.5" />vlastníkov</label>
                </fieldset>
              ) : null}
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
                    {r.must ? <div className="mt-0.5 text-[11px] text-muted">podmienky: {[parseMustUi(r.must).intravilan ? "zastavané územie" : null, parseMustUi(r.must).cleanTitle ? "bez ťarchy" : null, parseMustUi(r.must).maxOwners ? `max. ${parseMustUi(r.must).maxOwners} vlastníkov` : null].filter(Boolean).join(", ")}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => void showMatches(r.id)} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink max-md:py-1.5">{open === r.id ? "Skryť zhody" : "Nájsť zhody"}</button>
                    <Link to="/ponuka/$id" params={{ id: String(r.id) }} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink max-md:py-1.5">Ponuka</Link>
                    {canEdit ? <>
                      <select value={r.status} onChange={(e) => void status(r.id, e.target.value)} className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-fg">
                        {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <button onClick={() => edit(r)} className="text-xs text-muted hover:text-fg">Upraviť</button>
                      <button onClick={() => void remove(r)} className="text-xs text-muted hover:text-fg">Zmazať</button>
                    </> : <span className="text-xs text-muted">{STATUS[r.status] ?? r.status}</span>}
                  </div>
                </div>
                {open === r.id ? <Matches m={matches} requestId={r.id} canEdit={canEdit} onHit={(key, st, reason) => setMatches((m) => m ? { ...m, hits: m.hits.map((h) => h.key === key ? { ...h, status: st, statusReason: reason } : h) } : m)} /> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const SRC: { id: BuyerHitSrc; label: string; hint: string }[] = [
  { id: "inzerat", label: "Inzeráty", hint: "aktuálna ponuka na trhu (posledných 21 dní)" },
  { id: "parcela", label: "Pozemky z katastra", hint: "parcely z katastra v zvolených k.ú., ktoré zodpovedajú dopytu — nie sú v predaji, vlastníka treba osloviť" },
  { id: "mimo_trhu", label: "Mimo trhu", hint: "domy, chaty a byty s čerstvým dedičstvom alebo vlastníkmi bývajúcimi inde" },
  { id: "prilezitost", label: "Naše príležitosti", hint: "overené pozemkové príležitosti a pôda s ÚP na bývanie" },
];

function Matches({ m, requestId, canEdit, onHit }: { m: { hits: BuyerHit[]; stats: BuyerMatchStats | null; message?: string } | null; requestId: number; canEdit: boolean; onHit: (key: string, st: string, reason: string | null) => void }) {
  const [tab, setTab] = useState<BuyerHitSrc | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  if (!m) return <p className="mt-2 text-xs text-muted">Hľadám zhody v inzerátoch, parcelách a príležitostiach…</p>;
  if (m.message) return <p className="mt-2 text-xs text-muted">{m.message}</p>;
  const by = (src: BuyerHitSrc) => m.hits.filter((h) => h.src === src);
  const active = tab ?? SRC.find((x) => by(x.id).length)?.id ?? "inzerat";
  const list = by(active).filter((h) => showRejected || h.status !== "odmietnuta");
  const nSel = m.hits.filter((h) => ["vybrana", "poslana", "zaujem", "obhliadka"].includes(h.status)).length;
  const st = m.stats;
  return (
    <div className="mt-2 space-y-2 rounded-md border border-line p-2">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist">
        {SRC.map((x) => (
          <button key={x.id} role="tab" aria-selected={active === x.id} onClick={() => setTab(x.id)}
            className={`rounded-full border px-2.5 py-0.5 text-xs max-md:py-1.5 ${active === x.id ? "border-ink bg-ink text-cream" : "border-line text-fg hover:border-ink"}`}>
            {x.label} <span className="tabular-nums opacity-80">{st ? st[x.id] : by(x.id).length}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />aj odmietnuté</label>
      </div>
      <p className="text-[11px] text-muted">{SRC.find((x) => x.id === active)?.hint}{st && active === "parcela" ? ` · preverených ${st.scannedParcels.toLocaleString("sk-SK")} parciel${st.kus.length ? ` v ${st.kus.join(", ")}` : ""}` : ""}</p>
      {st?.note && active === "parcela" ? <p className="text-xs text-warning">{st.note}</p> : null}
      {list.length === 0 ? <p className="text-xs text-muted">Žiadna zhoda v tejto skupine.</p> : (
        <ul className="divide-y divide-line/60">
          {list.map((h) => (
            <li key={h.key} className={`flex flex-wrap items-start gap-2 py-1.5 text-xs ${h.status === "odmietnuta" ? "opacity-60" : ""}`}>
              <ScorePill n={h.score} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-fg">{h.title}</div>
                <div className="text-muted">
                  {[h.sub, h.areaM2 ? `${Math.round(h.areaM2).toLocaleString("sk-SK")} m²` : null, h.priceEur ? `${Math.round(h.priceEur).toLocaleString("sk-SK")} €` : null,
                    h.ppm2 ? `${Math.round(h.ppm2)} €/m²` : null, h.estEur ? `odhad ~${h.estEur.toLocaleString("sk-SK")} €` : null].filter(Boolean).join(" · ")}
                </div>
                {h.reasons.length ? <div className="text-green">✓ {h.reasons.join(" · ")}</div> : null}
                {h.checks.length ? <div className="text-warning">overiť: {h.checks.join(" · ")}</div> : null}
                {h.status === "odmietnuta" && h.statusReason ? <div className="text-muted">odmietnuté: {h.statusReason}</div> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {h.url ? <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">inzerát ↗</a> : null}
                {h.datasetId && h.parcelNo ? <a href={`/mapa?ku=${encodeURIComponent(h.kodKu ?? "")}&c=${encodeURIComponent(h.parcelNo)}`} className="text-brand hover:underline">mapa</a> : null}
                {h.datasetId && h.lvNo != null ? <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: h.datasetId, lvNo: String(h.lvNo) }} search={{ typ: "vypis" as const }} className="text-brand hover:underline">LV</Link> : null}
                {h.datasetId && h.parcelNo && h.src !== "mimo_trhu" ? <Link to="/report/$datasetId/$parcelNo" params={{ datasetId: h.datasetId, parcelNo: h.parcelNo }} className="text-brand hover:underline">dossier</Link> : null}
                <MatchStatusSelect requestId={requestId} hit={h} canEdit={canEdit} onChange={(s2, r2) => onHit(h.key, s2, r2)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-1.5 text-[11px] text-muted">
        <span>Vo výbere: <b className="text-fg">{nSel}</b> ({MATCH_STATUS_SK.vybrana} / poslané / záujem)</span>
        <Link to="/ponuka/$id" params={{ id: String(requestId) }} className="rounded-md bg-ink px-2 py-0.5 font-medium text-cream max-md:py-1.5">Ponuka pre klienta →</Link>
        <span>Skóre je odvodené z dát katastra a inzercie — pomôcka na zoradenie, nie ocenenie.</span>
      </div>
    </div>
  );
}
