// Anonymizácia cien zo zmlúv pre klientsku verziu listu (2026-11-13).
//
// Prečo: údaj o cene nehnuteľnosti z katastra poskytuje kataster len vlastníkovi a vymedzeným osobám
// (notár, exekútor, daňový úrad, znalci, tvorca cenových máp…), zákon 212/2018 Z. z. Cena konkrétnej zmluvy
// pri konkrétnej parcele + verejný LV = cena, za ktorú kúpila konkrétna osoba. Preto klient NIKDY nedostane:
//   • cenu a dátum zmluvy na posudzovanom LV,
//   • zoznam porovnateľných predajov s dátumom, k.ú., parcelami, presnou výmerou, cenou a polohou.
// Klient dostane len štatistiku, z ktorej sa jednotlivý predaj spätne neurčí:
//   • súhrny (počet, medián, kvartily) až od K_MIN predajov — menej = „málo údajov“,
//   • anonymné body rozdelenia: rok, €/m² zaokrúhlené na 5, výmera v pásme, vzdialenosť po 250 m,
//     poloha na mriežke ~1 km, bez ceny, k.ú. a parciel, poradie podľa €/m² (nie podľa času),
//   • pri vlastnom LV len počet zmlúv a roky (že sa predávalo, je aj tak vidieť v titule nadobudnutia na LV).
// Interná verzia v appke pracuje s úplnými údajmi; tlač internej verzie ich nezobrazuje (pozri property-sheet).
//
// Funkcia je čistá a idempotentná — volá sa pri uložení snímky (server), pri čítaní odkazu (server, aj staré
// snímky) a pri vykreslení klientskej verzie.

export const K_MIN = 5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number, step: number) => Math.round(v / step) * step;

/** Výmera do pásma: pozemky po 50 m² (nad 2 000 m² po 250 m²), byty po 5 m². Stred pásma, nie presná hodnota. */
export function areaBand(v: number | null, flat: boolean): number | null {
  if (v == null || v <= 0) return null;
  const step = flat ? 5 : v > 2000 ? 250 : 50;
  return Math.max(step, round(v, step));
}

function yearOf(cas: unknown): number | null {
  const m = typeof cas === "string" ? cas.match(/^(\d{4})/) : null;
  return m ? Number(m[1]) : null;
}

/** Očistí jadro listu (core) na mieste. Vráti ten istý objekt. Bezpečné volať opakovane. */
export function anonymizePrices<T>(coreIn: T): T {
  if (!isObj(coreIn)) return coreIn;
  const core = coreIn as Obj;

  // 1) zmluvy na posudzovanom LV → len počet a roky
  const prices = Array.isArray(core.prices) ? (core.prices as Obj[]) : [];
  if (prices.length) {
    const years = [...new Set(prices.map((p) => yearOf(p.cas)).filter((y): y is number => y != null))].sort((a, b) => a - b);
    const prev = isObj(core.priceSummary) ? core.priceSummary : null;
    core.priceSummary = { n: prices.length + (num(prev?.n) ?? 0), years };
  } else if (!isObj(core.priceSummary)) core.priceSummary = null;
  core.prices = [];

  // 2) porovnateľné predaje → anonymné body, len ak ich je aspoň K_MIN (bez vlastného LV)
  const comps = (Array.isArray(core.comparables) ? (core.comparables as Obj[]) : []).filter((x) => x.same_lv !== true);
  if (core.anon === true) {
    // už anonymizované — len poistka, že nič presné neostalo
    core.comparables = comps.length >= K_MIN ? comps.map(anonComp) : [];
  } else {
    core.comparables = comps.length >= K_MIN
      ? comps.map(anonComp).sort((a, b) => (num(a.ppm2) ?? 0) - (num(b.ppm2) ?? 0))
      : [];
  }

  // 3) súhrn porovnateľných → bez hodnôt pod K_MIN
  if (isObj(core.compStats)) {
    const cs = core.compStats;
    const n = num(cs.n) ?? 0;
    if (n < K_MIN) Object.assign(cs, { medPpm2: null, p25: null, p75: null, medCen: null, estimateEur: null });
    else {
      for (const k of ["medPpm2", "p25", "p75"]) { const v = num(cs[k]); cs[k] = v == null ? null : round(v, 1); }
      for (const k of ["medCen", "estimateEur"]) { const v = num(cs[k]); cs[k] = v == null ? null : round(v, 1000); }
    }
  }

  // 4) trend v okrese → roky s menej ako K_MIN zmluvami bez mediánov
  const market = isObj(core.market) ? core.market : null;
  if (market && Array.isArray(market.trend)) {
    market.trend = (market.trend as Obj[]).map((t) => (num(t.n) ?? 0) < K_MIN
      ? { ...t, medPpm2: null, medCen: null }
      : { ...t, medPpm2: num(t.medPpm2) == null ? null : round(num(t.medPpm2) as number, 1), medCen: num(t.medCen) == null ? null : round(num(t.medCen) as number, 1000) });
  }

  core.anon = true;
  return coreIn;
}

function anonComp(x: Obj): Obj {
  const flatM2 = num(x.flat_m2), landM2 = num(x.land_m2);
  const ppm2 = num(x.ppm2);
  const y = yearOf(x.cas);
  const d = num(x.distM);
  const lat = num(x.lat), lng = num(x.lng);
  return {
    cas: y ? `${y}-07-01` : "",          // len rok (stred roka kvôli prepočtu trendu)
    kind: typeof x.kind === "string" ? x.kind : "",
    cen: 0,                               // cena zmluvy sa nikdy neposiela
    ppm2: ppm2 == null ? null : round(ppm2, 5),
    land_m2: flatM2 != null ? null : areaBand(landM2, false),
    flat_m2: areaBand(flatM2, true),
    items: null, ku: null, same_lv: false,
    distM: d == null ? null : Math.max(250, round(d, 250)),
    lat: lat == null ? null : round(lat, 0.01),
    lng: lng == null ? null : round(lng, 0.01),
  };
}
