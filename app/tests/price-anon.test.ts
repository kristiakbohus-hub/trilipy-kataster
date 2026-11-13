import { describe, expect, test } from "bun:test";
import { anonymizePrices, areaBand, K_MIN } from "../src/lib/price-anon";

const comp = (i: number, extra: Record<string, unknown> = {}) => ({
  cas: `2023-0${(i % 9) + 1}-15`, kind: "pozemok", cen: 48_300 + i * 1000, ppm2: 61.37 + i, land_m2: 787, flat_m2: null,
  items: `C:1500/${i}`, ku: "Turzovka", distM: 1234, same_lv: false, lat: 49.40312, lng: 18.62277, ...extra,
});
const core = (nComps: number) => ({
  prices: [{ cas: "2021-05-03", cen: 95_000, kind: "dom", nItems: 2, landM2: 600, flatM2: null, ppm2: 158.3, flag: null, items: "C:12;C:13", lvNo: 1234 }],
  comparables: [...Array.from({ length: nComps }, (_, i) => comp(i)), comp(99, { same_lv: true })],
  compStats: { kind: "pozemok", n: nComps, medPpm2: 63.456, p25: 61.1, p75: 66.9, medCen: 49_421, estimateEur: 51_789, basisM2: 800 },
  market: { trend: [{ year: 2022, n: 3, medPpm2: 50, medCen: 40_000 }, { year: 2023, n: 12, medPpm2: 55.4, medCen: 44_321 }] },
});

describe("anonymizePrices", () => {
  test("zmluvy na LV: len počet a roky, žiadna suma", () => {
    const c = anonymizePrices(core(6)) as Record<string, any>;
    expect(c.prices).toEqual([]);
    expect(c.priceSummary).toEqual({ n: 1, years: [2021] });
    expect(JSON.stringify(c)).not.toContain("95000");
    expect(c.anon).toBe(true);
  });

  test("porovnateľné: bez ceny, dátumu, k.ú., parciel; zaokrúhlené; bez vlastného LV", () => {
    const c = anonymizePrices(core(6)) as Record<string, any>;
    expect(c.comparables).toHaveLength(6);
    for (const x of c.comparables) {
      expect(x.cen).toBe(0);
      expect(x.items).toBeNull();
      expect(x.ku).toBeNull();
      expect(x.cas).toBe("2023-07-01");
      expect(x.ppm2 % 5).toBe(0);
      expect(x.land_m2).toBe(800);
      expect(x.distM).toBe(1250);
      expect(Math.abs(x.lat * 100 - Math.round(x.lat * 100))).toBeLessThan(1e-6);
    }
    expect(JSON.stringify(c)).not.toContain("1500/");
    expect(JSON.stringify(c)).not.toContain("Turzovka");
  });

  test(`menej ako ${K_MIN} predajov: žiadne body ani súhrnné hodnoty`, () => {
    const c = anonymizePrices(core(K_MIN - 1)) as Record<string, any>;
    expect(c.comparables).toEqual([]);
    expect(c.compStats.medPpm2).toBeNull();
    expect(c.compStats.estimateEur).toBeNull();
    expect(c.compStats.n).toBe(K_MIN - 1);
  });

  test("trend: rok pod K_MIN bez mediánov, inak zaokrúhlené", () => {
    const c = anonymizePrices(core(6)) as Record<string, any>;
    expect(c.market.trend[0]).toMatchObject({ year: 2022, n: 3, medPpm2: null, medCen: null });
    expect(c.market.trend[1]).toMatchObject({ medPpm2: 55, medCen: 44_000 });
    expect(c.compStats.estimateEur).toBe(52_000);
  });

  test("idempotentné", () => {
    const once = anonymizePrices(core(7));
    const twice = anonymizePrices(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  test("pásma výmery", () => {
    expect(areaBand(787, false)).toBe(800);
    expect(areaBand(2610, false)).toBe(2500);
    expect(areaBand(63.4, true)).toBe(65);
    expect(areaBand(null, true)).toBeNull();
  });
});
