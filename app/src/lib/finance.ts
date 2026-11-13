// LIST NEHNUTEĽNOSTI — FINANCIE (2026-11-13). Čisté výpočty nad dátami listu: hypotéka a limity NBS, vlastné zdroje,
// stresový test, náklady kúpy a vlastníctva, dane, poistenie a riziká, predikcia hodnoty, výnos a vyjednávanie.
// Parametre (zákon, poplatky, sadzby) sú v fin-params.ts so zdrojom a dátumom; trhové údaje (sadzby ECB/NBS, sadzby
// bánk) prichádzajú živo cez getFinanceMarket. Všetko je MODELOVÝ VÝPOČET, nie znalecký posudok ani finančné poradenstvo.
import type { SheetData } from "./property-eval";
import { fact, mainKey } from "./property-eval";
import { FIN, type FinParams } from "./fin-params";
import { DEV_DEFAULTS } from "./development";

export type FinMarket = {
  asOf: string;
  /** priemerné sadzby nových úverov na bývanie v SR podľa fixácie (ECB MIR / NBS), % p. a. */
  rates: { key: string; label: string; pct: number; period: string }[];
  aprc: { pct: number; period: string } | null;
  euribor3m: { pct: number; period: string } | null;
  hicp: { pct: number; period: string } | null;
  /** index cien bývania SR, priemerne ročne za 5 rokov % */
  hpi: { pct: number; period: string } | null;
  /** výnos 10-ročného štátneho dlhopisu SR (ECB IRS) */
  bond10y?: { pct: number; period: string } | null;
  banks: { banka: string; url: string | null; fixacie: Record<string, number>; typ: string | null; podmienky: string | null }[];
  banksAsOf: string | null;
  errors: string[];
};

export type FinInputs = {
  price: number | null;          // kúpna cena (zadaná / ponuka / odhad)
  ltv: number;                   // podiel úveru 0–0.9
  years: number;                 // splatnosť
  fix: number;                   // fixácia v rokoch (1, 3, 5, 10)
  age: number;                   // vek staršieho žiadateľa
  adults: number; children: number;
  rentMonthly: number | null;    // zadaný nájom (inak z trhu)
  persons: number;               // osôb v domácnosti (poplatok za odpad)
};
export const FIN_DEFAULTS: Omit<FinInputs, "price" | "rentMonthly"> = { ltv: 0.8, years: 30, fix: 5, age: 35, adults: 2, children: 0, persons: 2 };

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Anuitná mesačná splátka. */
export function annuity(principal: number, ratePct: number, years: number): number {
  const i = ratePct / 100 / 12, n = Math.max(1, Math.round(years * 12));
  if (principal <= 0) return 0;
  if (i <= 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}
/** Zostatok istiny po k mesiacoch. */
export function balanceAfter(principal: number, ratePct: number, years: number, months: number): number {
  const i = ratePct / 100 / 12, p = annuity(principal, ratePct, years);
  if (i <= 0) return Math.max(0, principal - p * months);
  return Math.max(0, principal * Math.pow(1 + i, months) - (p * (Math.pow(1 + i, months) - 1)) / i);
}
/** Najvyšší úver, ktorý zodpovedá danej splátke. */
export function loanForPayment(payment: number, ratePct: number, years: number): number {
  const i = ratePct / 100 / 12, n = Math.round(years * 12);
  return i <= 0 ? payment * n : (payment * (1 - Math.pow(1 + i, -n))) / i;
}
/** Vnútorná výnosnosť (ročné toky), bisekcia. */
export function irr(flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.9, hi = 1.0;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (npv(lo) * npv(m) <= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

// ——— základ: cena, výmery, typ ———
export type Basis = { price: number | null; priceFrom: string; value: number | null; valueFrom: string; kind: "byt" | "dom" | "pozemok" | "iné";
  floorM2: number | null; landM2: number; footprintM2: number | null; floors: number | null; agri: boolean; buildingType: keyof FinParams["stavba"]["eurM2"] };

export function basisOf(d: SheetData, inp: Partial<FinInputs>): Basis {
  const c = d.core;
  const value = c.compStats?.estimateEur ?? d.avm?.estimate_eur ?? null;
  const valueFrom = c.compStats?.estimateEur ? "odhad z predajov v okolí" : d.avm?.estimate_eur ? "automatický odhad" : "—";
  const ask = c.listings.find((l) => !l.removed && l.price_eur)?.price_eur ?? null;
  const price = inp.price ?? ask ?? value;
  const priceFrom = inp.price ? "zadaná cena" : ask ? "cena v inzeráte" : value ? valueFrom : "—";
  const landM2 = c.parcels.filter((p) => p.register === "C").reduce((s, p) => s + (p.area_m2 ?? 0), 0) || c.parcels.reduce((s, p) => s + (p.area_m2 ?? 0), 0);
  const flatF = Object.entries(c.facts.byty ?? {}).find(([k]) => k.startsWith("flat:"));
  const flatArea = flatF ? Number(JSON.parse(flatF[1])?.vymera_m2 ?? 0) || null : null;
  let kind: Basis["kind"] = "pozemok";
  let footprint: number | null = null, floors: number | null = null;
  let buildingType: Basis["buildingType"] = "rd";
  if (c.kind === "byt" || flatArea) { kind = "byt"; buildingType = "bd"; }
  else if (c.buildings.length) {
    kind = "dom";
    const b = c.buildings[0];
    const p = c.parcels.find((x) => x.parcel_no === b.on_parcel);
    const zb = b.on_parcel ? fact(c, "budovy", `parcel_c:${b.on_parcel}`) : null;     // ZBGIS: obrys strechy a výška
    footprint = typeof zb?.hlavna_m2 === "number" && (zb.hlavna_m2 as number) > 15 ? (zb.hlavna_m2 as number) * 0.92 : p?.area_m2 && /zastav/i.test(p.use_type ?? "") ? Math.min(p.area_m2, 2000) : null;
    const sf = Object.entries(c.facts.stavby ?? {}).map(([, raw]) => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } }).find(Boolean);
    floors = typeof sf?.najvyssie_podlazie === "number" ? Math.max(1, sf.najvyssie_podlazie as number) : typeof zb?.hlavna_podlazia_odhad === "number" ? (zb.hlavna_podlazia_odhad as number) : null;
    const descr = `${b.descr ?? ""} ${String(sf?.druh ?? "")}`.toLowerCase();
    buildingType = /bytov/.test(descr) ? "bd" : /garáž|garaz/.test(descr) ? "garaz" : /chat|rekrea/.test(descr) ? "chata"
      : /hal|sklad|výrob|vyrob|priemys|dieln|prevádz|prevadz|autopark|kotol|kotolň|dielň|technick|poľnohosp|polnohosp|maštaľ|mastal|stodol|silo/.test(descr) ? "hala"
      : /obch|admin|služ|sluz|občian|obcian|škol|skol|úrad|urad|hotel|reštaur|restaur|zdravot|kancel/.test(descr) ? "obchod"
      : /rodinn|dom\b|^ ?dom/.test(descr) ? "rd" : c.buildings.length > 0 && /iná budova|ina budova/.test(descr) ? "obchod" : "rd";
    if (buildingType !== "rd" && buildingType !== "chata") kind = "iné";
  }
  const floorM2 = kind === "byt" ? flatArea : footprint ? footprint * (floors ?? (buildingType === "rd" ? 1.5 : 1)) * 0.82 : null;
  const agri = c.parcels.some((p) => /orn|trval|ttp|záhrad|zahrad|ovocn|vinic|chmeľ|chmel/i.test(p.use_type ?? ""));
  return { price: price ? r0(price) : null, priceFrom, value: value ? r0(value) : null, valueFrom, kind, floorM2: floorM2 ? r0(floorM2) : null, landM2: r0(landM2), footprintM2: footprint, floors, agri, buildingType };
}

// ——— hypotéka ———
export type MortgageResult = {
  rate: number; rateFrom: string; loan: number; down: number; payment: number; totalInterest: number;
  byFix: { fix: string; rate: number; payment: number; from: string }[];
  ownFunds: { down: number; costs: number; reserve: number; total: number };
  income: { netMonthly: number; binding: "DSTI" | "DTI"; stressRate: number; stressPayment: number; zm: number; dtiNote: string; maxLoanByIncome: (net: number) => number };
  stress: { pp: number; rate: number; payment: number; diff: number }[];
  balanceAtFix: number;
  ltvMax: number; maxYears: number;
  blockers: { text: string; why: string }[];
  support: { title: string; text: string; ok: boolean | null }[];
  valueGap: number | null;
  rentVsBuyYears: number | null;
  sensitivity1pp: number;
};

function rateFor(fix: number, m: FinMarket | null): { rate: number; from: string } {
  const b = (m?.banks ?? []).map((x) => x.fixacie[String(fix)]).filter((x): x is number => typeof x === "number" && x > 0.3 && x < 15);
  if (b.length >= 2) return { rate: r2(b.reduce((s, x) => s + x, 0) / b.length), from: `priemer ${b.length} bánk (fixácia ${fix} r., ${m?.banksAsOf?.slice(0, 10) ?? ""})` };
  const key = fix <= 1 ? "fix_do1" : fix <= 5 ? "fix_1_5" : fix <= 10 ? "fix_5_10" : "fix_nad10";
  const e = m?.rates.find((x) => x.key === key) ?? m?.rates.find((x) => x.key === "spolu");
  if (e) return { rate: e.pct, from: `priemer nových úverov v SR (ECB/NBS, ${e.period})` };
  return { rate: FIN.fallbackRatePct, from: `predvolená sadzba ${FIN.fallbackRatePct} % (trhové údaje sa nenačítali)` };
}

export function mortgageOf(d: SheetData, b: Basis, inp: FinInputs, m: FinMarket | null, oneOffCosts: number): MortgageResult | null {
  const price = b.price; if (!price) return null;
  const P = FIN.nbs;
  // od 1. 1. 2027 (opatrenie NBS 3/2026): 90 % len mladí do 35 r. pri prvom bývaní, inak 80 %; 70 % tretia a ďalšia nehnuteľnosť
  const ltvMax = new Date().toISOString().slice(0, 10) >= P.ltv2027.od ? (inp.age <= 35 ? P.ltv2027.mladi35 : P.ltv2027.ostatni) : P.ltvMax;
  const ltv = Math.min(inp.ltv, ltvMax);
  const value = Math.min(price, b.value ?? price);          // banka požičia z nižšej z (ceny, hodnoty podľa znalca)
  const loan = r0(value * ltv);
  const down = r0(price - loan);
  const maxYears = Math.min(P.maxYears, Math.max(5, (P.maxAgeEnd ?? 70) - inp.age));
  const years = Math.min(inp.years, maxYears);
  const { rate, from } = rateFor(inp.fix, m);
  const payment = annuity(loan, rate, years);
  const byFix = [1, 3, 5, 10].map((f) => { const x = rateFor(f, m); return { fix: `${f} r.`, rate: x.rate, payment: r0(annuity(loan, x.rate, years)), from: x.from }; });
  // limity NBS: DSTI (splátka pri sadzbe + prirážka ≤ podiel z príjmu po životnom minime), DTI (úver ≤ násobok ročného čistého príjmu)
  // stres: +2 b. (pri fixácii nad 10 rokov +1 b.), stresovaná sadzba najviac 6 % (ak je sadzba vyššia, platí sadzba)
  const stressRate = Math.max(rate, Math.min(rate + (inp.fix > 10 ? P.stressAddPpFix10 : P.stressAddPp), P.stressCapPct));
  const stressPayment = annuity(loan, stressRate, years);
  const zm = FIN.zivotneMinimum.adult1 + Math.max(0, inp.adults - 1) * FIN.zivotneMinimum.adultNext + inp.children * FIN.zivotneMinimum.child;
  const netDsti = stressPayment / P.dstiMax + zm;
  // DTI 8; od 41 rokov, ak splatnosť presahuje 65. rok veku: 8 − 0,25 × (vek − 40), najmenej 3
  const dti = inp.age >= 41 && inp.age + years > P.dtiAgeEnd ? Math.max(P.dtiMin, P.dtiMax - (Math.floor(inp.age) - P.dtiAgeFrom) * P.dtiAgeStep) : P.dtiMax;
  const netDti = loan / dti / 12;
  const netMonthly = r0(Math.max(netDsti, netDti));
  const maxLoanByIncome = (net: number) => Math.max(0, Math.min(loanForPayment((net - zm) * P.dstiMax, stressRate, years), net * 12 * dti));
  const months = Math.min(inp.fix, years) * 12;
  const balanceAtFix = r0(balanceAfter(loan, rate, years, months));
  const rest = years - Math.min(inp.fix, years);
  const stress = [1, 2, 3].map((pp) => { const p2 = rest > 0 ? annuity(balanceAtFix, rate + pp, rest) : 0; return { pp, rate: r2(rate + pp), payment: r0(p2), diff: r0(p2 - payment) }; });
  const reserve = r0(Math.max(3 * payment, 1500));
  const ownFunds = { down, costs: r0(oneOffCosts), reserve, total: r0(down + oneOffCosts + reserve) };
  const valueGap = b.value && price > b.value ? r0((price - b.value) * ltv) : null;   // o toľko menší úver, ak znalec určí hodnotu = odhad
  // nájom vs. kúpa
  const rentM2 = d.core.market.rent?.rentM2 ?? null;
  const rent = inp.rentMonthly ?? (rentM2 && b.floorM2 ? rentM2 * b.floorM2 : null);
  const rentVsBuyYears = rent ? r2(price / (rent * 12)) : null;
  const sensitivity1pp = r2((1 - loanForPayment(1000, rate + 1, years) / loanForPayment(1000, rate, years)) * 100);
  return {
    rate, rateFrom: from, loan, down, payment: r0(payment), totalInterest: r0(payment * years * 12 - loan), byFix,
    ownFunds, income: { netMonthly, binding: netDsti >= netDti ? "DSTI" : "DTI", stressRate: r2(stressRate), stressPayment: r0(stressPayment), zm: r0(zm),
      dtiNote: dti < P.dtiMax ? `pre vek ${inp.age} rokov je limit ${r2(dti)}-násobok ročného príjmu` : `limit ${P.dtiMax}-násobok ročného čistého príjmu`, maxLoanByIncome },
    stress, balanceAtFix, ltvMax, maxYears, blockers: mortgageBlockers(d, b), support: supportOf(b, inp, loan * rate / 100), valueGap, rentVsBuyYears, sensitivity1pp,
  };
}

/** Čo môže zablokovať alebo predražiť hypotéku — len z údajov listu. */
export function mortgageBlockers(d: SheetData, b: Basis): { text: string; why: string }[] {
  const c = d.core; const out: { text: string; why: string }[] = [];
  const add = (text: string, why: string) => { if (!out.some((x) => x.text === text)) out.push({ text, why }); };
  const tarAll = c.legal.flatMap((l) => l.tarchy.join(" ").toLowerCase());
  const tarN = c.legal.reduce((s, l) => s + l.tarchyCount, 0);
  if (tarN) add("Ťarchy na LV — banka chce prvé poradie záložného práva; staré záložné právo sa musí vyplatiť z kúpnej ceny", `${tarN}× ťarcha alebo poznámka`);
  if (tarAll.some((t) => t.includes("predkup"))) add("Predkupné právo — pred predajom ho treba ponúknuť oprávnenému alebo vymazať", "zapísané na LV");
  if (tarAll.some((t) => t.includes("exekuc")) || c.flags.some((f) => f.kind === "exekucia")) add("Exekúcia — banka neposkytne úver, kým nie je zrušená a vymazaná", "zapísané na LV");
  if (c.flags.some((f) => f.kind === "sudne_konanie" || f.kind === "spochybnene")) add("Súdne konanie / spochybnený zápis — banky spravidla odmietnu", "poznámka na LV");
  if (c.flags.some((f) => f.kind === "rozostavana_stavba")) add("Rozostavaná stavba — iný typ úveru (stavebný), čerpanie po etapách", "zapísané na LV");
  if (c.unregistered.length) add("Stavba bez zápisu v katastri — banka ju neprijme ako zábezpeku, kým sa nezapíše", `${c.unregistered.length}× budova bez zápisu`);
  if (c.parcels.some((p) => p.register === "C" && p.settled === 0)) add("Pozemok pod stavbou má iných vlastníkov (register E) — problém pri zábezpeke", "nevysporiadaný pozemok");
  for (const [, raw] of Object.entries(c.facts.stavby ?? {})) { try { const s = JSON.parse(raw) as Record<string, unknown>; if (s.na_cudzom_pozemku) { add("Stavba stojí na cudzom pozemku — banka chce záložné právo aj na pozemok", "údaj z LV"); break; } } catch { /* */ } }
  const mk = mainKey(c); const pr = mk ? fact(c, "pristup", mk) : null;
  if (pr && /bez/i.test(String(pr.trieda ?? ""))) add("Bez právneho prístupu z verejnej cesty — banka môže odmietnuť; vyrieši vecné bremeno", String(pr.trieda));
  const owners = c.owners.perLv.reduce((s, l) => s + l.count, 0);
  if (owners > 1 && b.kind !== "byt") add("Kúpa len podielu — banky podiel spravidla nefinancujú; potrebný súhlas a predaj všetkých spoluvlastníkov", `${owners} vlastníkov`);
  if (b.agri && b.kind === "pozemok") add("Poľnohospodárska pôda — banky financujú najmä stavebné pozemky v zastavanom území s ÚP na bývanie", "druh pozemku");
  if ((d.limits?.items ?? []).some((h) => h.hit && h.key === "zaplava") || (d.ext ?? []).some((e) => e.key === "voda_zaplava_q5_q1000" && e.status === "hit"))
    add("Záplavové územie — banka vyžaduje poistenie; poisťovňa môže povodeň vylúčiť alebo zvýšiť poistné", "register záplav");
  if ((d.limits?.items ?? []).some((h) => h.hit && h.key === "zosuvy")) add("Zosuvné územie — banka/znalec môže znížiť hodnotu zábezpeky", "register zosuvov");
  return out;
}

function supportOf(b: Basis, inp: FinInputs, interestYear1: number): { title: string; text: string; ok: boolean | null }[] {
  const S = FIN.podpora; const out: { title: string; text: string; ok: boolean | null }[] = [];
  const young = inp.age <= S.bonusVekMax;
  out.push({ title: "Daňový bonus na zaplatené úroky (mladí)", ok: young ? null : false,
    text: young ? `Žiadateľ do ${S.bonusVekMax} rokov s príjmom do ${S.bonusPrijemText} môže ${S.bonusRoky} rokov dostať späť ${S.bonusPct} % zaplatených úrokov, najviac ${S.bonusMaxEur} € ročne (pri tejto hypotéke ~${r0(Math.min(S.bonusMaxEur, interestYear1 * S.bonusPct / 100))} € v prvom roku).`
      : `Bonus je pre žiadateľov do ${S.bonusVekMax} rokov — pri zadanom veku ${inp.age} rokov nárok nevzniká.` });
  const area = b.floorM2; const lim = b.kind === "byt" ? S.sfrbMaxM2 : S.sfrbMaxM2Rd;
  out.push({ title: "Úver zo Štátneho fondu rozvoja bývania", ok: b.kind === "pozemok" ? null : area != null ? area <= lim : null,
    text: `${S.sfrbText}${area != null && b.kind !== "pozemok" ? ` Podlahová plocha tejto nehnuteľnosti je ~${r0(area)} m² (limit ${lim} m²).` : ""}` });
  return out;
}

// ——— náklady kúpy, vlastníctva, dane ———
/** Odmena notára za úschovu peňazí — pásmový sadzobník (vyhl. 31/1993) + DPH. */
export function notaryCustody(price: number): number {
  const F = FIN.poplatky; let fee = 0;
  for (const [od, do_, sadzba] of F.uschovaTarifa as number[][]) { if (price > od) fee += (Math.min(price, do_) - od) * sadzba; }
  return r0(Math.max(F.uschovaMin, fee) * (1 + F.dphNotar));
}
/** Daň FO z príjmu (progresívne pásma 2026). */
export function incomeTaxFO(base: number): number {
  const D = FIN.dane; const h = D.foHranice as number[]; const r = D.foSadzby as number[];
  let tax = 0, prev = 0;
  for (let i = 0; i < r.length; i++) { const top = i < h.length ? h[i] : Infinity; if (base > prev) tax += (Math.min(base, top) - prev) * r[i]; prev = top; }
  return tax;
}
export type CostLine = { label: string; eur: number | null; note: string };
export type CostsResult = { oneOff: CostLine[]; oneOffTotal: number; annual: CostLine[]; annualTotal: number; monthly: number;
  propertyTax: { eur: number | null; detail: string; vzn: string | null };
  saleTax: { text: string; exemptFrom: number | null }; vat: string; build: CostLine[]; buildTotal: number | null; earthworks: { m3: number | null; eur: number | null; note: string } };

export function costsOf(d: SheetData, b: Basis, inp: FinInputs, insurance: InsuranceResult | null, withMortgage: boolean): CostsResult {
  const c = d.core; const F = FIN.poplatky; const price = b.price ?? 0;
  const oneOff: CostLine[] = [
    { label: "Návrh na vklad do katastra", eur: F.vkladEl, note: `elektronicky (listinne ${F.vkladPapier} €; do 15 dní ${F.vkladZrychleny} €)` },
    { label: "Overenie podpisov predávajúcich", eur: F.overeniePodpis * Math.max(1, d.core.owners.perLv.reduce((s, l) => s + l.count, 0)), note: `${F.overeniePodpis} € za podpis na matrike (u notára ${F.overenieNotar} €)` },
    { label: "Notárska úschova kúpnej ceny", eur: notaryCustody(price), note: "odmena notára podľa sadzobníka + DPH (advokát alebo banka podľa dohody)" },
  ];
  if (withMortgage) oneOff.push({ label: "Znalecký posudok pre banku", eur: b.kind === "byt" ? F.znalecByt : b.kind === "pozemok" ? F.znalecPozemok : F.znalecDom, note: "pri hypotéke ho vyžaduje banka" },
    { label: "Poplatok banky za úver a vklad záložného práva", eur: F.vkladEl + F.bankaPoplatok, note: "mnohé banky poplatok za poskytnutie neúčtujú" });
  if (c.parcels.length > 1 && c.parcels.some((p) => p.register === "E")) oneOff.push({ label: "Geometrický plán (ak sa delí alebo zlučuje)", eur: F.geometrickyPlan, note: "len ak sa mení hranica" });
  oneOff.push({ label: "Provízia realitnej kancelárie (ak ju platí kupujúci)", eur: null, note: `bežne ${F.proviziaText}, často ju platí predávajúci` });
  const oneOffTotal = oneOff.reduce((s, x) => s + (x.eur ?? 0), 0);
  // daň z nehnuteľností
  const propertyTax = propertyTaxOf(d, b);
  // ročné
  const annual: CostLine[] = [];
  annual.push({ label: "Daň z nehnuteľností", eur: propertyTax.eur, note: propertyTax.detail });
  const vzn = vznOf(d);
  const odpad = vzn?.odpad?.eur_osoba_rok;
  if (b.kind !== "pozemok") annual.push({ label: "Poplatok za komunálny odpad", eur: typeof odpad === "number" ? r0(odpad * inp.persons) : null, note: typeof odpad === "number" ? `${odpad} € × ${inp.persons} os. (VZN obce)` : "VZN obce nemáme" });
  if (insurance && b.kind !== "pozemok") annual.push({ label: "Poistenie nehnuteľnosti a domácnosti", eur: r0(insurance.premiumMid), note: `odhad ${r0(insurance.premiumLow)}–${r0(insurance.premiumHigh)} €` });
  const dc = d.decl ?? {};
  const fondMes = typeof dc.byt_fond_mes === "number" ? dc.byt_fond_mes : null, zalohyMes = typeof dc.byt_zalohy_mes === "number" ? dc.byt_zalohy_mes : null;
  if (b.kind === "byt" && (fondMes != null || zalohyMes != null)) annual.push({ label: "Fond opráv a zálohy (podľa predávajúceho)", eur: r0(((zalohyMes ?? 0) || (fondMes ?? 0)) * 12), note: `${zalohyMes != null ? `zálohy ${zalohyMes} €/mes.` : ""}${fondMes != null ? ` fond opráv ${fondMes} €/mes.` : ""}`.trim() });
  else if (b.kind === "byt" && b.floorM2) annual.push({ label: "Fond opráv a správa", eur: r0(b.floorM2 * FIN.byty.fondOpravEurM2Mes * 12 + FIN.byty.spravaEurMes * 12), note: `~${FIN.byty.fondOpravEurM2Mes} €/m² mesačne + správa ${FIN.byty.spravaEurMes} € (odhad)` });
  const kol = typeof dc.kol_rok === "number" ? dc.kol_rok : null; const age = kol ? new Date().getFullYear() - kol : null;
  const udrz = age == null ? FIN.udrzbaPct : age < 10 ? 0.75 : age < 30 ? 1.25 : age < 50 ? 2 : 2.5;
  if (insurance?.rebuild && b.kind !== "byt") annual.push({ label: "Údržba a opravy (rezerva)", eur: r0(insurance.rebuild * udrz / 100), note: `${udrz} % z ceny stavby ročne${age != null ? ` (stavba z roku ${kol})` : " (vek stavby neznámy)"}` });
  if (b.floorM2 && b.kind !== "pozemok") {
    const e = energyOf(b, typeof dc.ec_potreba_kwh === "number" ? dc.ec_potreba_kwh : null, typeof dc.ec_trieda === "string" ? dc.ec_trieda : null);
    if (e) annual.push({ label: "Energie (kúrenie, voda, elektrina)", eur: e.eur, note: e.note });
  }
  const annualTotal = annual.reduce((s, x) => s + (x.eur ?? 0), 0);
  // daň pri predaji (pre predávajúceho) — z rokov nadobudnutia
  const nowY = new Date().getFullYear();
  const lastAcq = Math.max(0, ...c.legalYears.map((y) => Math.max(y.sale_max ?? 0, y.gift_max ?? 0)));
  const lastInh = Math.max(0, ...c.legalYears.map((y) => y.inh_max ?? 0));
  let saleTax: CostsResult["saleTax"] = { text: "Rok nadobudnutia nepoznáme — over na výpise z LV (časť B, tituly).", exemptFrom: null };
  if (lastAcq || lastInh) {
    const y = Math.max(lastAcq, lastInh);
    const from = y + FIN.dane.oslobodenieRoky;
    saleTax = from <= nowY
      ? { text: `Posledná zmena vlastníka ${y} → predaj fyzickej osoby je od ${from} spravidla oslobodený od dane z príjmu (5 rokov od nadobudnutia; pri dedení v priamom rade sa ráta aj čas poručiteľa).`, exemptFrom: from }
      : { text: `Posledná zmena vlastníka ${y} → pri predaji pred rokom ${from} platí predávajúci daň z príjmu zo zisku (19 %, pri vysokých príjmoch 25–35 %)${lastInh === y ? ", ak nejde o dedenie v priamom rade" : ""} — tlačí ho to k vyššej cene alebo k odkladu predaja.`, exemptFrom: from };
  }
  const vat = b.kind === "pozemok"
    ? `Predaj pozemku fyzickou osobou je bez DPH. Ak predáva platiteľ DPH stavebný pozemok, pripočíta sa ${r0(FIN.dane.dph * 100)} % DPH.`
    : `Predaj stavby fyzickou osobou je bez DPH. Platiteľ DPH predáva novostavbu do 5 rokov od kolaudácie s DPH ${r0(FIN.dane.dph * 100)} %${FIN.dane.dphBytyText ? ` (${FIN.dane.dphBytyText})` : ""}; neskôr môže byť oslobodený.`;
  // výstavba na pozemku (prípojky, vyňatie, zemné práce)
  const build: CostLine[] = []; let buildTotal: number | null = null;
  const earthworks = earthworksOf(d);
  if (b.kind === "pozemok") {
    const len = (() => { const mk = mainKey(c); const o = mk ? fact(c, "osm", mk) : null; return typeof o?.cesta === "number" ? (o.cesta as number) + 5 : null; })();
    const P = FIN.pripojky;
    build.push({ label: "Prípojka elektriny (poplatok distribučke + kábel)", eur: r0(P.elektrinaPoplatok + (len ?? 20) * P.eurM.elektrina), note: `poplatok ${P.elektrinaPoplatok} € + ~${r0(len ?? 20)} m` });
    build.push({ label: "Prípojka vody", eur: r0(P.vodaPoplatok + (len ?? 20) * P.eurM.voda), note: `~${r0(len ?? 20)} m` });
    build.push({ label: "Kanalizácia (prípojka alebo ČOV/žumpa)", eur: r0(P.kanalPoplatok + (len ?? 20) * P.eurM.kanal), note: "ak je v ulici verejná kanalizácia" });
    const ob = fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`);
    if (ob?.plyn_obec !== false) build.push({ label: "Prípojka plynu (ak je plyn v ulici)", eur: r0(P.plynPoplatok + (len ?? 20) * P.eurM.plyn), note: "voliteľné" });
    const odv = c.parcels.reduce((s, p) => s + (p.odnatie_eur ?? 0), 0);
    if (b.agri) build.push({ label: "Odvod za vyňatie z pôdneho fondu", eur: odv ? r0(odv) : null, note: odv ? "podľa BPEJ a výmery (pri dome sa vynímá len zastavaná časť)" : "BPEJ neznáme" });
    if (earthworks.eur) build.push({ label: "Zemné práce pre dom 10 × 12 m", eur: earthworks.eur, note: earthworks.note });
    build.push({ label: "Projekt, inžinierska činnosť, geodet, povolenie", eur: FIN.vystavba.projektPovolenie, note: "orientačne pre rodinný dom" });
    buildTotal = r0(build.reduce((s, x) => s + (x.eur ?? 0), 0));
  }
  return { oneOff, oneOffTotal: r0(oneOffTotal), annual, annualTotal: r0(annualTotal), monthly: r0(annualTotal / 12), propertyTax, saleTax, vat, build, buildTotal, earthworks };
}

type Vzn = { dan?: Record<string, unknown> & { vzn?: string; pozemky_pct?: Record<string, number>; stavby_eur_m2?: Record<string, number>; byty_eur_m2?: number; priplatok_podlazie_eur_m2?: number; hodnota_pozemku_eur_m2?: Record<string, number> | null }; odpad?: { eur_osoba_rok?: number; vzn?: string } };
export function vznOf(d: SheetData): Vzn | null {
  const f = fact(d.core, "vzn", `ku:${d.core.dataset?.ku_code ?? ""}`);
  return f ? (f as unknown as Vzn) : null;
}

/** Daň z nehnuteľností: pozemky = výmera × hodnota (príloha zákona 582/2004 / VZN) × sadzba %; stavby = zastavaná plocha × sadzba €/m² (+ príplatok za podlažie); byty = podlahová plocha × sadzba. */
export function propertyTaxOf(d: SheetData, b: Basis): { eur: number | null; detail: string; vzn: string | null } {
  const v = vznOf(d); const dan = v?.dan;
  if (!dan) return { eur: null, detail: "sadzby z VZN obce zatiaľ nemáme", vzn: null };
  const kod = d.core.dataset?.ku_code ?? "";
  const H = FIN.hodnotaPozemku;
  const pct = dan.pozemky_pct ?? {};
  const pop = Number(fact(d.core, "obec", `ku:${kod}`)?.obyv ?? 0);
  const obecN = String(fact(d.core, "obec", `ku:${kod}`)?.obec ?? "");
  const band = (H.sidlaKrajov.includes(obecN) && H.sidloKraja) || (H.sidlaOkresov.includes(obecN) && H.sidloOkresu) || (H.pasma.find((p) => pop <= p.doObyv) ?? H.pasma[H.pasma.length - 1]);
  const own = dan.hodnota_pozemku_eur_m2 ?? {};
  let sum = 0; const parts: string[] = []; let unknown = false;
  for (const p of d.core.parcels) {
    const u = (p.use_type ?? "").toLowerCase(); const a = p.area_m2 ?? 0; if (!a) continue;
    let val: number | null = null, rate: number | null = null;
    if (/orn|trval|ttp|chmeľ|chmel|vinic|ovocn/.test(u)) { val = (H.ornaTtp as Record<string, { orna: number; ttp: number }>)[kod]?.[/trval|ttp/.test(u) ? "ttp" : "orna"] ?? null; rate = pct.orna_ttp ?? null; }
    else if (/záhrad|zahrad/.test(u)) { val = own.zahrady ?? band.zahrady; rate = pct.zahrady ?? null; }
    else if (/zastav/.test(u)) { val = own.zastavane ?? band.zastavane; rate = pct.zastavane ?? null; }
    else if (/les/.test(u)) { val = own.lesne ?? H.lesneDefault; rate = pct.lesne ?? null; }
    else { val = own.ostatne ?? band.ostatne; rate = pct.ostatne ?? null; }
    if (val == null || rate == null) { unknown = true; continue; }
    sum += a * val * rate / 100;
  }
  if (sum) parts.push(`pozemky ~${r0(sum)} €`);
  const st = dan.stavby_eur_m2 ?? {};
  if (b.kind === "byt" && b.floorM2 && typeof dan.byty_eur_m2 === "number") { const t = b.floorM2 * dan.byty_eur_m2; sum += t; parts.push(`byt ${r0(b.floorM2)} m² × ${dan.byty_eur_m2} € = ${r0(t)} €`); }
  else if (b.footprintM2) {
    const key = b.buildingType === "rd" ? "byvanie" : b.buildingType === "chata" ? "rekreacia" : b.buildingType === "garaz" ? "garaze" : b.buildingType === "hala" ? "priemysel" : b.buildingType === "obchod" ? "podnikanie" : "ostatne";
    const rate = st[key] ?? st.ostatne;
    if (typeof rate === "number") { const fl = Math.max(0, (b.floors ?? 1) - 1); const t = b.footprintM2 * rate + fl * b.footprintM2 * (dan.priplatok_podlazie_eur_m2 ?? 0); sum += t; parts.push(`stavba ${r0(b.footprintM2)} m² × ${rate} €${fl ? ` + príplatok za ${fl} podl.` : ""} = ${r0(t)} €`); }
    else unknown = true;
  }
  return { eur: sum ? r0(sum) : null, detail: `${parts.join(" · ") || "—"}${unknown ? " · časť sadzieb chýba" : ""} (VZN ${dan.vzn ?? "obce"})`, vzn: dan.vzn ?? null };
}

const EC_KWH: Record<string, number> = { A0: 30, A1: 50, B: 90, C: 130, D: 170, E: 210, F: 260, G: 320 };
function energyOf(b: Basis, potreba: number | null = null, trieda: string | null = null): { eur: number; note: string } | null {
  if (!b.floorM2) return null;
  const E = FIN.energie;
  const perM2 = potreba ?? (trieda && EC_KWH[trieda] ? EC_KWH[trieda] * 0.7 : b.kind === "byt" ? E.kurenieKwhM2Byt : E.kurenieKwhM2Dom);
  const heat = b.floorM2 * perM2;
  const eur = heat * (b.kind === "byt" ? E.teploEurKwh : E.plynEurKwh) + E.elektrinaKwhRok * E.elektrinaEurKwh + E.elektrinaStalaMes * 12;
  return { eur: r0(eur), note: `~${r0(heat)} kWh kúrenie${potreba ? " (z energetického certifikátu)" : trieda ? ` (trieda ${trieda})` : " (priemerný stav stavby)"} + ${E.elektrinaKwhRok} kWh elektrina, ceny ${E.stavK}` };
}

/** Zemné práce: z prevýšenia pod modelovým domom 10 × 12 m (terén DMR 5.0) — výkop/násyp na vyrovnanie + základy. */
export function earthworksOf(d: SheetData): { m3: number | null; eur: number | null; note: string } {
  const mk = mainKey(d.core); const t = mk ? fact(d.core, "teren", mk) : null;
  const prev = typeof t?.dom_prev === "number" ? (t.dom_prev as number) : null;
  if (prev == null) return { m3: null, eur: null, note: "terén pod domom nemáme" };
  const m3 = r0(120 * (prev / 2) + 120 * 0.6);       // vyrovnanie (priemerná hĺbka = polovica prevýšenia) + základy a skrývka
  return { m3, eur: r0(m3 * FIN.vystavba.zemnePraceEurM3), note: `prevýšenie pod domom ${r2(prev)} m → ~${m3} m³ × ${FIN.vystavba.zemnePraceEurM3} €/m³` };
}

// ——— poistenie a riziká ———
const FIN_KRAJ_OBYV = 686063;   // Žilinský kraj 2025 (Eurostat demo_r_pjangrp3)
export type InsuranceResult = { rebuild: number | null; rebuildNote: string; premiumLow: number; premiumMid: number; premiumHigh: number;
  domacnost: number | null; risks: { label: string; level: "nízke" | "stredné" | "vysoké" | "neznáme"; impact: string }[]; mult: number };

export function insuranceOf(d: SheetData, b: Basis): InsuranceResult | null {
  if (b.kind === "pozemok") return { rebuild: null, rebuildNote: "pozemok bez stavby — poistenie zodpovednosti vlastníka", premiumLow: FIN.poistenie.zodpovednostEur, premiumMid: FIN.poistenie.zodpovednostEur, premiumHigh: FIN.poistenie.zodpovednostEur * 2, domacnost: null, risks: risksOf(d), mult: 1 };
  const eurM2 = FIN.stavba.eurM2[b.buildingType];
  const area = b.kind === "byt" ? b.floorM2 : b.footprintM2 ? b.footprintM2 * (b.floors ?? (b.buildingType === "rd" ? 1.5 : 1)) : null;
  const rebuild = area ? r0(area * eurM2) : null;
  const risks = risksOf(d);
  const mult = risks.reduce((m, r) => m * (r.level === "vysoké" ? 1.5 : r.level === "stredné" ? 1.15 : 1), 1);
  const base = rebuild ? rebuild * FIN.poistenie.nehnPromile / 1000 : 0;
  const dom = b.floorM2 ? r0(b.floorM2 * FIN.poistenie.domacnostEurM2 * FIN.poistenie.domacnostPromile / 1000) : null;
  const mid = base * mult + (dom ?? 0);
  return { rebuild, rebuildNote: area ? `${r0(area)} m² × ${eurM2} €/m² (${FIN.stavba.stavK})` : "rozmery stavby nemáme", premiumLow: r0(mid * 0.75), premiumMid: r0(mid), premiumHigh: r0(mid * 1.4), domacnost: dom, risks, mult: r2(mult) };
}

export function risksOf(d: SheetData): InsuranceResult["risks"] {
  const c = d.core; const kod = c.dataset?.ku_code ?? "";
  const hit = (k: string) => (d.limits?.items ?? []).some((h) => h.hit && h.key === k);
  const ex = (k: string) => (d.ext ?? []).find((e) => e.key === k);
  const out: InsuranceResult["risks"] = [];
  const zap = ex("voda_zaplava_q5_q1000");
  out.push({ label: "Povodeň / záplava", level: hit("zaplava") || zap?.status === "hit" ? "vysoké" : zap || d.limits ? "nízke" : "neznáme",
    impact: hit("zaplava") || zap?.status === "hit" ? "poisťovne môžu povodeň vylúčiť alebo zvýšiť poistné; banka chce poistenie" : "mimo známych záplavových území" });
  const nach = ex("geo_nachylnost_svahove_pohyby");
  out.push({ label: "Zosuv pôdy", level: hit("zosuvy") ? "vysoké" : nach?.status === "hit" && !/stabiln/i.test(nach.value ?? "") ? (/vysok/i.test(nach.value ?? "") ? "vysoké" : "stredné") : nach ? "nízke" : "neznáme",
    impact: "zosuv poistky často kryjú len obmedzene; pri stavbe inžinierskogeologický prieskum" });
  const n = fact(c, "normy", `ku:${kod}`);
  const seiz = (n?.seizmicita ?? null) as { agr_hlavna_ms2?: number } | null;
  const agR = typeof seiz?.agr_hlavna_ms2 === "number" ? seiz.agr_hlavna_ms2 : NaN;
  out.push({ label: "Zemetrasenie", level: Number.isFinite(agR) ? (agR >= 0.6 ? "stredné" : "nízke") : "neznáme", impact: Number.isFinite(agR) ? `seizmické zrýchlenie podložia ${agR} m/s² (STN EN 1998)` : "seizmickú oblasť nemáme" });
  const sn = (n?.snih ?? null) as { zona_hlavna?: string; sk_rozsah_kn_m2?: number[] } | null;
  if (sn?.zona_hlavna) out.push({ label: "Sneh a vietor", level: Number(sn.zona_hlavna) >= 4 ? "stredné" : "nízke", impact: `snehová oblasť ${sn.zona_hlavna}${Array.isArray(sn.sk_rozsah_kn_m2) ? ` (zaťaženie ${sn.sk_rozsah_kn_m2.join("–")} kN/m²)` : ""} podľa STN EN 1991-1-3 — vyššia oblasť = pevnejšia strecha` });
  const ob = fact(c, "obec", `ku:${kod}`);
  const krKraj = typeof ob?.kriminalita_kraj_zistene_2025 === "number" ? (ob.kriminalita_kraj_zistene_2025 as number) : null;
  const krObvod = ob?.kriminalita_zistene_2025 != null ? String(ob.kriminalita_zistene_2025) : null;
  const krRate = krKraj ? (krKraj / FIN_KRAJ_OBYV) * 1000 : null;
  out.push({ label: "Krádež a vandalizmus", level: krRate == null ? "neznáme" : krRate > 15 ? "stredné" : "nízke",
    impact: krRate == null ? "štatistiku nemáme" : `kraj ${r2(krRate)} zistených trestných činov na 1 000 obyvateľov (2025)${krObvod ? `; ${String(ob?.kriminalita_obvod ?? "obvod")}: ${krObvod}` : ""}${ob?.kriminalita_objasnenost_pct != null ? `, objasnenosť ${String(ob.kriminalita_objasnenost_pct)} %` : ""}` });
  const rad = ex("geo_radon");
  if (rad) out.push({ label: "Radón", level: /vysok/i.test(rad.value ?? "") ? "vysoké" : /stredn/i.test(rad.value ?? "") ? "stredné" : "nízke", impact: "nepoisťuje sa — rieši sa izoláciou a vetraním" });
  const mk = mainKey(c); const osm = mk ? fact(c, "osm", mk) : null;
  if (typeof osm?.hasic === "number") out.push({ label: "Požiar — dojazd hasičov", level: (osm.hasic as number) > 15000 ? "stredné" : "nízke", impact: `hasičská stanica ${r0((osm.hasic as number) / 100) / 10} km` });
  out.push({ label: "Klimatické riziko do roku 2050", level: "neznáme", impact: "otvorený zdroj s modelom pre parcelu zatiaľ nemáme" });
  return out;
}

// ——— predikcia hodnoty ———
export type PredictionResult = { trendCagr: number | null; wageCagr: number | null; base: number; spread: number; years: number[];
  scenarios: { key: "pes" | "zak" | "opt"; label: string; cagr: number; values: number[] }[]; real5: number | null; rateSens: number; drivers: { text: string; sign: 1 | -1 | 0 }[]; basis: number; method: string };

export function predictionOf(d: SheetData, b: Basis, m: FinMarket | null, mort: MortgageResult | null): PredictionResult | null {
  const v0 = b.value ?? b.price; if (!v0) return null;
  const tr = d.core.market.trend.filter((t) => t.medPpm2 && t.n >= 4).sort((a, b2) => a.year - b2.year).slice(-7);
  let trendCagr: number | null = null, sd = 0.03;
  if (tr.length >= 3) {
    const xs = tr.map((t) => t.year), ys = tr.map((t) => Math.log(t.medPpm2 as number));
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - mx) ** 2, 0));
    trendCagr = Math.exp(slope) - 1;
    const res = ys.map((y, i) => y - (my + slope * (xs[i] - mx)));
    sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / Math.max(1, res.length - 2));
  }
  const ob = fact(d.core, "obec", `ku:${d.core.dataset?.ku_code ?? ""}`);
  const w = Number(ob?.mzda_okres_eur ?? 0), w10 = Number(ob?.mzda_okres_10r_eur ?? 0);
  const wageCagr = w > 0 && w10 > 0 ? Math.pow(w / w10, 1 / 10) - 1 : null;
  const hpi = m?.hpi ? m.hpi.pct / 100 : null;
  // vážený priemer: dlhodobo rastú ceny bývania približne s mzdami → mzdy 50 %, index cien SR 25 %, trend zmlúv v okrese 25 %
  // (trend z málo zmlúv býva rozkolísaný → orezaný na −3 … +8 %); výsledok obmedzený na −2 … +6 % ročne
  const parts: [number | null, number][] = [[wageCagr, 0.5], [hpi, 0.25], [trendCagr != null ? Math.max(-0.03, Math.min(0.08, trendCagr)) : null, 0.25]];
  const wsum = parts.reduce((s, [x, w]) => s + (x != null ? w : 0), 0);
  const base = wsum ? Math.max(-0.02, Math.min(0.06, parts.reduce((s, [x, w]) => s + (x != null ? x * w : 0), 0) / wsum)) : 0.03;
  const spread = Math.max(0.015, Math.min(0.05, sd));
  const years = [1, 3, 5, 10];
  const sc = (k: "pes" | "zak" | "opt", label: string, g: number) => ({ key: k, label, cagr: r2(g * 100), values: years.map((y) => r0((v0 * Math.pow(1 + g, y)) / 100) * 100) });
  const infl = m?.hicp ? m.hicp.pct / 100 : 0.03;
  const drivers: PredictionResult["drivers"] = [];
  const obyvT = Number(ob?.obyv_trend_10r_pct ?? NaN);
  if (Number.isFinite(obyvT)) drivers.push({ text: `počet obyvateľov obce za 10 rokov ${obyvT > 0 ? "+" : ""}${r2(obyvT)} %`, sign: obyvT > 1 ? 1 : obyvT < -2 ? -1 : 0 });
  if (wageCagr != null) drivers.push({ text: `mzdy v okrese rastú ~${r2(wageCagr * 100)} % ročne`, sign: wageCagr > 0.03 ? 1 : 0 });
  const cons = d.core.construction.ku?.new_ha; if (cons) drivers.push({ text: `nová zástavba v k.ú. ${r2(cons)} ha (rastúca lokalita, ale aj konkurencia ponuky)`, sign: 0 });
  const eia = fact(d.core, "eia", `ku:${d.core.dataset?.ku_code ?? ""}`);
  const projs = Array.isArray(eia?.projekty) ? (eia?.projekty as { n?: string }[]) : [];
  const road = projs.find((p) => /diaľnic|rýchlostn|obchvat|cest/i.test(p.n ?? "")); if (road) drivers.push({ text: `dopravný zámer v obci: ${String(road.n).slice(0, 80)}`, sign: 1 });
  const ind = projs.find((p) => /priemysel|logist|hala|park/i.test(p.n ?? "")); if (ind) drivers.push({ text: `priemyselný/logistický zámer: ${String(ind.n).slice(0, 80)} (pracovné miesta, ale aj doprava a hluk)`, sign: 0 });
  if (mort) drivers.push({ text: `sadzby +1 bod = o ${mort.sensitivity1pp} % menší úver pri rovnakej splátke (tlak na ceny)`, sign: -1 });
  return { trendCagr: trendCagr != null ? r2(trendCagr * 100) : null, wageCagr: wageCagr != null ? r2(wageCagr * 100) : null, base: r2(base * 100), spread: r2(spread * 100), years,
    scenarios: [sc("pes", "Horší", base - spread), sc("zak", "Základný", base), sc("opt", "Lepší", base + spread)],
    real5: r0((v0 * Math.pow((1 + base) / (1 + infl), 5)) / 100) * 100, rateSens: mort?.sensitivity1pp ?? 0, drivers, basis: v0,
    method: `Vážený priemer: rast miezd v okrese${wageCagr != null ? ` ${r2(wageCagr * 100)} %` : ""} (50 %), index cien bývania SR${hpi != null ? ` ${r2(hpi * 100)} %` : ""} za 5 rokov (25 %), trend cien zo zmlúv v okrese${trendCagr != null ? ` ${r2(trendCagr * 100)} %` : ""} (25 %, orezaný na −3 až +8 %); výsledok najviac 6 % ročne; rozpätie z kolísania trendu (±${r2(spread * 100)} bodu).` };
}

// ——— investícia, výnos, vyjednávanie ———
export type InvestResult = { rent: number | null; rentFrom: string; gross: number | null; net: number | null; netIncome: number | null; cashOnCash: number | null; monthlyCF: number | null; irr10: number | null;
  payback: number | null; maxPrice: { yieldPct: number; price: number }[]; foVsSro: { label: string; fo: string; sro: string }[]; residual: { gdv: number; cost: number; profit: number; land: number; saleM2: number } | null;
  offer: { low: number; high: number; args: string[] } | null; daysOnMarket: number | null; cuts: number | null };

export function investOf(d: SheetData, b: Basis, inp: FinInputs, costs: CostsResult, mort: MortgageResult | null, pred: PredictionResult | null): InvestResult {
  const c = d.core; const price = b.price;
  const loc = (c.rentals ?? []).map((l) => l.ppm2).filter((x): x is number => x != null && x > 1 && x < 40).sort((a, b2) => a - b2);
  const locM2 = loc.length >= 3 ? loc[Math.floor(loc.length / 2)] : null;
  const rentM2 = locM2 ?? c.market.rent?.rentM2 ?? null;
  const rent = inp.rentMonthly ?? (rentM2 && b.floorM2 && b.kind !== "pozemok" ? r0(rentM2 * b.floorM2) : null);
  const rentFrom = inp.rentMonthly ? "zadaný nájom" : rent ? `${locM2 ? `medián ${loc.length} ponúk nájmu v okolí` : "medián ponúk nájmu v okrese"} ${r2(rentM2 ?? 0)} €/m² × ${r0(b.floorM2 ?? 0)} m²` : "nájom pre tento typ nemáme";
  let gross: number | null = null, net: number | null = null, netIncome: number | null = null, coc: number | null = null, cf: number | null = null, irr10: number | null = null, payback: number | null = null;
  const vac = FIN.investicia.neobsadenostMes;
  if (rent && price) {
    gross = r2((rent * 12) / price * 100);
    const ownerCosts = costs.annual.filter((x) => !/energie|odpad/i.test(x.label)).reduce((s, x) => s + (x.eur ?? 0), 0);
    const income = rent * (12 - vac);
    const taxable = Math.max(0, income - FIN.dane.najomOslobodene - ownerCosts);
    const tax = taxable * FIN.dane.foSadzba1;
    netIncome = r0(income - ownerCosts - tax);
    net = r2(netIncome / (price + costs.oneOffTotal) * 100);
    payback = netIncome > 0 ? r2((price + costs.oneOffTotal) / netIncome) : null;
    if (mort) {
      const equity = mort.ownFunds.down + costs.oneOffTotal;
      const yearlyDebt = mort.payment * 12;
      cf = r0((netIncome - yearlyDebt) / 12);
      coc = equity > 0 ? r2(((netIncome - yearlyDebt + (mort.loan - balanceAfter(mort.loan, mort.rate, 30, 12))) / equity) * 100) : null;
      const sale10 = pred ? pred.scenarios[1].values[3] : price;
      const bal10 = balanceAfter(mort.loan, mort.rate, 30, 120);
      const flows = [-equity, ...Array.from({ length: 9 }, () => netIncome! - yearlyDebt), netIncome - yearlyDebt + sale10 * (1 - FIN.investicia.predajNakladyPct / 100) - bal10];
      const x = irr(flows); irr10 = x != null ? r2(x * 100) : null;
    } else if (pred) {
      const sale10 = pred.scenarios[1].values[3];
      const x = irr([-(price + costs.oneOffTotal), ...Array.from({ length: 9 }, () => netIncome!), netIncome + sale10 * (1 - FIN.investicia.predajNakladyPct / 100)]); irr10 = x != null ? r2(x * 100) : null;
    }
  }
  const maxPrice = netIncome && netIncome > 0 ? [4, 5, 6, 7].map((y) => ({ yieldPct: y, price: r0((netIncome! / (y / 100) - costs.oneOffTotal) / 1000) * 1000 })) : [];
  const D = FIN.dane;
  const foVsSro = [
    { label: "Daň z nájmu", fo: `${r0(D.foSadzba1 * 100)} % (pri vysokých príjmoch až 35 %) zo zisku nad ${D.najomOslobodene} € ročne; len preukázateľné výdavky`, sro: `${D.poSadzbaText}; výplata zisku: daň z dividend ${r0(D.dividendy * 100)} % + zdravotné ${r0(D.dividendyZp * 100)} %` },
    { label: "Odpisy stavby", fo: "nie (ak nehnuteľnosť nie je v podnikaní)", sro: `áno — ${D.odpisyText}` },
    { label: "Predaj po 5 rokoch", fo: "spravidla oslobodený od dane", sro: `zisk sa zdaňuje (${D.poSadzbaText})` },
    { label: "DPH", fo: "nie", sro: "platiteľ DPH: predaj novostavby do 5 rokov s DPH; prenájom bytov spravidla oslobodený" },
    { label: "Náklady správy", fo: "nízke", sro: "účtovníctvo, závierka, daňové priznanie" },
  ];
  // zostatková hodnota pre developera
  let residual: InvestResult["residual"] = null;
  if (d.dev?.cpp && d.dev.hpp) {
    // hodnota projektu = čistá predajná plocha × cena nových bytov (nie cena pozemkov); náklady = HPP × náklady výstavby
    const saleM2 = c.market.rent?.ptype === "byt" && c.market.rent.saleM2 ? c.market.rent.saleM2 * 1.15 : DEV_DEFAULTS.predajEurM2;
    const gdv = d.dev.cpp * saleM2, cost = d.dev.hpp * FIN.vystavba.developerEurM2Hpp, profit = gdv * FIN.vystavba.developerZiskPct / 100;
    const land = gdv - cost - profit - gdv * FIN.vystavba.developerVedlajsiePct / 100;
    residual = { gdv: r0(gdv), cost: r0(cost), profit: r0(profit), land: r0(land), saleM2: r0(saleM2) };
  }
  // vyjednávanie
  const L = c.listings.find((l) => !l.removed && l.price_eur);
  const daysOnMarket = L?.first_seen ? Math.round((Date.now() - new Date(L.first_seen).getTime()) / 864e5) : null;
  const cuts = L && L.history.length > 1 ? r2((1 - (L.history[L.history.length - 1].price_eur ?? 0) / (L.history[0].price_eur ?? 1)) * 100) : null;
  let offer: InvestResult["offer"] = null;
  const est = b.value;
  if (price && (L || est)) {
    const args: string[] = []; let k = 1;
    const ask = L?.price_eur ?? price;
    if (est && ask > est * 1.05) { args.push(`ponuka je o ${r0((ask / est - 1) * 100)} % nad odhadom z reálnych predajov v okolí (${r0(est).toLocaleString("sk-SK")} €)`); k -= 0.04; }
    if (daysOnMarket != null && daysOnMarket > (c.market.domDays?.median ?? 90)) { args.push(`inzerát je online ${daysOnMarket} dní (bežne ${c.market.domDays?.median ?? "~90"} dní)`); k -= 0.03; }
    if (cuts && cuts > 0) { args.push(`cena už klesla o ${cuts} %`); k -= 0.01; }
    const tarN = c.legal.reduce((s, l) => s + l.tarchyCount, 0); if (tarN) { args.push(`${tarN}× ťarcha na LV — treba vyplatiť a vymazať (náklad a riziko predávajúceho)`); k -= 0.01; }
    if (costs.saleTax.exemptFrom && costs.saleTax.exemptFrom > new Date().getFullYear()) args.push(`predávajúci by teraz platil daň z predaja (oslobodenie od ${costs.saleTax.exemptFrom}) — počíta s vyššou cenou`);
    const owners = c.owners.perLv.reduce((s, l) => s + l.count, 0); if (owners >= 3) { args.push(`${owners} spoluvlastníkov — rýchla dohoda a istota platby sú pre nich hodnota`); k -= 0.02; }
    const inh = Math.max(0, ...c.legalYears.map((y) => y.inh_max ?? 0)); if (inh && new Date().getFullYear() - inh <= 3) args.push(`nedávne dedičstvo (${inh}) — dedičia často preferujú rýchly predaj`);
    if (mort?.blockers.length) { args.push(`prekážky financovania (${mort.blockers.length}) znižujú okruh kupujúcich`); k -= 0.02; }
    const base = est ? Math.min(ask, est * 1.02) : ask;
    offer = { low: r0((base * Math.max(0.82, k - 0.04)) / 500) * 500, high: r0((base * Math.max(0.86, k)) / 500) * 500, args };
  }
  return { rent, rentFrom, gross, net, netIncome, cashOnCash: coc, monthlyCF: cf, irr10, payback, maxPrice, foVsSro, residual, offer, daysOnMarket, cuts };
}

// ——— všetko naraz ———
export type FinResult = { inputs: FinInputs; basis: Basis; mortgage: MortgageResult | null; costs: CostsResult; insurance: InsuranceResult | null; prediction: PredictionResult | null; invest: InvestResult; market: FinMarket | null; params: { asOf: string } };

export function financeOf(d: SheetData, m: FinMarket | null, partial: Partial<FinInputs> = {}): FinResult {
  const b = basisOf(d, partial);
  const inputs: FinInputs = { ...FIN_DEFAULTS, price: b.price, rentMonthly: null, ...partial } as FinInputs;
  const ins = insuranceOf(d, b);
  const costs = costsOf(d, b, inputs, ins, inputs.ltv > 0);
  const mort = mortgageOf(d, b, inputs, m, costs.oneOffTotal);
  const pred = predictionOf(d, b, m, mort);
  const invest = investOf(d, b, inputs, costs, mort, pred);
  return { inputs, basis: b, mortgage: mort, costs, insurance: ins, prediction: pred, invest, market: m, params: { asOf: FIN.asOf } };
}

/** Citlivosť: čo sa stane s výsledkom pri zmene ceny, nájmu a sadzby. */
export function sensitivityOf(d: SheetData, m: FinMarket | null, partial: Partial<FinInputs>): { label: string; payment: number | null; net: number | null; irr: number | null }[] {
  const base = financeOf(d, m, partial);
  const p0 = base.inputs.price; const r0_ = base.invest.rent;
  const runs: [string, Partial<FinInputs>][] = [["Základ", {}], ["Cena −10 %", { price: p0 ? p0 * 0.9 : null }], ["Cena +10 %", { price: p0 ? p0 * 1.1 : null }],
    ["Nájom −10 %", { rentMonthly: r0_ ? r0_ * 0.9 : null }], ["Nájom +10 %", { rentMonthly: r0_ ? r0_ * 1.1 : null }]];
  const out = runs.map(([label, ch]) => { const f = financeOf(d, m, { ...partial, ...ch }); return { label, payment: f.mortgage?.payment ?? null, net: f.invest.net, irr: f.invest.irr10 }; });
  // sadzba +1 bod: posun trhových sadzieb
  if (m) {
    const m2: FinMarket = { ...m, rates: m.rates.map((x) => ({ ...x, pct: x.pct + 1 })), banks: m.banks.map((b) => ({ ...b, fixacie: Object.fromEntries(Object.entries(b.fixacie).map(([k, v]) => [k, v + 1])) })) };
    const f = financeOf(d, m2, partial); out.push({ label: "Sadzby +1 bod", payment: f.mortgage?.payment ?? null, net: f.invest.net, irr: f.invest.irr10 });
  }
  return out;
}

/** Hedonický odhad: porovnateľné predaje upravené na dnešné ceny (trend okresu), rozdiel vo výmere (pružnosť −0,2)
 *  a vážené blízkosťou a čerstvosťou. Výsledok €/m² (vážený medián) a rozpätie (vážený 25.–75. percentil). */
export function hedonicOf(d: SheetData, b: Basis): { ppm2: number; low: number; high: number; value: number; n: number; g: number } | null {
  const c = d.core; const area = b.kind === "byt" ? b.floorM2 : b.landM2;
  if (!area) return null;
  const tr = c.market.trend.filter((t) => t.medPpm2 && t.n >= 4).sort((x, y) => x.year - y.year).slice(-6);
  let g = 0.04;
  if (tr.length >= 3) { const a0 = tr[0], a1 = tr[tr.length - 1]; g = Math.max(-0.03, Math.min(0.08, Math.pow((a1.medPpm2 as number) / (a0.medPpm2 as number), 1 / Math.max(1, a1.year - a0.year)) - 1)); }
  const now = Date.now();
  const rows = c.comparables.map((x) => {
    const a = b.kind === "byt" ? x.flat_m2 : x.land_m2; if (!x.ppm2 || !a) return null;
    const yrs = Math.max(0, (now - Date.parse(x.cas)) / 3.156e10);
    const adj = x.ppm2 * Math.pow(1 + g, yrs) * Math.pow(area / a, -0.2);
    const w = (1 / (1 + (x.distM ?? 5000) / 1000)) * (1 / (1 + yrs / 3));
    return { v: adj, w };
  }).filter((x): x is { v: number; w: number } => !!x && Number.isFinite(x.v) && x.v > 0).sort((p, q) => p.v - q.v);
  if (rows.length < 3) return null;
  const tot = rows.reduce((s, x) => s + x.w, 0);
  const q = (p: number) => { let acc = 0; for (const x of rows) { acc += x.w; if (acc >= p * tot) return x.v; } return rows[rows.length - 1].v; };
  const ppm2 = q(0.5);
  return { ppm2: r0(ppm2), low: r0(q(0.25) * area), high: r0(q(0.75) * area), value: r0((ppm2 * area) / 100) * 100, n: rows.length, g: r2(g * 100) };
}
