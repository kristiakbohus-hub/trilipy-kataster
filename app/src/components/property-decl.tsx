// ÚDAJE OD PREDÁVAJÚCEHO (2026-11-13) — formulár (interná appka) a zobrazenie v liste. Podľa zahraničnej praxe
// (UK TA6 / Material Information, škótsky Property Questionnaire, nemecké Exposé s energetickými údajmi) — prispôsobené SR:
// energetický certifikát (zákon 555/2005 — trieda povinne v inzeráte), povolenia a kolaudácia, rekonštrukcie, známe vady,
// spory, príslušenstvo, byt (správca, fond opráv, zálohy), pozemok (nájom poľnohospodárovi, prípojky). Bez osobných údajov.
import { useState } from "react";
import { saveDeclaration } from "../lib/api/kataster.functions";
import type { SheetData } from "../lib/property-eval";
import { Grid, Muted, Sub } from "./ps-ui";

type F = [key: string, label: string, kind: "text" | "long" | "num" | "sel", opts?: string[]];
const COMMON: F[] = [
  ["dovod_predaja", "Dôvod predaja", "text"], ["uvolnenie", "Kedy sa dá nehnuteľnosť odovzdať / uvoľniť", "text"],
  ["spory", "Spory, nároky tretích osôb, nedoplatky (áno/nie, čo)", "long"], ["poznamka", "Iné, čo má kupujúci vedieť", "long"],
];
const BUILDING: F[] = [
  ["ec_trieda", "Energetický certifikát — trieda", "sel", ["", "A0", "A1", "B", "C", "D", "E", "F", "G", "nemá certifikát"]],
  ["ec_typ", "Certifikát — typ (budova / byt)", "text"], ["ec_potreba_kwh", "Globálny ukazovateľ / potreba energie (kWh/m²·rok)", "num"],
  ["ec_platnost", "Certifikát platný do (rok)", "num"], ["ec_vynimka", "Výnimka z certifikátu (dôvod)", "text"],
  ["sp_rok", "Stavebné povolenie — rok", "num"], ["kol_rok", "Kolaudácia — rok", "num"], ["povolenia", "Prístavby, zmeny stavby — povolené? (čo a kedy)", "long"],
  ["rekonstrukcie", "Rekonštrukcie (rok — čo: strecha, okná, rozvody, zateplenie…)", "long"], ["vady", "Známe vady (vlhkosť, praskliny, zatekanie, statika…)", "long"],
  ["kurenie", "Kúrenie a zdroj tepla", "text"], ["energie", "Náklady na energie ročne (podľa faktúr)", "text"], ["internet", "Internet / pripojenie", "text"],
  ["prislusenstvo", "Čo zostáva v cene (kuchyňa, spotrebiče, nábytok, garáž…)", "long"],
];
const FLAT: F[] = [["byt_spravca", "Správca / spoločenstvo (názov firmy)", "text"], ["byt_fond_mes", "Fond opráv (€ mesačne)", "num"], ["byt_zalohy_mes", "Zálohy spolu (€ mesačne)", "num"],
  ["byt_opravy", "Plánované opravy domu a schválené úvery", "long"], ["byt_dlhy", "Nedoplatky bytu voči správcovi", "text"]];
const LAND: F[] = [["poz_najom_do", "Nájom poľnohospodárovi do (dátum / výpovedná lehota)", "text"], ["poz_najomca_typ", "Nájomca (typ: družstvo, firma, SHR — bez mien osôb)", "text"],
  ["poz_pripojky", "Prípojky na pozemku (elektrina, voda, kanalizácia, plyn)", "text"], ["poz_oplotenie", "Oplotenie", "text"], ["poz_studna", "Studňa / vrt", "text"]];

export function declFields(d: SheetData): F[] {
  const k = d.core.kind; const isFlat = k === "byt" || Object.keys(d.core.facts.byty ?? {}).some((x) => x.startsWith("flat:"));
  const hasBuilding = d.core.buildings.length > 0 || isFlat;
  return [...(hasBuilding ? BUILDING : []), ...(isFlat ? FLAT : []), ...(!hasBuilding || d.core.parcels.some((p) => /orn|trval|záhrad|zahrad/i.test(p.use_type ?? "")) ? LAND : []), ...COMMON];
}

export function DeclarationForm({ d, token, onSaved }: { d: SheetData; token: string; onSaved: (decl: Record<string, string | number | boolean | null>) => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d.decl ?? {}).map(([k, x]) => [k, x == null ? "" : String(x)])));
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(!d.decl);
  const c = d.core; const isFlat = c.kind === "byt";
  const st = isFlat ? "flat" : "lv"; const sr = isFlat ? c.main.flat ?? "" : String(c.main.lvNo ?? c.lvs[0] ?? "");
  async function save() {
    const decl: Record<string, string | number | null> = {};
    for (const [k, , kind] of declFields(d)) { const x = (v[k] ?? "").trim(); decl[k] = x === "" ? null : kind === "num" && !Number.isNaN(Number(x.replace(",", "."))) ? Number(x.replace(",", ".")) : x; }
    const r = await saveDeclaration({ data: { token, datasetId: c.dataset?.id ?? "", subjectType: st, subjectRef: sr, decl } });
    setMsg(r.ok ? "Uložené." : r.message ?? "Nepodarilo sa uložiť.");
    if (r.ok) onSaved(Object.fromEntries(Object.entries(decl).filter(([, x]) => x != null)));
  }
  const inp = "w-full rounded border border-line bg-surface px-2 py-1 text-xs";
  return (
    <div className="no-print space-y-2 rounded-md border border-dashed border-line p-2.5 text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-brand underline">{open ? "Skryť formulár údajov od predávajúceho" : "Doplniť / upraviť údaje od predávajúceho"}</button>
      {open ? (<>
        <div className="grid gap-2 sm:grid-cols-2">{declFields(d).map(([k, label, kind, opts]) => (
          <label key={k} className={`text-muted ${kind === "long" ? "sm:col-span-2" : ""}`}>{label}
            {kind === "sel" ? <select className={inp} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })}>{(opts ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select>
              : kind === "long" ? <textarea className={inp} rows={2} maxLength={1500} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              : <input className={inp} value={v[k] ?? ""} inputMode={kind === "num" ? "decimal" : undefined} maxLength={200} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
          </label>
        ))}</div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => void save()} className="rounded-md bg-ink px-3 py-1 font-medium text-cream">Uložiť</button><span className="text-muted">Neuvádzajte mená ani kontakty osôb. {msg}</span></div>
      </>) : null}
    </div>
  );
}

export function DeclarationBlock({ d }: { d: SheetData }) {
  const x = d.decl; if (!x || !Object.keys(x).length) return <Muted>Údaje od predávajúceho (energetický certifikát, povolenia, rekonštrukcie, vady, príslušenstvo) zatiaľ nie sú doplnené.</Muted>;
  const rows = declFields(d).filter(([k]) => x[k] != null && x[k] !== "").map(([k, label]) => [label, String(x[k])] as [string, string]);
  return (
    <>
      <Sub>Podľa vyhlásenia predávajúceho</Sub>
      <Grid rows={rows} />
      <Muted>Údaje uviedol predávajúci; maklér ich neoveroval technickou ani právnou previerkou. Energetický certifikát, povolenia a kolaudačné rozhodnutie si vyžiadajte v kópii.</Muted>
    </>
  );
}
