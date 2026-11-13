// Zdieľanie klientskej verzie listu nehnuteľnosti (odkaz bez prihlásenia, dá sa zrušiť, počíta otvorenia).
// 2026-11-13: údaje makléra, poznámka pre klienta, výber kapitol, platnosť, kontrola obsahu pred odoslaním
// (chýbajúce kľúčové údaje = upozornenie; zakázaná formulácia v poznámke = blokuje, phrases.ts).
import { useEffect, useMemo, useState } from "react";
import { createPropertyShare, listPropertyShares, revokePropertyShare } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { zoneOf, type SheetData } from "../lib/property-eval";
import { phraseIssues } from "../lib/phrases";
import { loadPhotos } from "../lib/photos";

const CHAPTERS: [string, string][] = [["udaje", "Od predávajúceho"], ["povolenia", "Povolenia"], ["rozhodnutie", "Rozhodnutie (pre kupujúceho)"], ["vlastnictvo", "Vlastníctvo"], ["pravo", "Právny stav"], ["historia", "Časová os"], ["limity", "Limity a riziká"], ["teren", "Terén a slnko"], ["klima", "Klíma a normy"],
  ["siete", "Siete"], ["doprava", "Doprava"], ["hodnota", "Hodnota"], ["predikcia", "Predikcia"], ["trh", "Trh"], ["financovanie", "Hypotéka"], ["naklady", "Náklady a dane"],
  ["poistenie", "Poistenie"], ["investicia", "Výnos a vyjednávanie"], ["obec", "Obec"], ["postup", "Postup kúpy"]];
type Broker = { name?: string; firma?: string; phone?: string; email?: string };
const loadBroker = (): Broker => { try { return JSON.parse(localStorage.getItem("tl-broker") ?? "{}") as Broker; } catch { return {}; } };

/** Kontrola obsahu pred zdieľaním: čo chýba alebo je staré (upozornenie) a zakázané formulácie (blokuje). */
export function shareChecks(sheet: SheetData, notes: string): { warn: string[]; block: string[] } {
  const c = sheet.core; const warn: string[] = [];
  if (!c.compStats?.estimateEur && !sheet.avm?.estimate_eur && !c.listings.some((l) => l.price_eur)) warn.push("chýba odhad hodnoty aj cena — kapitoly financií budú prázdne");
  if (!zoneOf(sheet).name) warn.push("chýba zóna územného plánu");
  const age = c.dataset?.updated_at ? (Date.now() - Date.parse(c.dataset.updated_at)) / 864e5 : null;
  if (age != null && age > 180) warn.push(`údaje katastra sú staré ${Math.round(age)} dní — zvážte nový import`);
  if (!sheet.fin) warn.push("trhové sadzby sa nenačítali — hypotéka použije predvolenú sadzbu");
  if (!sheet.ext) warn.push("úradné registre (geológia, voda, príroda) sa ešte nenačítali");
  if (c.legal.some((l) => !l.hasData)) warn.push("časť B/C niektorého LV nemáme");
  if ((c.buildings.length || c.kind === "byt") && !sheet.decl?.ec_trieda) warn.push("chýba trieda energetického certifikátu — certifikát musí byť ku dňu zmluvy a ukazovateľ v zverejnenej ponuke (555/2005 § 8; pokuta 500–3 000 €)");
  if ((sheet.photos?.length ?? 0) < 4) warn.push("menej ako 4 fotky — kvalitné fotografie (ideálne 20+ v online galérii) zvyšujú šancu predaja");
  const block = phraseIssues([notes]).map((i) => `poznámka: „${i.sample}“ — ${i.claim} (použite: ${i.use})`);
  return { warn, block };
}

export function PropertyShareBox({ sheet, ready }: { sheet: SheetData; ready: boolean }) {
  const { token } = useAuth();
  const c = sheet.core;
  const kind = c.kind; const ref = kind === "byt" ? c.main.flat ?? "" : kind === "stavba" ? c.main.sc ?? "" : kind === "lv" ? String(c.main.lvNo ?? "") : `${c.main.register === "E" ? "E:" : ""}${c.main.parcelNo ?? ""}`;
  const ds = c.dataset?.id ?? "";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPropertyShares>>["rows"]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [broker, setBroker] = useState<Broker>({});
  const [hide, setHide] = useState<string[]>(["rozhodnutie"]);   // verdikt kúpiť/nekúpiť je pre kupujúceho — pri predajnom dokumente predvolene vynechaný
  const [days, setDays] = useState(30);
  const [withPhotos, setWithPhotos] = useState(true);
  const [lang, setLang] = useState<"sk" | "en">("sk");
  useEffect(() => { setBroker(loadBroker()); }, []);
  const load = () => { if (token && ds) listPropertyShares({ data: { token, datasetId: ds, kind, ref } }).then((r) => setRows(r.rows)).catch(() => {}); };
  useEffect(load, [token, ds, kind, ref]);
  const checks = useMemo(() => shareChecks(sheet, notes), [sheet, notes]);
  async function make() {
    if (!token || checks.block.length) return;
    setBusy(true);
    try { localStorage.setItem("tl-broker", JSON.stringify(broker)); } catch { /* bez úložiska */ }
    try {
      const photos = withPhotos ? (sheet.photos?.length ? sheet.photos : await loadPhotos(ds, c.main.lvNo ?? c.lvs[0] ?? null)) : [];
      const snap: SheetData = { ...sheet, client: client.trim() || sheet.client || null, notes: notes.trim() || null, broker, hide, photos, lang };
      const r = await createPropertyShare({ data: { token, datasetId: ds, kind, ref, title: c.title, snapshot: JSON.stringify(snap), days } });
      if (r.ok && r.path) {
        const url = `${window.location.origin}${r.path}`;
        try { await navigator.clipboard.writeText(url); setMsg(`Odkaz skopírovaný: ${url} (teaser: ${url}?teaser=1)`); } catch { setMsg(`Odkaz: ${url}`); }
        load();
      } else setMsg(r.message ?? "Odkaz sa nepodarilo vytvoriť.");
    } finally { setBusy(false); }
  }
  const live = rows.filter((x) => !x.revoked);
  const inp = "w-full rounded border border-line bg-surface px-2 py-1";
  return (
    <div className="rounded-lg border border-line bg-paper p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted">Klientska verzia — bez mien vlastníkov a internej práce; odkaz bez prihlásenia, trhové sadzby sa pri otvorení obnovia.</span>
        <span className="flex gap-2">
          <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-line px-3 py-1 text-fg hover:border-ink">{open ? "Skryť možnosti" : "Možnosti"}</button>
          <button onClick={() => void make()} disabled={!ready || busy || checks.block.length > 0} className="rounded-md border border-line px-3 py-1 text-fg hover:border-ink disabled:opacity-40">{busy ? "Vytváram…" : "Vytvoriť a skopírovať odkaz"}</button>
        </span>
      </div>
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-muted">Pre klienta<input className={inp} value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} placeholder="meno alebo firma klienta" /></label>
          <label className="text-muted">Jazyk<select className={inp} value={lang} onChange={(e) => setLang(e.target.value === "en" ? "en" : "sk")}><option value="sk">slovenčina</option><option value="en">angličtina (titulka, zhrnutie, kapitoly, vysvetlenia)</option></select></label>
          <label className="text-muted">Platnosť odkazu (dni)<select className={inp} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30, 60].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          <label className="text-muted">Maklér — meno<input className={inp} value={broker.name ?? ""} maxLength={80} onChange={(e) => setBroker({ ...broker, name: e.target.value })} /></label>
          <label className="text-muted">Firma<input className={inp} value={broker.firma ?? ""} maxLength={80} onChange={(e) => setBroker({ ...broker, firma: e.target.value })} /></label>
          <label className="text-muted">Telefón<input className={inp} value={broker.phone ?? ""} maxLength={40} onChange={(e) => setBroker({ ...broker, phone: e.target.value })} /></label>
          <label className="text-muted">E-mail<input className={inp} value={broker.email ?? ""} maxLength={80} onChange={(e) => setBroker({ ...broker, email: e.target.value })} /></label>
          <label className="text-muted sm:col-span-2">Poznámka pre klienta (zobrazí sa na začiatku listu)<textarea className={inp} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="flex items-center gap-1 text-muted sm:col-span-2"><input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />Pridať fotky z obhliadky (online až 12, v PDF 4; zmenšené)</label>
          <fieldset className="sm:col-span-2"><legend className="text-muted">Kapitoly v klientskej verzii (odškrtnuté sa vynechajú)</legend>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{CHAPTERS.map(([id, l]) => (
              <label key={id} className="flex items-center gap-1"><input type="checkbox" checked={!hide.includes(id)} onChange={(e) => setHide((h) => (e.target.checked ? h.filter((x) => x !== id) : [...h, id]))} />{l}</label>
            ))}</div>
          </fieldset>
        </div>
      ) : null}
      {checks.warn.length || checks.block.length ? (
        <ul className="mt-2 space-y-0.5">
          {checks.block.map((t) => <li key={t} style={{ color: "#9c4a40" }}>✕ {t}</li>)}
          {checks.warn.map((t) => <li key={t} className="text-muted">! {t}</li>)}
        </ul>
      ) : <p className="mt-1 text-muted">Kontrola obsahu: bez nálezu.</p>}
      {msg ? <p className="mt-1 break-all text-green">{msg}</p> : null}
      {live.length ? (
        <ul className="mt-1 divide-y divide-line/60">{live.map((x) => (
          <li key={x.token} className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="break-all text-muted">/n/{x.token.slice(0, 8)}… · platí do {x.expiresAt.slice(0, 10).split("-").reverse().join(". ")} · otvorené {x.views}×</span>
            <button onClick={() => { if (token) void revokePropertyShare({ data: { token, share: x.token } }).then(load); }} className="text-muted hover:text-fg">Zrušiť</button>
          </li>
        ))}</ul>
      ) : null}
    </div>
  );
}
