// ROZHODNUTIE O NEHNUTEĽNOSTI (2026-11-13) — vylučujúce podmienky, verdikt, scenáre využitia (najvyššie a najlepšie
// využitie), Monte Carlo rozpätie, povoľovanie (štúdie, čas) a vysporiadanie vlastníkov. Všetky náklady a lehoty, ktoré
// nemajú úradný zdroj, sú označené ako ODHAD z praxe (est: true) — v liste sa tak aj zobrazia.
import { fact, mainKey, riskyHit, zoneOf, type SheetData } from "./property-eval";
import type { FinResult } from "./finance";
import { hedonicOf } from "./finance";
import { DEV_DEFAULTS } from "./development";

const r0 = (n: number) => Math.round(n);
const RES = /býv|byva|obyt|zmie|rodinn/i, COM = /občian|obcian|obchod|zmiešané OV|výrob|vyrob|služ|sluz|komerč|komerc/i, NONBUILD = /poľno|polno|les|zele|orn|ttp|vod|krajin/i;

export type Gate = { text: string; hard: boolean };
export function gates(d: SheetData): Gate[] {
  const c = d.core; const out: Gate[] = [];
  if (c.flags.some((f) => f.kind === "exekucia")) out.push({ text: "exekúcia na LV — kúpa až po jej zrušení a výmaze", hard: true });
  if (c.flags.some((f) => f.kind === "sudne_konanie" || f.kind === "spochybnene")) out.push({ text: "súdne konanie / spochybnený zápis", hard: true });
  if (c.flags.some((f) => f.kind === "konkurz")) out.push({ text: "konkurz — predaj len cez správcu", hard: false });
  const mk = mainKey(c); const pr = mk ? fact(c, "pristup", mk) : null;
  if (/bez/i.test(String(pr?.trieda ?? ""))) out.push({ text: "bez právneho prístupu z verejnej cesty", hard: true });
  else if (/cez/i.test(String(pr?.trieda ?? ""))) out.push({ text: "prístup cez cudzí pozemok — zabezpečiť vecné bremeno (kľúčový pás pozemku pri ceste)", hard: false });
  const o = mk ? fact(c, "osm", mk) : null;
  if (o?.el_op === true) out.push({ text: `ochranné pásmo elektrického vedenia${o.el_op_kv ? ` ${String(o.el_op_kv)} kV` : ""} cez pozemok (251/2012 § 43) — zmenšuje zastavateľnú plochu, preložka na náklady investora`, hard: false });
  if (o?.plyn_op === true) out.push({ text: "ochranné / bezpečnostné pásmo plynovodu (251/2012 § 79–80) — stavba len so súhlasom SPP-distribúcia", hard: false });
  if (typeof o?.zel === "number" && (o.zel as number) <= 60) out.push({ text: "ochranné pásmo dráhy 60 m (513/2009 § 5) — súhlas dopravného správneho orgánu", hard: false });
  const z = zoneOf(d).name;
  if (z && NONBUILD.test(z)) out.push({ text: "územný plán nepripúšťa výstavbu — len po zmene ÚP (1–3 roky, neisté)", hard: false });
  if (!z) out.push({ text: "zónu ÚP nemáme — overiť územnoplánovacou informáciou", hard: false });
  if ((d.limits?.items ?? []).some((h) => h.hit && h.key === "zaplava") || (d.ext ?? []).some((e) => e.key === "voda_zaplava_q5_q1000" && e.status === "hit")) out.push({ text: "záplavové územie", hard: false });
  if ((d.limits?.items ?? []).some((h) => h.hit && h.key === "zosuvy")) out.push({ text: "zosuvné územie", hard: false });
  const owners = c.owners.perLv.reduce((s, l) => s + l.count, 0); if (owners > 10) out.push({ text: `${owners} vlastníkov — vysporiadanie dlhé a neisté`, hard: false });
  for (const lv of c.lvs) { const v = fact(c, "vlastnici", `lv:${lv}`); if (v && Number(v.nezisteny ?? 0) > 0) { out.push({ text: "nezistený vlastník (správa SPF) — súdne alebo osobitné vysporiadanie", hard: false }); break; } }
  if (Object.keys(c.facts.nkp ?? {}).length) out.push({ text: "národná kultúrna pamiatka na pozemku alebo stavbe — zásahy len so súhlasom krajského pamiatkového úradu (49/2002)", hard: false });
  if (c.unregistered.length) out.push({ text: "budova v mape ZBGIS bez zápisu v katastri — overiť povolenie a zápis (ak povolenie chýba: dodatočné povolenie pri stavbách do 31. 3. 2025 možné do 31. 12. 2040 podľa novely 243/2026)", hard: false });
  return out;
}

export type Scenario = { key: string; label: string; landValue: number | null; months: string; risk: "nízke" | "stredné" | "vysoké"; weight: number; note: string; est: boolean };
export type DecisionParams = { profitPct: number; otherPct: number; buildEurM2: number; flatSaleEurM2: number; houseSaleEurM2: number; comSaleEurM2: number; comBuildEurM2: number; discountPct: number };
export const DECISION_DEFAULTS: DecisionParams = { profitPct: 15, otherPct: 10, buildEurM2: 1800, flatSaleEurM2: DEV_DEFAULTS.predajEurM2, houseSaleEurM2: 2600, comSaleEurM2: 1900, comBuildEurM2: 1300, discountPct: 6 };

export function scenarios(d: SheetData, fin: FinResult | null, p: DecisionParams = DECISION_DEFAULTS): Scenario[] {
  const c = d.core; const b = fin?.basis; const area = b?.landM2 ?? 0; const z = zoneOf(d).name ?? "";
  const value = (b ? hedonicOf(d, b)?.value : null) ?? b?.value ?? null;
  const out: Scenario[] = [];
  out.push({ key: "A", label: "Predať / kúpiť v súčasnom stave", landValue: value, months: "1–6", risk: "nízke", weight: 1, note: "hodnota z porovnateľných predajov", est: false });
  if (fin?.prediction && value) {
    const holding = (fin.costs.annualTotal || 0) * 5;
    const v5 = fin.prediction.scenarios[1].values[2];
    out.push({ key: "B", label: "Ponechať 5 rokov (land-banking)", landValue: r0((v5 - holding) / Math.pow(1 + p.discountPct / 100, 5)), months: "60", risk: "stredné", weight: 0.6, note: `hodnota o 5 rokov ${r0(v5).toLocaleString("sk-SK")} € − náklady držby, diskont ${p.discountPct} % ročne`, est: true });
  }
  const buildable = !z || !NONBUILD.test(z);
  if (area && buildable && !c.buildings.length && value) {
    out.push({ key: "C", label: "Získať povolenie stavby a predať", landValue: r0(value * 1.3 - 4000), months: "6–18", risk: "stredné", weight: 0.7, note: "povolený stavebný pozemok býva o ~20–40 % drahší (odhad); náklady projekt + štúdie ~4 000 €", est: true });
    const hm2 = 130;
    const gdv = hm2 * p.houseSaleEurM2, cost = hm2 * p.buildEurM2 * 1.05;
    out.push({ key: "D", label: "Postaviť 1 rodinný dom (130 m²)", landValue: r0(gdv - cost - gdv * p.profitPct / 100 - gdv * p.otherPct / 100), months: "18–30", risk: "stredné", weight: RES.test(z) || !z ? 0.8 : 0.3, note: `predaj ${p.houseSaleEurM2} €/m², stavba ${p.buildEurM2} €/m²`, est: true });
    if (area >= 1500) {
      const plots = Math.floor((area * 0.85) / 800);
      const ppm2 = d.medPoz ?? c.compStats?.medPpm2 ?? null;
      if (plots >= 2 && ppm2) out.push({ key: "E", label: `Rozparcelovať na ${plots} pozemkov`, landValue: r0(plots * 800 * ppm2 * 0.92 - plots * 9000 - 6000), months: "12–24", risk: "stredné", weight: RES.test(z) ? 0.8 : 0.4, note: "cesta, prípojky, geometrický plán, povolenie delenia", est: true });
    }
  }
  if (d.dev?.cpp && d.dev.hpp && buildable) {
    const gdv = d.dev.cpp * p.flatSaleEurM2, cost = d.dev.hpp * p.buildEurM2;
    out.push({ key: "F", label: `Bytový dom (~${d.dev.byty ?? "?"} bytov)`, landValue: r0(gdv - cost - gdv * p.profitPct / 100 - gdv * p.otherPct / 100), months: "30–48", risk: "vysoké", weight: /hromad|bytov|zmie/i.test(z) ? 0.7 : 0.2, note: `predaj ${p.flatSaleEurM2} €/m², stavba ${p.buildEurM2} €/m² HPP, zisk ${p.profitPct} %`, est: true });
    if (COM.test(z)) { const g2 = d.dev.hpp * 0.9 * p.comSaleEurM2, c2 = d.dev.hpp * p.comBuildEurM2; out.push({ key: "G", label: "Komerčná / obchodná stavba", landValue: r0(g2 - c2 - g2 * p.profitPct / 100 - g2 * p.otherPct / 100), months: "24–36", risk: "vysoké", weight: 0.6, note: `hodnota ${p.comSaleEurM2} €/m², stavba ${p.comBuildEurM2} €/m²`, est: true }); }
  }
  if (b?.agri && area) {
    const lp = d.limits?.landPrice?.eurM2 ?? null;
    out.push({ key: "H", label: "Ponechať ako poľnohospodársku pôdu", landValue: lp ? r0(area * lp) : null, months: "—", risk: "nízke", weight: NONBUILD.test(z) ? 1 : 0.3, note: lp ? `úradná cena pôdy ${lp} €/m² + nájom ~50–100 €/ha ročne` : "úradnú cenu pôdy nemáme", est: !lp });
  }
  return out;
}

/** Monte Carlo pre reziduálnu hodnotu vybraného scenára (seedovaný — PDF je zakaždým rovnaké). */
export function monteCarlo(base: { gdv: number; cost: number; profitPct: number; otherPct: number }, n = 2000): { p10: number; p50: number; p90: number; pLoss: number } {
  let s = 42; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const norm = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = base.gdv * (1 + 0.12 * norm()), c = base.cost * (1 + 0.10 * norm());
    xs.push(g - c - g * base.profitPct / 100 - g * base.otherPct / 100);
  }
  xs.sort((a, b) => a - b);
  return { p10: r0(xs[Math.floor(n * 0.1)]), p50: r0(xs[Math.floor(n * 0.5)]), p90: r0(xs[Math.floor(n * 0.9)]), pLoss: Math.round((xs.filter((x) => x < 0).length / n) * 100) };
}

export function verdict(d: SheetData, fin: FinResult | null, sc: Scenario[]): { word: "KÚPIŤ" | "PODMIENEČNE" | "NEKÚPIŤ" | "NEDÁ SA POSÚDIŤ"; maxPrice: number | null; target: number | null; why: string[] } {
  const g = gates(d); const why = g.map((x) => x.text);
  const value = fin ? (hedonicOf(d, fin.basis)?.value ?? fin.basis.value) : null;
  const best = sc.filter((s) => s.landValue != null && s.key !== "B").sort((a, b) => (b.landValue as number) - (a.landValue as number))[0];
  if (!value && !best?.landValue) return { word: "NEDÁ SA POSÚDIŤ", maxPrice: null, target: null, why: ["chýba odhad hodnoty aj porovnateľné predaje"] };
  const hb = fin ? hedonicOf(d, fin.basis) : null;
  const cap = Math.max(value ?? 0, Math.min(best?.landValue ?? 0, (hb?.high ?? value ?? 0) * 1.15));
  const maxPrice = r0(cap / 500) * 500;
  const price = fin?.basis.price ?? null;
  if (g.some((x) => x.hard)) return { word: "NEKÚPIŤ", maxPrice, target: value, why: [...why.filter((_, i) => g[i].hard), "kúpiť až po vyriešení vylučujúcich podmienok"] };
  if (g.length || (price && price > maxPrice)) return { word: "PODMIENEČNE", maxPrice, target: value, why: [...why, ...(price && price > maxPrice ? [`cena ${r0(price).toLocaleString("sk-SK")} € je nad maximom ${maxPrice.toLocaleString("sk-SK")} €`] : [])] };
  return { word: "KÚPIŤ", maxPrice, target: value, why: ["bez vylučujúcich podmienok v údajoch listu", `najvýhodnejšie využitie: ${best?.label ?? "súčasný stav"}`] };
}

// ——— povoľovanie (nový stavebný zákon 25/2025 v znení 243/2026) ———
export type Study = { name: string; why: string; cost: string; weeks: string };
export function permits(d: SheetData): { studies: Study[]; timeline: { rd: string; bd: string; upChange: boolean }; notes: string[]; legal: [string, string][]; konania: { title: string; url: string | null; date: string | null }[]; uzavera: boolean } {
  const c = d.core; const mk = mainKey(c); const t = mk ? fact(c, "teren", mk) : null; const studies: Study[] = [];
  const sk = typeof t?.sklon_avg === "number" ? (t.sklon_avg as number) : 0;
  const slide = (d.limits?.items ?? []).some((h) => h.hit && h.key === "zosuvy") || (d.ext ?? []).some((e) => e.key === "geo_nachylnost_svahove_pohyby" && riskyHit(e));
  studies.push({ name: "Inžinierskogeologický prieskum", why: slide ? "zosuvné / náchylné územie — nevyhnutný" : sk > 15 ? `sklon ${Math.round(sk)} % — odporúčaný` : "pre založenie stavby", cost: slide || sk > 15 ? "1 500 – 5 000 €" : "600 – 1 500 €", weeks: "3–6" });
  const rad = (d.ext ?? []).find((e) => e.key === "geo_radon"); if (rad && /stredn|vysok/i.test(rad.value ?? "")) studies.push({ name: "Radónový prieskum pozemku", why: `radónové riziko: ${rad.value}`, cost: "150 – 400 €", weeks: "2–4" });
  if (d.limits?.road && d.limits.road.distM < 120 && /I\.|II\.|^I|^II/.test(d.limits.road.trieda)) studies.push({ name: "Hluková štúdia", why: `cesta ${d.limits.road.trieda} vo vzdialenosti ${r0(d.limits.road.distM)} m`, cost: "800 – 2 500 €", weeks: "3–6" });
  if ((d.shade?.center ?? 0) > 3 || (d.limits?.items ?? []).some((h) => h.hit && h.key === "les")) studies.push({ name: "Dendrologický posudok a súhlas na výrub", why: "stromy na pozemku alebo les do 50 m", cost: "200 – 800 € + náhradná výsadba", weeks: "4–8" });
  const pm = fact(c, "pamiatky", `ku:${c.dataset?.ku_code ?? ""}`); const map = mk ? fact(c, "mapa", mk) : null;
  if (Object.keys(c.facts.nkp ?? {}).length || (Array.isArray(map?.ochrana) && (map?.ochrana as string[]).some((x) => /pamiat/i.test(x))) || (Array.isArray(pm?.body) && (pm?.body as unknown[]).length > 20)) studies.push({ name: "Archeologický výskum (rozhodne krajský pamiatkový úrad)", why: "pamiatka alebo historické jadro v okolí", cost: "od stoviek po desaťtisíce € (platí stavebník)", weeks: "4–26" });
  if (c.parcels.some((p) => /orn|trval|záhrad|zahrad|ovocn/i.test(p.use_type ?? ""))) studies.push({ name: "Vyňatie z poľnohospodárskeho pôdneho fondu", why: "poľnohospodárska pôda", cost: "odvod podľa BPEJ + poplatky", weeks: "4–8" });
  if (d.dev?.hpp && d.dev.hpp > 3000) studies.push({ name: "Dopravná / kapacitná štúdia a zisťovacie konanie EIA (podľa veľkosti)", why: `hrubá podlažná plocha ~${r0(d.dev.hpp)} m²`, cost: "2 000 – 8 000 €", weeks: "8–20" });
  studies.push({ name: "Vyjadrenia správcov sietí a záväzné stanoviská dotknutých orgánov", why: "podmienka rozhodnutia o stavebnom zámere", cost: "spravidla bez poplatku", weeks: "4–9" });
  const z = zoneOf(d).name ?? "";
  return {
    studies,
    timeline: { rd: "zákonné lehoty ~2–4 mesiace; v praxi 4–9 mesiacov (pesimisticky 12) vrátane projektu a stanovísk — odhad", bd: "v praxi 9–18 mesiacov, pesimisticky 24+ — odhad", upChange: !!z && NONBUILD.test(z) },
    legal: [
      ["Záväzné stanovisko dotknutého orgánu", "30 dní, pri zložitých stavbách 60 dní; ak orgán nevydá, platí, že nemá pripomienky (25/2025 § 21 ods. 9)"],
      ["Konanie o stavebnom zámere", "30 / 60 dní, vyhradené a líniové stavby 90 dní (§ 58)"],
      ["Ohlásenie stavby / overenie projektu", "30 dní (§ 63) / 30 dní (§ 65)"],
      ["Správny poplatok — rozhodnutie o stavebnom zámere", "rodinný dom 300 €, bytový dom 3–10 bytov 1 000 €, 11–50 bytov 2 000 € (145/1995 pol. 59, stav 1. 11. 2026); kolaudácia 30 % sadzby"],
      ["Územnoplánovacia informácia", "vydáva obec (200/2022 § 40 ods. 13); nie je záväzným stanoviskom, lehotu ani poplatok zákon neurčuje"],
    ],
    konania: (c.obec.changes ?? []).concat(c.obec.upChanges.map((x) => ({ ...x, relevance: "up" })))
      .filter((x) => /stavebn|povolen|kolaud|zámer|zamer|uzáver|uzaver|asanác|odstránen/i.test(x.title ?? "")).slice(0, 8)
      .map((x) => ({ title: x.title ?? "oznámenie", url: x.url, date: x.detected_at })),
    uzavera: [...c.obec.changes, ...c.obec.upChanges].some((x) => /stavebn\w* uzáver|stavebn\w* uzaver/i.test(x.title ?? "")),
    notes: [
      "Od 1. 4. 2025 platí stavebný zákon 25/2025: namiesto územného a stavebného konania je jedno rozhodnutie o stavebnom zámere; zámer sa konzultuje so stavebným úradom a dotknutými orgánmi vopred.",
      "Novela 243/2026 (vyhlásená 7. 10. 2026, zmeny stavebného zákona od 1. 1. 2027): dodatočné povolenie stavieb postavených do 31. 3. 2025 do 31. 12. 2040 (dnes do 31. 3. 2029), užšie drobné stavby (oplotenie do 2 m; budovy pre obchod a služby už nie sú drobné), kolaudácia po etapách.",
      "Verejný register stavebných konaní podľa parcely zatiaľ neexistuje (Portál výstavby ÚÚPV — register stavieb len po prihlásení); konania v okolí sledujeme na úradnej tabuli obce.",
    ],
  };
}

// ——— vysporiadanie vlastníkov (z agregátov LV, bez mien) ———
export function settlement(d: SheetData): { rows: { cat: string; n: number; cost: string; months: string; p: number }[]; totalLow: number; totalHigh: number; months: string; pFull: number } | null {
  const c = d.core; if (!c.lvs.length) return null;
  const agg = { fo: 0, po: 0, obec: 0, stat: 0, nezisteny: 0, zosnuli: 0, zahranicie: 0 };
  for (const lv of c.lvs) { const v = fact(c, "vlastnici", `lv:${lv}`); if (!v) continue;
    agg.po += Number(v.po ?? v.pravnicke ?? 0); agg.obec += Number(v.obec ?? 0); agg.stat += Number(v.stat ?? 0) + Number(v.spf ?? 0); agg.nezisteny += Number(v.nezisteny ?? 0);
    agg.zosnuli += Number(v.pravdepodobne_zosnuli ?? 0); agg.zahranicie += Number(v.zahranicie ?? 0); }
  const persons = c.owners.perLv.reduce((s, l) => s + l.persons, 0);
  agg.fo = Math.max(0, persons - agg.zosnuli - agg.zahranicie);
  if (!agg.po) agg.po = c.owners.perLv.reduce((s, l) => s + l.companies, 0);
  const C: [keyof typeof agg, string, number, number, string, number][] = [
    ["fo", "fyzické osoby s adresou na Slovensku", 150, 400, "1–3", 0.9], ["zahranicie", "fyzické osoby v zahraničí", 400, 1200, "2–6", 0.8], ["zosnuli", "vlastníci s veľmi starým zápisom (možné dedičské konanie)", 800, 2500, "6–18", 0.75],
    ["po", "firmy", 200, 800, "1–4", 0.85], ["obec", "obec (zámer, uznesenie, zverejnenie)", 300, 1000, "2–6", 0.8], ["stat", "štát / SPF", 500, 2000, "6–18", 0.65], ["nezisteny", "nezistený vlastník (SPF / súd)", 2000, 5000, "12–36", 0.55],
  ];
  const rows = C.filter(([k]) => agg[k] > 0).map(([k, cat, lo, hi, m, p]) => ({ cat, n: agg[k], cost: `${(lo * agg[k]).toLocaleString("sk-SK")} – ${(hi * agg[k]).toLocaleString("sk-SK")} €`, months: m, p: Math.pow(p, Math.min(agg[k], 6)) }));
  if (!rows.length) return null;
  const totalLow = C.reduce((s, [k, , lo]) => s + lo * agg[k], 0), totalHigh = C.reduce((s, [k, , , hi]) => s + hi * agg[k], 0);
  const maxM = rows.some((r) => r.months === "12–36") ? "12–36" : rows.some((r) => r.months.includes("18")) ? "6–18" : "1–6";
  return { rows, totalLow, totalHigh, months: maxM, pFull: Math.round(rows.reduce((s, r) => s * r.p, 1) * 100) };
}
