// KLIENTSKA VERZIA LISTU NEHNUTEĽNOSTI — bez údajov o tretích osobách (2026-11-13).
// Pravidlá z dokumentu vlastníka „List nehnuteľnosti ako produkt – monetizácia" (Právny rámec):
//  • ceny zo zmlúv LEN ako agregáty (počet, medián a rozpätie €/m², obdobie, okres, pásmo vzdialenosti) —
//    nikdy cena konkrétneho predaja s parcelou, dátumom alebo k.ú.; agregát z menej ako 3 zmlúv sa neuvádza;
//  • z inzercie len počty a mediány — žiadne názvy, odkazy, ceny ani výmery jednotlivých inzerátov;
//  • čísla LV susedných parciel (a ďalších cudzích parciel/stavieb) nie — typ vlastníka a výmera ostávajú;
//  • žiadne odhady osobnej situácie predávajúceho (daň z predaja z roku nadobudnutia, „dedičia predávajú rýchlo");
//  • pôvodný text ťarchy (môže obsahovať mená) nie.
// Volá sa NA SERVERI pri uložení snímky (createPropertyShare, buildClientShare) aj pri jej vydaní
// (/api/property-share — opraví aj staršie odkazy) a v prehliadači pri náhľade klientskej verzie.
// Čistá funkcia bez databázy; idempotentná (druhé volanie nič nezmení). Interná verzia ju nevolá.
import type { PropComparable, PropListing, PropertyCore } from "./api/kataster.functions";

/** Najmenší počet záznamov, z ktorého sa smie uviesť medián/rozpätie (menej = prakticky konkrétny predaj). */
export const CLIENT_MIN_N = 3;

/** Hedonický základ: vážené kvantily cien porovnateľných predajov prepočítaných na dnešok a vynásobených
 *  výmerou^0,2 — z neho sa odhad pre ľubovoľnú výmeru A spočíta ako q × A^−0,2 (finance.hedonicOf). */
export type HedBase = { q25: number; q50: number; q75: number; n: number; g: number };
export type ClientAgg = {
  comps: { kind: string | null; n: number; medPpm2: number | null; p25: number | null; p75: number | null; yearFrom: number | null; yearTo: number | null; okres: string | null;
    bands: { label: string; n: number; medPpm2: number | null }[] } | null;
  hedonic: { pozemok: HedBase | null; byt: HedBase | null };
  /** zmluvy s cenou na LV tejto nehnuteľnosti — len počet a roky, bez cien */
  lvPrices: { n: number; yearFrom: number | null; yearTo: number | null } | null;
  /** táto nehnuteľnosť v inzercii — počet inzerátov (ceny sú v jednom súhrnnom zázname core.listings) */
  listing: { n: number; active: number } | null;
  nearby: { n: number; medPrice: number | null; medPpm2: number | null; p25Ppm2: number | null; p75Ppm2: number | null; medArea: number | null; maxDistM: number | null } | null;
  /** finPpm2/finN = presne to, čo by z jednotlivých ponúk spočítal finance.investOf (medián z ≥ 3 ponúk) */
  rentals: { n: number; medRent: number | null; medPpm2: number | null; medArea: number | null; finN: number; finPpm2: number | null } | null;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Kvantil s lineárnou interpoláciou; null pri menej ako CLIENT_MIN_N hodnotách. */
export function aggQuantile(xs: number[], p: number, minN = CLIENT_MIN_N): number | null {
  const s = xs.filter(fin).sort((a, b) => a - b);
  if (s.length < minN || !s.length) return null;
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return r2(s[lo] + (s[hi] - s[lo]) * (i - lo));
}

/** Hedonický základ z porovnateľných predajov (rovnaká metóda ako doteraz v finance.hedonicOf). */
export function hedonicBase(c: { comparables?: PropComparable[]; market?: { trend?: PropertyCore["market"]["trend"] } }, byt: boolean, now = Date.now()): HedBase | null {
  const tr = arr<PropertyCore["market"]["trend"][number]>(c.market?.trend).filter((t) => t.medPpm2 && t.n >= 4).sort((x, y) => x.year - y.year).slice(-6);
  let g = 0.04;
  if (tr.length >= 3) { const a0 = tr[0], a1 = tr[tr.length - 1]; g = Math.max(-0.03, Math.min(0.08, Math.pow((a1.medPpm2 as number) / (a0.medPpm2 as number), 1 / Math.max(1, a1.year - a0.year)) - 1)); }
  const rows = arr<PropComparable>(c.comparables).map((x) => {
    const a = byt ? x.flat_m2 : x.land_m2; if (!x.ppm2 || !a) return null;
    const yrs = Math.max(0, (now - Date.parse(x.cas)) / 3.156e10);
    const v = x.ppm2 * Math.pow(1 + g, yrs) * Math.pow(a, 0.2);
    const w = (1 / (1 + (x.distM ?? 5000) / 1000)) * (1 / (1 + yrs / 3));
    return { v, w };
  }).filter((x): x is { v: number; w: number } => !!x && Number.isFinite(x.v) && x.v > 0).sort((p, q) => p.v - q.v);
  if (rows.length < CLIENT_MIN_N) return null;
  const tot = rows.reduce((s, x) => s + x.w, 0);
  const q = (p: number) => { let acc = 0; for (const x of rows) { acc += x.w; if (acc >= p * tot) return x.v; } return rows[rows.length - 1].v; };
  return { q25: q(0.25), q50: q(0.5), q75: q(0.75), n: rows.length, g };
}

/** Jedna zmluva zapísaná na viacerých LV má v lv_prices viac riadkov (rovnaký dátum aj cena) — počíta sa raz,
 *  inak by „12 predajov" mohla byť jedna zmluva a medián by bol jej presná cena. */
export function distinctContracts(comps: PropComparable[]): PropComparable[] {
  const seen = new Set<string>(); const out: PropComparable[] = [];
  for (const x of comps) { const k = `${String(x.cas ?? "").slice(0, 10)}|${x.cen}`; if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

const BANDS: [string, number][] = [["do 2 km", 2000], ["2–5 km", 5000], ["5–15 km", 15000], ["nad 15 km", Infinity]];
function compsAgg(comps: PropComparable[], kind: string | null, okres: string | null): ClientAgg["comps"] {
  if (!comps.length) return null;
  const ppm = comps.map((x) => x.ppm2).filter((x): x is number => fin(x) && x > 0);
  const years = comps.map((x) => Number(String(x.cas ?? "").slice(0, 4))).filter((y) => y > 1900);
  const bands: { label: string; n: number; medPpm2: number | null }[] = [];
  let lo = 0;
  for (const [label, hi] of BANDS) {
    const inB = comps.filter((x) => fin(x.distM) && x.distM >= lo && x.distM < hi);
    if (inB.length) bands.push({ label, n: inB.length, medPpm2: aggQuantile(inB.map((x) => x.ppm2 ?? NaN).filter((v) => v > 0), 0.5) });
    lo = hi;
  }
  const unknown = comps.filter((x) => !fin(x.distM)).length;
  if (unknown) bands.push({ label: "poloha neznáma", n: unknown, medPpm2: null });
  return { kind, n: comps.length, medPpm2: aggQuantile(ppm, 0.5), p25: aggQuantile(ppm, 0.25), p75: aggQuantile(ppm, 0.75),
    yearFrom: years.length ? Math.min(...years) : null, yearTo: years.length ? Math.max(...years) : null, okres, bands };
}

function listingSummary(ls: PropListing[]): PropListing | null {
  if (!ls.length) return null;
  const active = ls.filter((l) => !l.removed && fin(l.price_eur) && (l.price_eur as number) > 0);
  const base = active.length ? active : [];
  const med = (xs: (number | null)[]) => aggQuantile(xs.filter(fin), 0.5, 1);
  const price = med(base.map((l) => l.price_eur));
  const first = med(base.map((l) => l.history?.[0]?.price_eur ?? l.price_eur));
  const fs = ls.map((l) => l.first_seen).filter((x): x is string => !!x).sort();
  const lsn = ls.map((l) => l.last_seen).filter((x): x is string => !!x).sort();
  const fsA = base.map((l) => l.first_seen).filter((x): x is string => !!x).sort();
  return {
    source: null, url: null, title: null, ptype: ls.find((l) => l.ptype)?.ptype ?? null,
    price_eur: price, ppm2: med(base.map((l) => l.ppm2)), area_m2: null,
    first_seen: fsA[0] ?? fs[0] ?? null, last_seen: lsn[lsn.length - 1] ?? null, removed: !active.length, confidence: null, distM: null,
    history: price != null && first != null && first !== price ? [{ day: fsA[0] ?? "", price_eur: first }, { day: lsn[lsn.length - 1] ?? "", price_eur: price }] : [],
  };
}

/** Odstráni čísla LV z položiek zoznamov v skupine faktov (susedné parcely, parcely E, ďalšie stavby). */
function stripLvInFacts(group: unknown): void {
  if (!isObj(group)) return;
  for (const [k, raw] of Object.entries(group)) {
    if (typeof raw !== "string") continue;
    let o: unknown; try { o = JSON.parse(raw); } catch { continue; }
    if (!isObj(o)) continue;
    let changed = false;
    for (const v of Object.values(o)) for (const it of arr<unknown>(v)) if (isObj(it) && "lv" in it) { delete it.lv; changed = true; }
    if (changed) group[k] = JSON.stringify(o);
  }
}

/** Vyčistí jadro listu pre klienta (mutuje a vracia ten istý objekt). */
export function clientizeCore<T extends Record<string, unknown>>(core: T): T {
  const c = core as Record<string, unknown>;
  const prev = isObj(c.clientAgg) ? (c.clientAgg as ClientAgg) : null;
  const ds = isObj(c.dataset) ? c.dataset : null;
  const okres = typeof ds?.okres === "string" ? ds.okres : null;
  const cs = isObj(c.compStats) ? c.compStats : null;

  // 1) porovnateľné predaje zo zmlúv → agregát + hedonický základ; jednotlivé zmluvy preč
  const comps = distinctContracts(arr<PropComparable>(c.comparables));
  const market = isObj(c.market) ? (c.market as PropertyCore["market"]) : undefined;
  const hr = (h: HedBase | null): HedBase | null => (h ? { q25: r2(h.q25), q50: r2(h.q50), q75: r2(h.q75), n: h.n, g: Math.round(h.g * 1e4) / 1e4 } : null);
  const hed = comps.length
    ? { pozemok: hr(hedonicBase({ comparables: comps, market }, false)), byt: hr(hedonicBase({ comparables: comps, market }, true)) }
    : prev?.hedonic ?? { pozemok: null, byt: null };
  const compAgg = comps.length ? compsAgg(comps, typeof cs?.kind === "string" ? cs.kind : null, okres) : prev?.comps ?? null;
  c.comparables = [];
  if (cs && comps.length) {
    // súhrn prepočítaný z jedinečných zmlúv (rovnaké zaokrúhlenie a vzorec odhadu ako buildPropertyCore)
    const ppms = comps.map((x) => x.ppm2).filter((v): v is number => fin(v) && v > 0), cens = comps.map((x) => x.cen).filter((v) => fin(v) && v > 0);
    const P = (xs: number[], p: number) => { const q = aggQuantile(xs, p, 1); return q == null ? null : Math.round(q); };
    const basis = fin(cs.basisM2) ? cs.basisM2 : null;
    cs.n = comps.length; cs.medPpm2 = P(ppms, 0.5); cs.p25 = P(ppms, 0.25); cs.p75 = P(ppms, 0.75); cs.medCen = P(cens, 0.5);
    cs.estimateEur = (cs.kind === "pozemok" || (cs.kind === "byt" && basis)) && cs.medPpm2 && basis ? Math.round((cs.medPpm2 as number) * basis) : cs.kind !== "pozemok" ? cs.medCen : null;
  }
  if (cs && !(fin(cs.n) && cs.n >= CLIENT_MIN_N)) { cs.medPpm2 = null; cs.p25 = null; cs.p75 = null; cs.medCen = null; cs.estimateEur = null; }

  // 2) zmluvy s cenou na LV tejto nehnuteľnosti → len počet a roky
  const prices = arr<{ cas?: string }>(c.prices);
  const py = prices.map((p) => Number(String(p.cas ?? "").slice(0, 4))).filter((y) => y > 1900);
  const lvPrices = prices.length ? { n: prices.length, yearFrom: py.length ? Math.min(...py) : null, yearTo: py.length ? Math.max(...py) : null } : prev?.lvPrices ?? null;
  c.prices = [];

  // 3) inzercia: táto nehnuteľnosť → jeden súhrnný záznam (mediány, bez názvu/odkazu/zdroja); okolie a nájmy → agregát
  const ls = arr<PropListing>(c.listings).filter((l) => l.title != null || l.url != null || l.source != null || l.confidence != null);
  const listing = ls.length ? { n: ls.length, active: ls.filter((l) => !l.removed && fin(l.price_eur)).length } : prev?.listing ?? null;
  if (ls.length) { const s = listingSummary(ls); c.listings = s ? [s] : []; }

  const nb = arr<PropListing>(c.nearby);
  const nearby = nb.length ? (() => {
    const ppm = nb.map((l) => l.ppm2).filter((x): x is number => fin(x) && x > 0);
    const dists = nb.map((l) => l.distM).filter(fin);
    return { n: nb.length, medPrice: aggQuantile(nb.map((l) => l.price_eur ?? NaN), 0.5), medPpm2: aggQuantile(ppm, 0.5), p25Ppm2: aggQuantile(ppm, 0.25), p75Ppm2: aggQuantile(ppm, 0.75),
      medArea: aggQuantile(nb.map((l) => l.area_m2 ?? NaN), 0.5), maxDistM: dists.length >= CLIENT_MIN_N ? Math.round(Math.max(...dists) / 100) * 100 : null };
  })() : prev?.nearby ?? null;
  c.nearby = [];

  const rt = arr<PropListing>(c.rentals);
  const rentals = rt.length ? (() => {
    const loc = rt.map((l) => l.ppm2).filter((x): x is number => x != null && x > 1 && x < 40).sort((a, b) => a - b);
    return { n: rt.length, medRent: aggQuantile(rt.map((l) => l.price_eur ?? NaN), 0.5), medPpm2: aggQuantile(rt.map((l) => l.ppm2 ?? NaN), 0.5), medArea: aggQuantile(rt.map((l) => l.area_m2 ?? NaN), 0.5),
      finN: loc.length, finPpm2: loc.length >= CLIENT_MIN_N ? loc[Math.floor(loc.length / 2)] : null };
  })() : prev?.rentals ?? null;
  if ("rentals" in c) c.rentals = [];

  // 4) vývoj cien zo zmlúv v okrese: rok s menej ako 3 zmluvami bez mediánov (inak = cena konkrétneho predaja)
  if (market) market.trend = arr<PropertyCore["market"]["trend"][number]>(market.trend).map((t) => (fin(t.n) && t.n >= CLIENT_MIN_N ? t : { ...t, medPpm2: null, medCen: null }));

  // 5) čísla LV susedných a ďalších cudzích parciel/stavieb
  const facts = isObj(c.facts) ? c.facts : null;
  if (facts) { stripLvInFacts(facts.susedia); stripLvInFacts(facts.stavby); }

  // 6) pôvodný text ťarchy (môže obsahovať mená oprávnených osôb)
  for (const l of arr<Record<string, unknown>>(c.legal)) for (const it of arr<Record<string, unknown>>(l.items)) if (isObj(it)) it.txt = null;

  c.clientAgg = { comps: compAgg, hedonic: hed, lvPrices, listing, nearby, rentals } satisfies ClientAgg;
  c.clientSafe = true;
  return core;
}

/** Náhľad klientskej verzie v prehliadači: ak dáta ešte nie sú očistené serverom, očistí ich kópiu. */
export function clientView<D extends { core: PropertyCore }>(d: D): D {
  if (d.core.clientSafe) return d;
  const core = JSON.parse(JSON.stringify(d.core)) as PropertyCore;
  return { ...d, core: clientizeCore(core as unknown as Record<string, unknown>) as unknown as PropertyCore };
}
