// LIST NEHNUTEĽNOSTI — vyhodnotenie (semafor, kontrolný zoznam „čo overiť pred kúpou", úplnosť). Čisté funkcie
// nad dátami listu; rovnaké pre internú aj klientsku verziu. Zásada z kontraktu Property-360 §4: chýbajúci údaj
// je NEZNÁMY stav, nikdy „v poriadku". Formulácie prechádzajú phrase-guardom v builde.
import type { PropertyCore, LimitsResult, AvmResult, ShadeResult } from "./api/kataster.functions";
import type { FinInputs, FinMarket } from "./finance";

export type ExtHit = { key: string; label: string; category: string; status: "ok" | "hit" | "none" | "error"; value: string | null; detail?: string | null; attribution: string; url?: string | null; risk?: boolean };
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
  /** pre koho je dokument (klientska verzia zostavená na serveri) */
  client?: string | null;
  /** trhové údaje pre financie (sadzby ECB/NBS, verejné sadzby bánk) — živé pri otvorení */
  fin?: FinMarket | null;
  /** zadané vstupy financovania (klientska verzia ich nesie v snapshote) */
  finInputs?: Partial<FinInputs> | null;
  /** maklér, ktorý list pripravil (zobrazí sa na titulke a v teaseri) */
  broker?: { name?: string; firma?: string; phone?: string; email?: string } | null;
  /** poznámka makléra pre klienta */
  notes?: string | null;
  /** kapitoly vynechané v klientskej verzii */
  hide?: string[] | null;
  /** tienenie z budov a stromov (DMP 1.0) — horizont objektov v 16 smeroch, výšky okolia */
  shade?: ShadeResult | null;
  /** fotografie (zmenšené JPEG data URL, max 4) — z obhliadky / dokumentov LV */
  photos?: { name: string; src: string }[] | null;
  /** jazyk klientskej verzie (en = anglická titulka, zhrnutie, kapitoly a vysvetlenia) */
  lang?: "sk" | "en" | null;
  /** údaje od predávajúceho (energetický certifikát, povolenia, rekonštrukcie, vady, byt, pozemok) */
  decl?: Record<string, string | number | boolean | null> | null;
  /** „teaser" = jednostránková ponuka */
  variant?: "teaser" | null;
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
/** Je zásah v registri naozaj riziko? Niektoré registre vracia „zásah" aj pri priaznivom výsledku (nízky radón, stabilné územie). */
export function riskyHit(e: ExtHit): boolean {
  if (e.status !== "hit" || !e.risk) return false;
  const v = (e.value ?? "").toLowerCase();
  if (e.key === "geo_radon") return /stredn|vysok/.test(v);
  if (e.key === "geo_nachylnost_svahove_pohyby") return !/stabiln/.test(v);
  if (e.key === "geo_kontaminacia_pod") return !/nekontamin|relatívne čist|relativne cist/.test(v);
  if (["mapa_lps_vzdusny_priestor_uas", "env_ipkz", "voda_zranitelna_oblast_dusicnany"].includes(e.key)) return false;   // informácia, nie riziko pozemku
  return true;
}
export function fact(core: PropertyCore, grp: string, subject: string): Record<string, unknown> | null {
  return parseFact(core.facts?.[grp]?.[subject]);
}
/** Adresa celku: adresa hlavnej parcely, inak prvej stavby (Register adries MV SR). */
export function addressOf(core: PropertyCore): Record<string, unknown> | null {
  const mk = mainKey(core);
  const a = mk ? fact(core, "adresa", mk) : null;
  if (a) return a;
  const b = Object.entries(core.facts.adresa ?? {}).find(([k]) => k.startsWith("building:"));
  return b ? parseFact(b[1]) : null;
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
  const up = p ? fact(d.core, "up", `${p.register === "E" ? "parcel_e" : "parcel_c"}:${p.parcel_no}`) : null;
  if (up?.zona) return { name: `${String(up.zona)} — ÚP z výkresu, orientačné`, fromUp: true };
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
  const ex = (k: string) => (d.ext ?? []).find((e) => e.key === k && e.status === "hit");
  const extBad = [ex("voda_zaplava_q5_q1000"), ex("geo_dobyvaci_priestor"), ex("geo_chlu"), (ex("geo_radon")?.value ?? "").includes("vysok") ? ex("geo_radon") : undefined,
    /vysok|veľmi/i.test(ex("geo_nachylnost_svahove_pohyby")?.value ?? "") ? ex("geo_nachylnost_svahove_pohyby") : undefined].filter((x): x is NonNullable<typeof x> => !!x);
  const extWarn = (d.ext ?? []).filter((e) => riskyHit(e) && !extBad.includes(e));
  if (!items.length) out.push({ key: "limity", label: "Limity a riziká", state: "unknown", text: "Registre limitov sa nepodarilo načítať." });
  else if (hits.some((h) => BAD_LIMITS.has(h.key)) || extBad.length) out.push({ key: "limity", label: "Limity a riziká", state: "bad", text: [...hits.filter((h) => BAD_LIMITS.has(h.key)).map((h) => h.label), ...extBad.map((e) => e.label)].slice(0, 3).join(", ") });
  else if (hits.length || extWarn.length) out.push({ key: "limity", label: "Limity a riziká", state: "warn", text: [...hits.map((h) => h.label), ...extWarn.map((e) => e.label)].slice(0, 3).join(", ") });
  else if (items.every((h) => h.error)) out.push({ key: "limity", label: "Limity a riziká", state: "unknown", text: "Registre neodpovedali." });
  else out.push({ key: "limity", label: "Limity a riziká", state: "ok", text: "V sledovaných registroch bez zásahu." });
  // ÚP — územnoplánovacia informácia od obce (evidovaná odpoveď) má prednosť pred zónou odčítanou z mapy
  const z = zoneOf(d);
  const upi = (c.requests ?? []).find((r) => r.kind === "up_obec" && r.status === "odpoved" && r.outcome);
  if (upi) out.push({ key: "up", label: "Územný plán", state: upi.outcome === "ok" ? "ok" : upi.outcome === "pozor" ? "warn" : "bad", text: `ÚPI obce: ${upi.summary ?? (upi.outcome === "ok" ? "zámer v súlade" : "s obmedzením")}` });
  else if (!z.name) out.push({ key: "up", label: "Územný plán", state: "unknown", text: "Zónu ÚP pre parcelu nemáme." });
  else {
    const zn = z.name.replace(/\s*\/\s*/g, " / ").replace(/^./, (x) => x.toUpperCase());
    if (RESIDENTIAL.test(z.name)) out.push({ key: "up", label: "Územný plán", state: "ok", text: zn });
    else if (NON_BUILD.test(z.name)) out.push({ key: "up", label: "Územný plán", state: "warn", text: `${zn} — výstavba len po zmene ÚP` });
    else out.push({ key: "up", label: "Územný plán", state: "warn", text: zn });
  }
  // SIETE (obec + OSM)
  const ob = fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`);
  const mk = mainKey(c);
  const osm = mk ? fact(c, "osm", mk) : null;
  const vod = ob ? (ob.vodovod_verejny_pct ?? ob.vodovod) : null;
  const kan = ob ? (ob.kanal_pripojka_pct ?? ob.kanalizacia) : null;
  if (!ob && !osm) out.push({ key: "siete", label: "Siete", state: "unknown", text: "Údaje o sieťach zatiaľ nie sú spočítané — vyjadrenia správcov." });
  else {
    const parts: string[] = [];
    let st: LightState = "ok";
    if (vod != null) { const ok = vod === true || Number(vod) >= 50; parts.push(ok ? "vodovod v obci" : "vodovod v obci chýba / malé pokrytie"); if (!ok) st = "warn"; }
    if (kan != null) { const ok = kan === true || Number(kan) >= 50; parts.push(ok ? `kanalizácia v obci${typeof kan === "number" ? ` (${Math.round(kan)} % domov)` : ""}` : `kanalizácia v obci len ${typeof kan === "number" ? `${Math.round(kan)} % domov` : "čiastočne"}`); if (!ok) st = "warn"; }
    if (ob && typeof ob.plyn_obec === "boolean") parts.push(ob.plyn_obec ? "plyn v obci" : "obec bez plynu");
    const tr = osm && typeof osm.trafo === "number" ? osm.trafo : null;
    if (tr != null) parts.push(`trafostanica ${tr < 1000 ? `${tr} m` : `${(tr / 1000).toFixed(1)} km`}`);
    if (vod == null && kan == null && tr == null) st = "unknown";
    else if (vod == null && kan == null && tr != null && tr > 500) st = "warn";
    // vyjadrenia správcov (evidované odpovede, 0113) majú prednosť pred odhadom z OSM a údajov obce
    const ans = (c.requests ?? []).filter((r) => r.status === "odpoved" && r.outcome && r.kind !== "up_obec");
    if (ans.some((r) => r.outcome === "riziko")) { st = "bad"; parts.unshift("vyjadrenie správcu: prekážka"); }
    else if (ans.some((r) => r.outcome === "pozor")) { st = st === "bad" ? st : "warn"; parts.unshift("vyjadrenie správcu: s podmienkami"); }
    else if (ans.length) { parts.unshift(`vyjadrenia správcov bez prekážok (${ans.length})`); if (st === "unknown") st = "ok"; }
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
    if (v && Number(v.pravdepodobne_zosnuli ?? 0) > 0) add("Overiť aktuálnosť zápisu vlastníka (veľmi starý dátum narodenia) — prípadne dedičské konanie", `LV ${lv}: ${String(v.pravdepodobne_zosnuli)}× veľmi starý dátum narodenia`);
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
  const eia = fact(c, "eia", `ku:${c.dataset?.ku_code ?? ""}`);
  const projs = Array.isArray(eia?.projekty) ? (eia?.projekty as { n?: string; typ?: string; d?: string }[]) : [];
  const upSea = projs.find((p) => /územn|ÚPN|zmeny a doplnky/i.test(p.n ?? "") && (p.typ ?? "").startsWith("SEA"));
  if (upSea) add("Obec mení územný plán (proces SEA) — overiť návrh a pripomienky", `${upSea.n ?? ""} (${upSea.d ?? ""})`);
  const z = zoneOf(d);
  if (!z.name) add("Vyžiadať záväznú časť ÚP / územnoplánovaciu informáciu od obce", "zónu ÚP nemáme");
  else if (NON_BUILD.test(z.name)) add("Výstavba podľa ÚP nie je možná bez zmeny ÚP — overiť na obci", z.name);
  const agri = c.parcels.some((p) => /orn|trval|záhrad|zahrad|vinic|chmel|ovocn/i.test(p.use_type ?? ""));
  if (agri) {
    add("Poľnohospodárska pôda: pred stavbou vyňatie z pôdneho fondu a odvod", c.parcels.find((p) => p.odnatie_eur)?.odnatie_eur ? "odvod podľa BPEJ" : "druh pozemku");
    add("Poľnohospodársky pozemok: povinné zverejnenie ponuky podľa zákona 140/2014 zrušil Ústavný súd (33/2019 Z. z.); overiť nájom (504/2003) a predkupné práva podielov v pozemkovom spoločenstve (97/2013)", "zákonný postup prevodu");
  }
  for (const e of d.ext ?? []) {
    if (e.status !== "hit") continue;
    const w = `${e.label}: ${e.value ?? ""}`;
    switch (e.key) {
      case "geo_radon": if (/stredn|vysok/i.test(e.value ?? "")) add("Radón: protiradónová izolácia a meranie objemovej aktivity radónu", w); break;
      case "voda_zaplava_q5_q1000": add("Záplavové územie: poistenie, výška podlahy nad hladinou, vyjadrenie správcu toku", w); break;
      case "geo_nachylnost_svahove_pohyby": if (/stredn|vysok|veľmi/i.test(e.value ?? "")) add("Náchylnosť na svahové pohyby — inžinierskogeologický prieskum pred stavbou", w); break;
      case "geo_chlu": case "geo_dobyvaci_priestor": add("Chránené ložiskové územie / dobývací priestor — záväzné stanovisko obvodného banského úradu", w); break;
      case "voda_ochranne_pasmo_vodneho_zdroja": add("Ochranné pásmo vodného zdroja — obmedzenia (vrt, žumpa, hnojenie), vyjadrenie orgánu štátnej vodnej správy", w); break;
      case "voda_chvo": add("Chránená vodohospodárska oblasť — obmedzenia činností podľa vodného zákona", w); break;
      case "voda_hydromelioracie_odvodnenie": case "voda_hydromelioracie_zavlaha": add("Hydromelioračné zariadenie v blízkosti — vyjadrenie Hydromeliorácie, š. p.", w); break;
      case "prir_natura_uev": case "prir_natura_chvu": add("Územie Natura 2000 — posúdenie vplyvu zámeru, vyjadrenie orgánu ochrany prírody", w); break;
      case "prir_mchu": add("Maloplošné chránené územie — súhlas orgánu ochrany prírody", w); break;
      case "prir_vchu_zona_stupen": if (/III|IV|V\./.test(e.value ?? "")) add("Vyšší stupeň ochrany prírody — výstavba len so súhlasom orgánu ochrany prírody", w); break;
      case "prir_lpis_diel": add("Pozemok je v poľnohospodárskom diele (LPIS) — overiť nájom s poľnohospodárom a výpovednú lehotu", w); break;
      case "env_seveso": add("V okolí je prevádzka s rizikom závažnej priemyselnej havárie — zohľadniť bezpečnostné pásmo", w); break;
      case "geo_kontaminacia_pod": if (riskyHit(e)) add("Možná kontaminácia pôdy — overiť rozbor pôdy pri záhrade/pestovaní", w); break;
      case "mapa_lps_vzdusny_priestor_uas": add("Vzdušný priestor letiska — obmedzenia výšky stavieb a dronov, vyjadrenie Dopravného úradu", w); break;
    }
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

// ——— tvar pozemku z obrysu (v prehliadači; bez zápisu do DB) ———
export type Shape = { dlzka: number; sirka: number; priemSirka: number; kompakt: number; tvar: string; osAz: number; obalkaM2: number; domOk: boolean | null; obvod: number; plocha: number };
function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Rozmery z najmenšieho opísaného obdĺžnika, kompaktnosť 4πA/O², orientácia dlhšej osi (0° = sever),
 *  zastavateľná obálka ≈ plocha po odstupe 2 m od hraníc (vyhl. 532/2002 § 6), či sa zmestí dom 10 × 12 m. */
export function shapeOf(geometryJson: string | null): Shape | null {
  if (!geometryJson) return null;
  let ring: [number, number][] = [];
  try {
    const j = JSON.parse(geometryJson) as { type: string; coordinates: unknown };
    if (j.type === "Polygon") ring = (j.coordinates as [number, number][][])[0];
    else if (j.type === "MultiPolygon") ring = (j.coordinates as [number, number][][][]).map((x) => x[0]).sort((a, b) => b.length - a.length)[0];
  } catch { return null; }
  if (!ring || ring.length < 4) return null;
  const lat0 = ring.reduce((s, c) => s + c[1], 0) / ring.length, lng0 = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110540;
  const P = ring.map((c) => [(c[0] - lng0) * kx, (c[1] - lat0) * ky] as [number, number]);
  let area = 0, per = 0;
  for (let i = 0; i < P.length - 1; i++) { area += P[i][0] * P[i + 1][1] - P[i + 1][0] * P[i][1]; per += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); }
  area = Math.abs(area) / 2;
  if (area < 1) return null;
  const H = hull(P);
  let best = { a: Infinity, w: 0, h: 0, ang: 0 };
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(-ang), s = Math.sin(-ang);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const q of H) { const x = q[0] * c - q[1] * s, y = q[0] * s + q[1] * c; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const w = maxx - minx, h = maxy - miny;
    if (w * h < best.a) best = { a: w * h, w, h, ang };
  }
  const dlzka = Math.max(best.w, best.h), sirka = Math.min(best.w, best.h);
  const longAng = best.w >= best.h ? best.ang : best.ang + Math.PI / 2;
  const osAz = Math.round(((90 - (longAng * 180) / Math.PI) % 180 + 180) % 180);
  const kompakt = (4 * Math.PI * area) / (per * per);
  const priemSirka = area / Math.max(dlzka, 1);
  const fill = area / Math.max(best.a, 1);
  const obalkaM2 = Math.max(0, Math.round((dlzka - 4) * (priemSirka - 4) * Math.min(1, fill + 0.1)));
  const domOk = priemSirka - 4 >= 10 && dlzka - 4 >= 12 ? true : sirka - 4 < 10 ? false : null;
  const ratio = dlzka / Math.max(sirka, 0.1);
  const tvar = priemSirka < 8 || ratio > 6 ? "úzky pás" : kompakt < 0.45 ? "členitý" : ratio > 2.2 ? "pretiahnutý" : "pravidelný";
  return { dlzka: Math.round(dlzka), sirka: Math.round(sirka), priemSirka: Math.round(priemSirka), kompakt: Math.round(kompakt * 100) / 100, tvar, osAz, obalkaM2, domOk, obvod: Math.round(per), plocha: Math.round(area) };
}

// ——— pravdepodobnosť, že vlastníci predajú (z katastra; orientačné poradie pre oslovenie, nie predpoveď) ———
export function sellPropensity(d: SheetData): { score: number; factors: string[] } {
  const c = d.core;
  if (c.listings.some((l) => !l.removed)) return { score: 100, factors: ["nehnuteľnosť je pravdepodobne v inzercii"] };
  let s = 15; const f: string[] = [];
  const owners = c.owners.perLv.reduce((t, l) => t + l.count, 0);
  if (owners >= 6) { s += 20; f.push(`${owners} spoluvlastníkov`); } else if (owners >= 3) { s += 10; f.push(`${owners} spoluvlastníci`); }
  const nowY = new Date().getFullYear();
  const inh = Math.max(0, ...c.legalYears.map((y) => y.inh_max ?? 0), ...c.acquisitions.filter((a) => a.kind === "inheritance").map((a) => a.lastYear ?? 0));
  if (inh && nowY - inh <= 3) { s += 20; f.push(`dedičstvo ${inh}`); }
  const lastBuy = Math.max(0, ...c.legalYears.map((y) => Math.max(y.sale_max ?? 0, y.gift_max ?? 0, y.inh_max ?? 0)));
  if (lastBuy && nowY - lastBuy >= 20) { s += 10; f.push(`bez zmeny vlastníka od ${lastBuy}`); }
  if (c.flags.some((x) => x.kind === "exekucia" || x.kind === "konkurz")) { s += 25; f.push("exekúcia / konkurz"); }
  if (c.auctions.length) { s += 30; f.push("dražba"); }
  for (const lv of c.lvs) {
    const v = fact(c, "vlastnici", `lv:${lv}`);
    if (v && Number(v.pravdepodobne_zosnuli ?? 0) > 0) { s += 10; f.push("veľmi starý zápis vlastníka"); break; }
  }
  for (const lv of c.lvs) {
    const v = fact(c, "vlastnici", `lv:${lv}`);
    if (v && Number(v.zahranicie ?? 0) > 0) { s += 5; f.push("vlastník v zahraničí"); break; }
  }
  if (c.signals.za.some((z) => z.classification === "MATCH")) { s += 15; f.push("zdedený byt (scenár)"); }
  return { score: Math.min(99, s), factors: f };
}

// ——— vhodnosť pre typ využitia (0–100, s dôvodmi; chýbajúci údaj = bez bodov, nie trest) ———
export function suitability(d: SheetData): { key: string; label: string; score: number; plus: string[]; minus: string[] }[] {
  const c = d.core; const mk = mainKey(c);
  const t = mk ? fact(c, "teren", mk) : null, sl = mk ? fact(c, "slnko", mk) : null, osm = mk ? fact(c, "osm", mk) : null;
  const z = zoneOf(d); const hits = (d.limits?.items ?? []).filter((h) => h.hit).map((h) => h.key);
  const area = c.parcels.filter((p) => p.register === "C").reduce((s, p) => s + (p.area_m2 ?? 0), 0);
  const pr = pristupState(c);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const mk1 = (label: string, key: string) => ({ key, label, score: 50, plus: [] as string[], minus: [] as string[] });
  const dom = mk1("Rodinný dom", "dom"), chata = mk1("Chata / rekreácia", "chata"), inv = mk1("Investícia (prenájom)", "invest"), dev = mk1("Developer (viac jednotiek)", "dev");
  const adj = (o: typeof dom, v: number, why: string) => { o.score += v; (v >= 0 ? o.plus : o.minus).push(why); };
  if (z.name) { if (RESIDENTIAL.test(z.name)) { adj(dom, 15, "ÚP na bývanie"); adj(dev, 15, "ÚP na bývanie"); } else if (NON_BUILD.test(z.name)) { adj(dom, -25, "ÚP nie je na bývanie"); adj(dev, -30, "ÚP nie je na bývanie"); } if (/rekrea/i.test(z.name)) adj(chata, 15, "ÚP rekreácia"); }
  if (pr.state === "ok") { adj(dom, 10, "priamy prístup z cesty"); adj(dev, 5, "prístup z cesty"); } else if (pr.state === "bad") { adj(dom, -20, "bez prístupu"); adj(dev, -20, "bez prístupu"); adj(chata, -10, "bez prístupu"); }
  const sk = num(t?.sklon_avg); if (sk != null) { if (sk < 8) { adj(dom, 5, "mierny sklon"); adj(dev, 10, "mierny sklon"); } else if (sk > 20) { adj(dom, -10, `sklon ${Math.round(sk)} %`); adj(dev, -15, `sklon ${Math.round(sk)} %`); } }
  const winter = num(sl?.dec_slnko); if (winter != null) { if (winter >= 5) { adj(dom, 8, `${winter} h slnka v decembri`); adj(chata, 5, "slnko v zime"); } else if (winter < 2) { adj(dom, -8, `len ${winter} h slnka v decembri`); adj(chata, -5, "málo slnka v zime"); } }
  const juh = num(t?.juh_podiel); if (juh != null && juh >= 50) { adj(dom, 5, "južná orientácia"); adj(chata, 5, "južná orientácia"); }
  if (hits.includes("zaplava")) { adj(dom, -25, "záplavové územie"); adj(dev, -25, "záplavové územie"); adj(inv, -15, "záplavové územie"); }
  if (hits.includes("zosuvy")) { adj(dom, -20, "zosuv"); adj(dev, -20, "zosuv"); }
  if (osm?.el_op === true) { adj(dom, -10, "ochranné pásmo vedenia"); adj(dev, -10, "ochranné pásmo vedenia"); }
  const skola = num(osm?.skola), obchod = num(osm?.potrav), bus = num(osm?.bus), lyze = num(osm?.lyze), tza = num(osm?.t_za);
  if (skola != null && skola <= 1500) adj(dom, 5, "škola do 1,5 km");
  if (obchod != null && obchod <= 1000) { adj(dom, 4, "obchod do 1 km"); adj(inv, 6, "obchod do 1 km"); }
  if (bus != null && bus <= 500) { adj(inv, 6, "zastávka do 500 m"); adj(dev, 4, "zastávka blízko"); }
  if (lyze != null && lyze <= 5000) adj(chata, 12, "lyžiarske stredisko do 5 km");
  if (num(osm?.cesta) != null && (num(osm?.cesta) as number) > 300) adj(chata, 5, "ďalej od cesty (pokoj)");
  if (tza != null) { if (tza <= 30) { adj(inv, 10, `Žilina ${tza} min`); adj(dev, 8, `Žilina ${tza} min`); } else if (tza > 60) { adj(inv, -8, `Žilina ${tza} min`); adj(dev, -6, "ďaleko od Žiliny"); } }
  if (area) { if (area >= 600 && area <= 2000) adj(dom, 5, `${Math.round(area)} m²`); else if (area < 400) adj(dom, -10, "malý pozemok"); if (area >= 3000) adj(dev, 12, `${Math.round(area)} m² na viac jednotiek`); else if (area < 1500) adj(dev, -15, "malá výmera pre developera"); }
  const r = d.core.market.rent; if (r?.yieldPct != null) adj(inv, r.yieldPct >= 5 ? 10 : r.yieldPct < 3.5 ? -8 : 0, `hrubý výnos v okrese ${r.yieldPct} %`);
  return [dom, chata, inv, dev].map((o) => ({ ...o, score: Math.max(0, Math.min(100, Math.round(o.score))) }));
}

/** Orientačná dĺžka prípojok: siete vedú spravidla po ceste → vzdialenosť parcely od cesty + vstup na pozemok. */
export function connectionLength(d: SheetData): number | null {
  const mk = mainKey(d.core); const osm = mk ? fact(d.core, "osm", mk) : null;
  const cesta = osm && typeof osm.cesta === "number" ? osm.cesta : null;
  return cesta == null ? null : Math.round(cesta + 5);
}

/** Príslušné úrady podľa okresu a obce (overiť konkrétne pracovisko). */
export function offices(d: SheetData): [string, string][] {
  const ok = d.core.dataset?.okres; const obec = (d.core.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "");
  if (!ok) return [];
  return [
    ["Kataster (výpis LV, vklad)", `Okresný úrad ${ok}, katastrálny odbor`],
    ["Vyňatie z pôdneho fondu, lesy", `Okresný úrad ${ok}, pozemkový a lesný odbor (príslušnosť overiť)`],
    ["Životné prostredie, vodné stavby", `Okresný úrad ${ok}, odbor starostlivosti o životné prostredie`],
    ["Územný plán, daň z nehnuteľností", `Obec ${obec}`],
    ["Stavebné konanie", "Stavebný úrad príslušný pre obec — overiť na obecnom úrade"],
  ];
}
