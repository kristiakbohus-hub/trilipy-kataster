// LIST NEHNUTEĽNOSTI — vyhodnotenie (semafor, kontrolný zoznam „čo overiť pred kúpou", úplnosť). Čisté funkcie
// nad dátami listu; rovnaké pre internú aj klientsku verziu. Zásada z kontraktu Property-360 §4: chýbajúci údaj
// je NEZNÁMY stav, nikdy „v poriadku". Formulácie prechádzajú phrase-guardom v builde.
import type { PropertyCore, LimitsResult, AvmResult } from "./api/kataster.functions";

export type ExtHit = { key: string; label: string; category: string; status: "ok" | "hit" | "none" | "error"; value: string | null; detail?: string | null; attribution: string; url?: string | null };
export type SheetData = {
  core: PropertyCore;
  limits: LimitsResult | null;
  access: { transport: Record<string, { dist: number; name?: string | null } | null>; amenities: Record<string, { dist: number; name?: string | null } | null>; infra: Record<string, { dist: number; name?: string | null } | null> } | null;
  zone: { zone_code?: string | null; name?: string | null; label?: string | null; [k: string]: unknown } | null;
  avm: AvmResult | null;
  medPoz: number | null;
  upDocs: { id: string | number; title: string | null; url: string | null; kind: string | null }[];
  ext: ExtHit[] | null;
  /** development výpočet (regulatív z ÚP alebo odvodený) — počíta stránka, v klientskej verzii uložený v snapshote */
  dev: { regName: string | null; proxy: boolean; izp: number | null; kz: number | null; ipp: number | null; izpArea: number; hpp: number; cpp: number; byty: number | null; gdv: number | null } | null;
  generatedAt: string;
};

export type LightState = "ok" | "warn" | "bad" | "unknown";
export type Light = { key: string; label: string; state: LightState; text: string };

const BAD_FLAGS = new Set(["exekucia", "konkurz", "drazba", "sudne_konanie", "spochybnene", "zakaz"]);
const BAD_LIMITS = new Set(["zaplava", "zosuvy", "banske", "env", "ez_sazp", "skladka"]);

/** Hodnota predpočítaného údaju: skupina → subjekt („parcel_c:1234/5") → objekt. */
const parsed = new Map<string, Record<string, unknown> | null>();
export function parseFact(raw: string | undefined | null): Record<string, unknown> | null {
  if (!raw) return null;
  if (parsed.has(raw)) return parsed.get(raw) ?? null;
  let v: Record<string, unknown> | null = null;
  try { const j = JSON.parse(raw) as unknown; v = j && typeof j === "object" ? (j as Record<string, unknown>) : null; } catch { v = null; }
  if (parsed.size > 5000) parsed.clear();
  parsed.set(raw, v);
  return v;
}
export function fact(core: PropertyCore, grp: string, subject: string): Record<string, unknown> | null {
  return parseFact(core.facts?.[grp]?.[subject]);
}
export function mainKey(core: PropertyCore): string | null {
  return core.main.parcelNo ? `${core.main.register === "E" ? "parcel_e" : "parcel_c"}:${core.main.parcelNo}` : null;
}
const str = (v: unknown) => (v == null ? "" : String(v));

function pristupState(core: PropertyCore): { state: LightState; text: string } {
  const mk = mainKey(core);
  const f = mk ? fact(core, "pristup", mk) : null;
  if (!f) return { state: "unknown", text: "Prístup z cesty zatiaľ nie je spočítaný — overiť na mape." };
  const t = str(f.trieda ?? f.pristup_trieda ?? f.class).toLowerCase();
  if (t.includes("priamy")) return { state: "ok", text: str(f.trieda ?? "priamy prístup z verejnej cesty") };
  if (t.includes("cez")) return { state: "warn", text: str(f.trieda) };
  if (t.includes("bez")) return { state: "bad", text: "Bez priameho prístupu z cesty — treba vecné bremeno alebo kúpu prístupu." };
  return { state: "unknown", text: str(f.trieda) || "Prístup sa nedal určiť (chýba geometria)." };
}

const RESIDENTIAL = /býv|byva|obyt|zmie|rekrea|rodinn|bytov|občian|obcian/i;
const NON_BUILD = /poľno|polno|les|zele|orn|ttp|vod|krajin/i;

export function zoneOf(d: SheetData): { name: string | null; fromUp: boolean } {
  const p = d.core.parcels.find((x) => x.parcel_no === d.core.main.parcelNo) ?? d.core.parcels[0];
  if (p?.zone) return { name: p.zone, fromUp: true };
  const z = d.zone ? str(d.zone.label ?? d.zone.name ?? d.zone.zone_code) : "";
  return z ? { name: z, fromUp: true } : { name: null, fromUp: false };
}

export function semafor(d: SheetData): Light[] {
  const c = d.core;
  const out: Light[] = [];
  // PRÁVO
  const bad = c.flags.filter((f) => BAD_FLAGS.has(f.kind));
  const tarchy = c.legal.reduce((s, l) => s + l.tarchyCount, 0);
  const vb = c.parcels.some((p) => { const m = fact(c, "mapa", `parcel_c:${p.parcel_no}`); return Array.isArray(m?.vb_pretina) && (m?.vb_pretina as unknown[]).length > 0; });
  const known = c.legal.length > 0 && c.legal.every((l) => l.hasData);
  if (bad.length || c.auctions.length) out.push({ key: "pravo", label: "Právny stav", state: "bad", text: [...new Set(bad.map((f) => f.label))].slice(0, 3).join(", ") || "dražba" });
  else if (tarchy || vb) out.push({ key: "pravo", label: "Právny stav", state: "warn", text: `${tarchy ? `${tarchy}× ťarcha alebo poznámka` : ""}${tarchy && vb ? " · " : ""}${vb ? "vecné bremeno v mape" : ""}` });
  else if (known) out.push({ key: "pravo", label: "Právny stav", state: "ok", text: "V našom zázname bez tiarch a problémov — overiť na úradnom výpise." });
  else out.push({ key: "pravo", label: "Právny stav", state: "unknown", text: "Časť B/C nemáme pre všetky LV — stav neznámy." });
  // PRÍSTUP
  const pr = pristupState(c);
  out.push({ key: "pristup", label: "Prístup", ...pr });
  // LIMITY
  const items = d.limits?.items ?? [];
  const hits = items.filter((h) => h.hit);
  const extBad = (d.ext ?? []).filter((e) => e.status === "hit" && /povod|záplav|zaplav|rad[oó]n.*vysok|zosuv/i.test(`${e.label} ${e.value ?? ""}`));
  if (!items.length) out.push({ key: "limity", label: "Limity a riziká", state: "unknown", text: "Registre limitov sa nepodarilo načítať." });
  else if (hits.some((h) => BAD_LIMITS.has(h.key)) || extBad.length) out.push({ key: "limity", label: "Limity a riziká", state: "bad", text: [...hits.filter((h) => BAD_LIMITS.has(h.key)).map((h) => h.label), ...extBad.map((e) => e.label)].slice(0, 3).join(", ") });
  else if (hits.length) out.push({ key: "limity", label: "Limity a riziká", state: "warn", text: hits.map((h) => h.label).slice(0, 3).join(", ") });
  else if (items.every((h) => h.error)) out.push({ key: "limity", label: "Limity a riziká", state: "unknown", text: "Registre neodpovedali." });
  else out.push({ key: "limity", label: "Limity a riziká", state: "ok", text: "V sledovaných registroch bez zásahu." });
  // ÚP
  const z = zoneOf(d);
  if (!z.name) out.push({ key: "up", label: "Územný plán", state: "unknown", text: "Zónu ÚP pre parcelu nemáme." });
  else if (RESIDENTIAL.test(z.name)) out.push({ key: "up", label: "Územný plán", state: "ok", text: z.name });
  else if (NON_BUILD.test(z.name)) out.push({ key: "up", label: "Územný plán", state: "warn", text: `${z.name} — výstavba len po zmene ÚP` });
  else out.push({ key: "up", label: "Územný plán", state: "warn", text: z.name });
  // SIETE (obec + OSM)
  const ob = fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`);
  const mk = mainKey(c);
  const osm = mk ? fact(c, "osm", mk) : null;
  const vod = ob ? (ob.vodovod ?? ob.vodovod_podiel ?? ob.vodovod_pct) : null;
  const kan = ob ? (ob.kanalizacia ?? ob.kanalizacia_podiel ?? ob.kanalizacia_pct) : null;
  if (!ob && !osm) out.push({ key: "siete", label: "Siete", state: "unknown", text: "Údaje o sieťach zatiaľ nie sú spočítané — vyjadrenia správcov." });
  else {
    const parts: string[] = [];
    let st: LightState = "ok";
    if (vod != null) { const ok = vod === true || Number(vod) >= 50; parts.push(ok ? "vodovod v obci" : "vodovod v obci chýba / malé pokrytie"); if (!ok) st = "warn"; }
    if (kan != null) { const ok = kan === true || Number(kan) >= 50; parts.push(ok ? "kanalizácia v obci" : "kanalizácia v obci chýba / malé pokrytie"); if (!ok) st = "warn"; }
    const tr = osm && typeof osm.trafo === "number" ? osm.trafo : null;
    if (tr != null) parts.push(`trafostanica ${tr < 1000 ? `${tr} m` : `${(tr / 1000).toFixed(1)} km`}`);
    if (vod == null && kan == null && tr == null) st = "unknown";
    else if (vod == null && kan == null && tr != null && tr > 500) st = "warn";
    out.push({ key: "siete", label: "Siete", state: st, text: parts.join(" · ") || "Napojenie obce neznáme — vyjadrenia správcov." });
  }
  // CENA
  const est = c.compStats?.estimateEur ?? d.avm?.estimate_eur ?? null;
  const ask = c.listings.find((l) => !l.removed && l.price_eur)?.price_eur ?? null;
  if (est && ask) {
    const dv = Math.round(((ask - est) / est) * 100);
    out.push({ key: "cena", label: "Cena", state: dv > 25 ? "warn" : "ok", text: `ponuka ${dv > 0 ? "+" : ""}${dv} % oproti odhadu z predajov` });
  } else if (est) out.push({ key: "cena", label: "Cena", state: "ok", text: `odhad ~${Math.round(est).toLocaleString("sk-SK")} €` });
  else out.push({ key: "cena", label: "Cena", state: "unknown", text: "Na odhad chýbajú porovnateľné predaje." });
  return out;
}

/** Kontrolný zoznam „čo overiť pred kúpou" — každá položka vzniká z konkrétneho zistenia. */
export function checklist(d: SheetData): { text: string; why: string }[] {
  const c = d.core;
  const out: { text: string; why: string }[] = [];
  const add = (text: string, why: string) => { if (!out.some((x) => x.text === text)) out.push({ text, why }); };
  add("Vyžiadať aktuálny úradný výpis z LV a kópiu katastrálnej mapy", `náš záznam je k ${c.dataset?.updated_at?.slice(0, 10) ?? "dátumu importu"}`);
  const tar = c.legal.reduce((s, l) => s + l.tarchyCount, 0);
  if (tar) add("Overiť každú ťarchu a dohodnúť jej výmaz alebo prevzatie pred podpisom", `${tar}× ťarcha alebo poznámka na LV`);
  if (c.legal.some((l) => !l.hasData)) add("Časť B a C overiť na úradnom výpise", "pre niektoré LV ich nemáme — stav neznámy");
  for (const f of c.flags) {
    if (f.kind === "exekucia") add("Overiť exekúciu a jej výmaz (exekútor, súhlas oprávneného)", f.label);
    if (f.kind === "sudne_konanie" || f.kind === "spochybnene") add("Zistiť stav súdneho konania / spochybnenia zápisu", f.label);
    if (f.kind === "konkurz") add("Predaj len so súhlasom správcu konkurznej podstaty", f.label);
    if (f.kind === "rozostavana_stavba" || f.kind === "rozostavany_priestor") add("Overiť stav stavebného konania a kolaudácie", f.label);
    if (f.kind === "chranena") add("Zohľadniť ochranu (pamiatka / príroda) — vyjadrenie príslušného orgánu", f.label);
  }
  if (c.auctions.length) add("Dražba: overiť stav a podmienky dražby, zábezpeku a ťarchy po príklepe", c.auctions.map((a) => a.match).join(", "));
  if (c.unregistered.length) add("Stavba nie je zapísaná v katastri — overiť povolenie, kolaudáciu, dodatočný zápis", `${c.unregistered.length}× budova bez zápisu`);
  const persons = c.owners.perLv.reduce((s, l) => s + l.count, 0);
  if (persons > 3) add("Súhlas všetkých spoluvlastníkov; pri predaji podielu predkupné právo spoluvlastníkov (§ 140 Občianskeho zákonníka)", `${persons} vlastníkov`);
  for (const lv of c.lvs) {
    const v = fact(c, "vlastnici", `lv:${lv}`);
    if (v && Number(v.pravdepodobne_zosnuli ?? 0) > 0) add("Overiť, či niektorý vlastník nezomrel — potrebné dedičské konanie", `LV ${lv}: ${String(v.pravdepodobne_zosnuli)}× veľmi starý dátum narodenia`);
    if (v && (Number(v.obec ?? 0) > 0)) add("Predaj obecného majetku: zámer, uznesenie zastupiteľstva, zverejnenie", `LV ${lv}: vlastník obec`);
    if (v && (Number(v.stat ?? 0) > 0 || Number(v.spf ?? 0) > 0)) add("Štát / SPF: osobitný postup predaja (ponuka, súhlas, cena podľa predpisov)", `LV ${lv}: štátny vlastník`);
    if (v && Number(v.nezisteny ?? 0) > 0) add("Nezistený vlastník — rokovať so SPF / vysporiadanie", `LV ${lv}`);
  }
  if (c.parcels.some((p) => p.register === "C" && p.settled === 0)) add("Vysporiadať pozemky registra E pod parcelou (iní vlastníci)", "parcela má pod sebou E-KN");
  if (c.parcels.some((p) => p.register === "E")) add("Parcela registra E — overiť identifikáciu a vlastníkov podľa pôvodného stavu", "pozemok podľa pozemkovej knihy");
  for (const p of c.parcels) {
    const m = fact(c, "mapa", `parcel_c:${p.parcel_no}`);
    if (m && Array.isArray(m.vb_pretina) && m.vb_pretina.length) add("Zistiť rozsah vecného bremena (geometrický plán, zmluva)", `parcela ${p.parcel_no}: ${(m.vb_pretina as unknown[]).join(", ")}`);
    if (m && Math.abs(Number(m.rozdiel_pct ?? 0)) >= 5) add("Vytýčenie hraníc geodetom — výmera v mape sa líši od LV", `parcela ${p.parcel_no}: ${Number(m.rozdiel_pct).toFixed(0)} %`);
    if (m && m.ppu) add("Prebiehajúce pozemkové úpravy — overiť stav projektu a nové parcely", `obvod ${String(m.ppu)}`);
  }
  const pr = pristupState(c);
  if (pr.state === "bad" || pr.state === "warn") add("Zabezpečiť právny prístup (vecné bremeno prechodu alebo kúpa prístupovej parcely)", pr.text);
  if (pr.state === "unknown") add("Overiť prístup z verejnej cesty na mape a v teréne", "prístup nie je spočítaný");
  for (const h of d.limits?.items ?? []) {
    if (!h.hit) continue;
    if (h.key === "zaplava") add("Povodňové riziko: poistenie, výška podlahy, vyjadrenie správcu toku", h.label);
    if (h.key === "zosuvy") add("Inžinierskogeologický prieskum pred stavbou (zosuv)", h.label);
    if (h.key === "les") add("Stavba do 50 m od lesa — záväzné stanovisko orgánu štátnej správy lesného hospodárstva", h.label);
    if (h.key === "tok") add("Ochranné pásmo vodného toku — vyjadrenie správcu toku", h.label);
    if (h.key === "sop") add("Chránené územie — vyjadrenie orgánu ochrany prírody", h.label);
    if (h.key === "cesta_op") add("Ochranné pásmo cesty — súhlas správcu cesty", h.label);
    if (h.key === "env" || h.key === "ez_sazp" || h.key === "skladka" || h.key === "banske") add("Environmentálne riziko — prieskum kontaminácie / podložia", h.label);
  }
  const mk = mainKey(c);
  const osm = mk ? fact(c, "osm", mk) : null;
  if (osm) {
    if (osm.el_op === true) add("Elektrické vedenie / stanica — stavba v ochrannom pásme len so súhlasom prevádzkovateľa siete (zákon 251/2012 § 43)", `ochranné pásmo${osm.el_op_kv ? ` ${String(osm.el_op_kv)} kV` : ""} podľa OSM (poloha ±5–10 m)`);
    if (osm.plyn_op === true) add("Plynovod — bezpečnostné/ochranné pásmo, vyjadrenie SPP-distribúcia", "plynovod podľa OSM");
    if (osm.cint_op === true) add("Ochranné pásmo pohrebiska 50 m — umiestnenie budov obmedzené", "cintorín podľa OSM");
    if (osm.zel_op === true) add("Ochranné pásmo dráhy — súhlas špeciálneho stavebného úradu", "železnica podľa OSM");
    if (typeof osm.cesta === "number" && osm.cesta > 50) add("Prístupová cesta je ďalej než 50 m — overiť vjazd a prípojky", `najbližšia cesta ${String(osm.cesta)} m`);
  }
  const z = zoneOf(d);
  if (!z.name) add("Vyžiadať záväznú časť ÚP / územnoplánovaciu informáciu od obce", "zónu ÚP nemáme");
  else if (NON_BUILD.test(z.name)) add("Výstavba podľa ÚP nie je možná bez zmeny ÚP — overiť na obci", z.name);
  const agri = c.parcels.some((p) => /orn|trval|záhrad|zahrad|vinic|chmel|ovocn/i.test(p.use_type ?? ""));
  if (agri) {
    add("Poľnohospodárska pôda: pred stavbou vyňatie z pôdneho fondu a odvod", c.parcels.find((p) => p.odnatie_eur)?.odnatie_eur ? "odvod podľa BPEJ" : "druh pozemku");
    add("Predaj poľnohospodárskeho pozemku mimo zastavaného územia — zverejnenie ponuky podľa zákona 140/2014 Z. z.", "zákonný postup prevodu");
  }
  for (const e of d.ext ?? []) {
    if (e.status !== "hit") continue;
    if (/rad[oó]n/i.test(e.label) && /stredn|vysok/i.test(e.value ?? "")) add("Radón: meranie a protiradónová izolácia", `${e.label}: ${e.value}`);
    if (/lpis|poľnohospodársk.*diel|diel/i.test(e.label)) add("Pozemok obhospodaruje poľnohospodár — overiť nájomnú zmluvu a výpovednú lehotu", e.label);
    if (/vodárensk|PHO|ochranné pásmo vodn/i.test(e.label)) add("Ochranné pásmo vodného zdroja — obmedzenia (vrt, žumpa, hnojenie)", e.label);
    if (/ložisk|dobývac/i.test(e.label)) add("Chránené ložiskové územie / dobývací priestor — súhlas obvodného banského úradu", e.label);
  }
  return out;
}

/** Úplnosť: koľko oblastí listu má pre túto nehnuteľnosť dáta. */
export function completeness(d: SheetData): { have: number; total: number; missing: string[] } {
  const c = d.core;
  const mk = mainKey(c);
  const blocks: [string, boolean][] = [
    ["parcely a výmery", c.parcels.length > 0],
    ["vlastníci", c.owners.perLv.some((l) => l.count > 0)],
    ["tituly a ťarchy", c.legal.some((l) => l.hasData)],
    ["ceny zo zmlúv (LV)", c.prices.length > 0],
    ["porovnateľné predaje", c.comparables.length > 0],
    ["ponuky v okolí", c.nearby.length > 0],
    ["automatický odhad (AVM)", !!d.avm?.estimate_eur],
    ["limity z registrov", (d.limits?.items ?? []).some((h) => !h.error)],
    ["dostupnosť", !!d.access],
    ["zóna ÚP", !!zoneOf(d).name],
    ["terén", !!(mk && fact(c, "teren", mk))],
    ["slnko", !!(mk && fact(c, "slnko", mk))],
    ["prístup z cesty", !!(mk && fact(c, "pristup", mk))],
    ["susedia", !!(mk && fact(c, "susedia", mk))],
    ["katastrálna mapa (VB, zastavané územie)", !!(mk && fact(c, "mapa", mk))],
    ["siete a vybavenosť (OSM)", !!(mk && fact(c, "osm", mk))],
    ["obec", !!fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`)],
    ["klíma", !!fact(c, "klima", `ku:${c.dataset?.ku_code ?? ""}`)],
    ["normy", !!fact(c, "normy", `ku:${c.dataset?.ku_code ?? ""}`)],
    ["pôda (BPEJ)", !!(mk && fact(c, "bpej", mk)) || c.parcels.some((p) => p.bpej)],
    ["geológia, voda a ďalšie registre", (d.ext ?? []).some((e) => e.status !== "error")],
  ];
  return { have: blocks.filter((b) => b[1]).length, total: blocks.length, missing: blocks.filter((b) => !b[1]).map((b) => b[0]) };
}
