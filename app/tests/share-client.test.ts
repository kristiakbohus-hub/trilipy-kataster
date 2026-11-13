// Klientska verzia listu nehnuteľnosti (share-client.ts): v snímke pre klienta nesmú ostať údaje o tretích osobách —
// jednotlivé zmluvy s cenou a parcelou, inzeráty (názov, odkaz, cena), čísla LV susedných parciel, pôvodný text ťarchy
// ani odhad daňovej situácie predávajúceho. Ostávajú agregáty (počet, medián, rozpätie, obdobie, okres, pásmo).
// Všetky údaje v teste sú vymyslené.
import { describe, expect, test } from "bun:test";
import { CLIENT_MIN_N, clientizeCore, clientView } from "../src/lib/share-client";
import { financeOf, hedonicOf } from "../src/lib/finance";
import type { PropertyCore } from "../src/lib/api/kataster.functions";
import type { SheetData } from "../src/lib/property-eval";

const Y = new Date().getFullYear();
const comp = (i: number, ppm2: number, distM: number | null, cas: string) => ({
  cas, kind: "pozemok", cen: 40_000 + i * 1_111, ppm2, land_m2: 800 + i * 10, flat_m2: null, items: `C 4711/${i}, C 4712/${i}`, ku: "Testovo", distM, same_lv: false, lat: 49.1 + i / 1000, lng: 18.4,
});
const listing = (title: string, price: number | null, removed: boolean, hist: number[]) => ({
  source: "portal-x", url: `https://example.invalid/inzerat/${title.length}`, title, ptype: "pozemok", price_eur: price, ppm2: price ? price / 1000 : null, area_m2: 1000,
  first_seen: `${Y}-01-10`, last_seen: `${Y}-03-01`, removed, confidence: "vysoká", distM: null, history: hist.map((p, i) => ({ day: `${Y}-0${i + 1}-15`, price_eur: p })),
});

function mkCore(): PropertyCore {
  return {
    ok: true, kind: "parcela", title: "Pozemok 4711/9", subtitle: "", celokNote: "",
    dataset: { id: "kn-000001", ku_code: "000001", ku_name: "Testovo", region: "Žilinský kraj, okres Testov", okres: "Testov", updated_at: `${Y}-01-01` },
    main: { parcelNo: "4711/9", register: "C", lvNo: 777, lat: 49.1, lng: 18.4, sc: null, flat: null },
    parcels: [{ parcel_no: "4711/9", register: "C", area_m2: 1000, use_type: "záhrada", lv_no: 777, settled: 1, ekn_ref: null, bpej: null, bpej_skupina: null, odnatie_eur: null,
      lat: 49.1, lng: 18.4, geometry_json: null, geometry_quality: null, placement: null, role: "main", zone: null, zone_verdict: null }],
    lvs: [777], buildings: [],
    facts: {
      susedia: { "parcel_c:4711/9": JSON.stringify({ pocet: 2, susedia: [{ p: "4711/8", druh: "záhrada", vym: 900, lv: 9191, t: "súkromná FO", h: 30 }, { p: "4713", druh: "cesta", vym: 300, lv: 9292, t: "obec", h: 25, cesta: true }],
        e_parcely: [{ p: "E 55", lv: 9393, t: "nezistený", m2: 40 }] }) },
      stavby: { "parcel_c:4711/9": JSON.stringify({ druh: "rodinný dom", dalsie: [{ druh: "garáž", sc: "12", lv: 9494 }] }) },
    },
    factMeta: {},
    owners: { access: "summary", perLv: [{ lvNo: 777, count: 1, companies: 0, persons: 1, owners: [] }] },
    legal: [{ lvNo: 777, hasData: true, titlesCount: 1, tarchyCount: 1, titles: ["kupa 2023"], tarchy: ["zalozne_pravo 2023"],
      items: [{ kat: "zalozne_pravo", oprTyp: "banka", oprNazov: "Banka a. s.", parcely: "4711/9", listina: "V 1/2023", rok: 2023, txt: "TEXT-ZAPISU-OPRAVNENY-XY" }] }],
    legalYears: [{ lvNo: 777, inh_max: Y - 1, exek_max: null, lien_max: 2023, sale_max: Y - 1, gift_max: null }],
    flags: [],
    prices: [{ cas: "2021-05-04", cen: 61_234, kind: "pozemok", nItems: 1, landM2: 1000, flatM2: null, ppm2: 61.23, flag: null, items: "C 4711/9", lvNo: 777 }] as unknown as PropertyCore["prices"],
    comparables: [comp(1, 40, 800, "2021-03-01"), comp(2, 50, 1500, "2022-06-01"), comp(3, 60, 3000, "2023-09-01"), comp(4, 70, 4000, "2024-02-01"), comp(5, 80, 9000, "2025-01-01"), comp(6, 55, null, "2024-05-05")],
    compStats: { kind: "pozemok", n: 6, medPpm2: 57, p25: 51, p75: 68, medCen: 43_888, estimateEur: 57_000, basisM2: 1000 },
    listings: [listing("Predaj pozemku Testovo A", 70_000, false, [80_000, 70_000]), listing("Predaj pozemku Testovo B", 72_000, false, [72_000]), listing("Starý inzerát C", 90_000, true, [90_000])],
    nearby: [listing("Ponuka okolie 1", 30_000, false, []), listing("Ponuka okolie 22", 50_000, false, []), listing("Ponuka okolie 333", 40_000, false, []), listing("Ponuka okolie 4444", 60_000, false, [])].map((l, i) => ({ ...l, distM: 500 + i * 700 })),
    rentals: [listing("Nájom 1", 500, false, []), listing("Nájom 22", 700, false, [])].map((l) => ({ ...l, ppm2: l.price_eur! / 60, area_m2: 60 })),
    auctions: [], unregistered: [], acquisitions: [{ lvNo: 777, kind: "sale", n: 1, firstYear: Y - 1, lastYear: Y - 1 }],
    construction: { ku: null, near: { n: 0, area_m2: 0, nearestM: null } },
    signals: { settlement: [], landsearch: [], za: [], up: [], briefs: [], deal: null, cases: [] },
    work: { contacts: 0, lastContact: null, nextAt: null, comments: 0, documents: 0 },
    firms: [], obec: { changes: [], upChanges: [] }, stateContracts: { n: 0, recent: [] }, flats: [],
    market: { trend: [{ year: 2022, n: 9, medPpm2: 50, medCen: 45_000 }, { year: 2023, n: 1, medPpm2: 64.5, medCen: 58_765 }, { year: 2024, n: 12, medPpm2: 60, medCen: 52_000 }, { year: 2025, n: 10, medPpm2: 66, medCen: 60_000 }],
      kuSales: [], rent: null, domDays: { median: 30, n: 50 }, freePlots: { landsearch: 0, up: 0 }, buildingMix: [] },
  } as PropertyCore;
}
const sheet = (core: PropertyCore): SheetData => ({ core, limits: null, access: null, zone: null, avm: null, medPoz: null, upDocs: [], ext: null, dev: null, generatedAt: `${Y}-03-02T00:00:00Z` });
const clean = () => clientizeCore(mkCore() as unknown as Record<string, unknown>) as unknown as PropertyCore;

describe("klientska snímka neobsahuje údaje o tretích osobách", () => {
  const json = JSON.stringify(clean());
  test("porovnateľné predaje: žiadna parcela, k.ú., dátum ani presná cena zmluvy", () => {
    for (const s of ["4711/1", "4712/", "2022-06-01", "40000", "41111", "43333", "Testovo\",\"distM"]) expect(json).not.toContain(s);
  });
  test("zmluvy s cenou na LV nehnuteľnosti: len počet a roky", () => {
    expect(json).not.toContain("61234");
    expect(clean().clientAgg?.lvPrices).toEqual({ n: 1, yearFrom: 2021, yearTo: 2021 });
  });
  test("inzercia: žiadne názvy, odkazy ani ceny jednotlivých inzerátov", () => {
    for (const s of ["Predaj pozemku", "Ponuka okolie", "Nájom 1", "example.invalid", "portal-x", "30000", "90000"]) expect(json).not.toContain(s);
  });
  test("čísla LV susedných a ďalších cudzích parciel zmiznú, typ vlastníka a výmera ostanú", () => {
    const lvs = (raw: string) => Object.values(JSON.parse(raw) as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : [])).filter((x) => x && typeof x === "object" && "lv" in x);
    expect(lvs(clean().facts.susedia["parcel_c:4711/9"])).toEqual([]);
    expect(lvs(clean().facts.stavby["parcel_c:4711/9"])).toEqual([]);
    expect(lvs(mkCore().facts.susedia["parcel_c:4711/9"]).length).toBe(3);
    const sus = JSON.parse(clean().facts.susedia["parcel_c:4711/9"]);
    expect(sus.susedia[0]).toEqual({ p: "4711/8", druh: "záhrada", vym: 900, t: "súkromná FO", h: 30 });
  });
  test("pôvodný text ťarchy zmizne, kód a oprávnený typ ostanú", () => {
    expect(json).not.toContain("TEXT-ZAPISU");
    expect(clean().legal[0].items?.[0].oprTyp).toBe("banka");
  });
});

describe("agregáty", () => {
  const a = clean().clientAgg!;
  test("porovnateľné predaje: počet, medián, rozpätie, obdobie, okres, pásma", () => {
    expect(a.comps).toMatchObject({ kind: "pozemok", n: 6, medPpm2: 57.5, yearFrom: 2021, yearTo: 2025, okres: "Testov" });
    expect(a.comps!.p25! < a.comps!.p75!).toBe(true);
    expect(a.comps!.bands).toEqual([
      { label: "do 2 km", n: 2, medPpm2: null }, { label: "2–5 km", n: 2, medPpm2: null }, { label: "5–15 km", n: 1, medPpm2: null }, { label: "poloha neznáma", n: 1, medPpm2: null }]);
  });
  test("táto nehnuteľnosť v inzercii: jeden súhrnný záznam s mediánom aktívnych ponúk", () => {
    const c = clean();
    expect(a.listing).toEqual({ n: 3, active: 2 });
    expect(c.listings.length).toBe(1);
    expect(c.listings[0]).toMatchObject({ title: null, url: null, source: null, price_eur: 71_000, removed: false });
    expect(c.listings[0].history.map((h) => h.price_eur)).toEqual([76_000, 71_000]);
  });
  test("ponuky v okolí a nájmy: len počty a mediány", () => {
    expect(a.nearby).toMatchObject({ n: 4, medPrice: 45_000, medArea: 1000 });
    expect(a.rentals).toMatchObject({ n: 2, medRent: null, finN: 2, finPpm2: null });
  });
  test(`pod ${CLIENT_MIN_N} záznamy žiadny medián (vývoj cien po rokoch)`, () => {
    const t = clean().market.trend.find((r) => r.year === 2023)!;
    expect(t.medPpm2).toBeNull(); expect(t.medCen).toBeNull();
    expect(clean().market.trend.find((r) => r.year === 2024)!.medPpm2).toBe(60);
  });
  test("compStats z menej ako 3 zmlúv bez mediánov a odhadu", () => {
    const c = mkCore(); c.compStats = { ...c.compStats!, n: 2 }; c.comparables = c.comparables.slice(0, 2);
    const o = clientizeCore(c as unknown as Record<string, unknown>) as unknown as PropertyCore;
    expect(o.compStats).toMatchObject({ n: 2, medPpm2: null, medCen: null, estimateEur: null });
    expect(o.clientAgg!.comps!.medPpm2).toBeNull();
  });
});

describe("jedna zmluva na viacerých LV sa počíta raz", () => {
  test("12 riadkov jednej zmluvy = 1 predaj → žiadny medián, odhad ani hedonický základ", () => {
    const c = mkCore(); c.comparables = Array.from({ length: 12 }, () => ({ ...c.comparables[0] }));
    const o = clientizeCore(c as unknown as Record<string, unknown>) as unknown as PropertyCore;
    expect(o.clientAgg!.comps).toMatchObject({ n: 1, medPpm2: null, p25: null, p75: null });
    expect(o.compStats).toMatchObject({ n: 1, medPpm2: null, medCen: null, estimateEur: null });
    expect(o.clientAgg!.hedonic.pozemok).toBeNull();
    expect(JSON.stringify(o)).not.toContain("41111");
  });
  test("rôzne zmluvy: súhrn a odhad z jedinečných zmlúv", () => {
    const c = mkCore(); c.comparables = [...c.comparables, { ...c.comparables[0] }, { ...c.comparables[0] }];
    const o = clientizeCore(c as unknown as Record<string, unknown>) as unknown as PropertyCore;
    expect(o.clientAgg!.comps!.n).toBe(6);
    expect(o.compStats).toMatchObject({ n: 6, medPpm2: 58, estimateEur: 58_000 });
  });
});

describe("výpočty klientskej verzie", () => {
  test("idempotentné — druhé čistenie (napr. pri vydaní staršej snímky) nič nezmení", () => {
    const once = JSON.stringify(clean());
    expect(JSON.stringify(clientizeCore(JSON.parse(once)))).toBe(once);
    const d = sheet(clean()); expect(clientView(d)).toBe(d);
  });
  test("upravený (hedonický) odhad z agregátu = odhad z jednotlivých zmlúv", () => {
    const b = { kind: "pozemok", landM2: 1000, floorM2: null } as never;
    const raw = hedonicOf(sheet(mkCore()), b)!, cli = hedonicOf(sheet(clean()), b)!;
    expect(raw).not.toBeNull();
    expect(Math.abs(cli.ppm2 - raw.ppm2)).toBeLessThanOrEqual(1);
    expect(Math.abs(cli.value - raw.value)).toBeLessThanOrEqual(100);
    expect(cli.n).toBe(raw.n);
  });
  test("bez odhadu daňovej a dedičskej situácie predávajúceho (interná verzia ho má)", () => {
    const inter = financeOf(sheet(mkCore()), null, {});
    const cli = financeOf(sheet(clean()), null, {});
    expect(inter.costs.saleTax.exemptFrom).toBe(Y - 1 + 5);
    expect((inter.invest.offer?.args ?? []).some((x) => x.includes("daň z predaja"))).toBe(true);
    expect(cli.costs.saleTax.exemptFrom).toBeNull();
    expect(cli.costs.saleTax.text).not.toContain(String(Y - 1));
    expect((cli.invest.offer?.args ?? []).some((x) => /daň z predaja|dedič/.test(x))).toBe(false);
    expect(cli.basis.price).toBe(71_000);
  });
});
