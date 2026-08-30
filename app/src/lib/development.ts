// Development potenciál — ÚP regulatív číselník + kalkulačka (HPP/ČPP/IZP/KZ, byty, parkovanie
// STN 73 6110, ekonomika/GDV, harmonogram, development skóre). Hodnoty sú ORIENTAČNÉ; presné určuje
// stavebný úrad a platný ÚP. Číselník je rozšíriteľný per mesto.

export type ZoneCharacter = "rozvojove" | "stabilizovane" | "nezastavatelne";

export interface Regulativ {
  code: string;            // kód zóny (napr. "501" BA, "OB" rural)
  municipality: string;    // "Bratislava" | "generic"
  name: string;            // názov funkčnej plochy
  ipp: number;             // index podlažných plôch (HPP = výmera × IPP)
  izp: number;             // index zastavaných plôch (max zastavaná plocha)
  kz: number;              // koeficient zelene (min zeleň)
  cppCoef: number;         // čistá predajná plocha / HPP
  character: ZoneCharacter;
  kategoria: string;       // krátky štítok (Zmiešané / Bývanie / Výroba / Poľnohospodárske…)
  pripustne: string;
  podmienecne: string;
  nepripustne: string;
}

// Orientačný číselník. BA hodnoty podľa ÚP Bratislavy (VZN 4/2007); generic = rozumné defaulty.
export const REGULATIV: Regulativ[] = [
  { code: "501", municipality: "Bratislava", name: "Zmiešané územia bývania a občianskej vybavenosti", ipp: 2.4, izp: 0.30, kz: 0.25, cppCoef: 0.8, character: "rozvojove", kategoria: "Zmiešané územia",
    pripustne: "Bytové domy; obchody, stravovacie zariadenia a služby; administratíva; kultúrne, zdravotnícke, školské a sociálne zariadenia; hotely a penzióny.",
    podmienecne: "Nerušiace prevádzky remesiel a ľahkej výroby; parkovacie domy; zariadenia zábavy a kultúry.",
    nepripustne: "Priemyselná výroba; sklady; rušiace prevádzky; veľkoobchodné areály." },
  { code: "101", municipality: "Bratislava", name: "Málopodlažná zástavba obytného územia", ipp: 0.6, izp: 0.25, kz: 0.45, cppCoef: 0.8, character: "stabilizovane", kategoria: "Bývanie",
    pripustne: "Rodinné domy; málopodlažné bytové domy; základná občianska vybavenosť.", podmienecne: "Zariadenia služieb bez rušivých vplyvov.", nepripustne: "Výroba; sklady; veľkoobchod." },
  { code: "102", municipality: "Bratislava", name: "Viacpodlažná zástavba obytného územia", ipp: 1.4, izp: 0.30, kz: 0.35, cppCoef: 0.8, character: "rozvojove", kategoria: "Bývanie",
    pripustne: "Bytové domy; občianska vybavenosť v parteri.", podmienecne: "Administratíva; ubytovanie.", nepripustne: "Výroba; sklady." },
  { code: "201", municipality: "Bratislava", name: "Občianska vybavenosť celomestského významu", ipp: 1.8, izp: 0.40, kz: 0.20, cppCoef: 0.75, character: "rozvojove", kategoria: "Občianska vybavenosť",
    pripustne: "Administratíva; obchod; služby; kultúra; zdravotníctvo; školstvo.", podmienecne: "Bývanie ako doplnková funkcia.", nepripustne: "Výroba; sklady." },
  { code: "401", municipality: "Bratislava", name: "Priemyselná výroba a sklady", ipp: 1.0, izp: 0.50, kz: 0.15, cppCoef: 0.7, character: "rozvojove", kategoria: "Výroba",
    pripustne: "Výroba; sklady; logistika; výrobné služby.", podmienecne: "Administratíva k prevádzke.", nepripustne: "Bývanie." },
  // ——— Generic (vidiek / obce bez kódovaného ÚP) ———
  { code: "OB", municipality: "generic", name: "Obytné územie (rodinné domy)", ipp: 0.5, izp: 0.30, kz: 0.40, cppCoef: 0.8, character: "rozvojove", kategoria: "Bývanie",
    pripustne: "Rodinné domy; základná vybavenosť; drobné živnosti.", podmienecne: "Nerušiace služby a remeslá.", nepripustne: "Priemysel; sklady; živočíšna výroba." },
  { code: "ZM", municipality: "generic", name: "Zmiešané územie obce", ipp: 0.8, izp: 0.35, kz: 0.30, cppCoef: 0.8, character: "rozvojove", kategoria: "Zmiešané územia",
    pripustne: "Bývanie; obchod; služby; vybavenosť.", podmienecne: "Ľahká výroba bez rušivých vplyvov.", nepripustne: "Ťažká výroba; sklady." },
  { code: "VY", municipality: "generic", name: "Výrobné / hospodárske územie", ipp: 0.9, izp: 0.45, kz: 0.20, cppCoef: 0.7, character: "rozvojove", kategoria: "Výroba",
    pripustne: "Výroba; sklady; poľnohospodárske stavby.", podmienecne: "Administratíva k prevádzke.", nepripustne: "Bývanie." },
  { code: "PP", municipality: "generic", name: "Poľnohospodárska pôda (nezastavateľné)", ipp: 0, izp: 0, kz: 1, cppCoef: 0, character: "nezastavatelne", kategoria: "Poľnohospodárske",
    pripustne: "Poľnohospodárske využitie.", podmienecne: "Účelové stavby k hospodáreniu (súhlas orgánu ochrany pôdy).", nepripustne: "Bývanie; výroba bez odňatia z PPF." },
  { code: "LP", municipality: "generic", name: "Lesné pozemky (nezastavateľné)", ipp: 0, izp: 0, kz: 1, cppCoef: 0, character: "nezastavatelne", kategoria: "Lesné",
    pripustne: "Lesné hospodárstvo.", podmienecne: "Stavby lesného hospodárstva.", nepripustne: "Bývanie; výroba." },
  { code: "ZR", municipality: "generic", name: "Zeleň a rekreácia", ipp: 0.1, izp: 0.05, kz: 0.80, cppCoef: 0.6, character: "stabilizovane", kategoria: "Rekreácia",
    pripustne: "Verejná zeleň; šport; rekreácia.", podmienecne: "Drobné stavby pre rekreáciu.", nepripustne: "Bývanie; výroba." },
];

export function regulativByCode(code: string | null | undefined): Regulativ | undefined {
  if (!code) return undefined;
  return REGULATIV.find((r) => r.code === code);
}

// Zóna z ÚP (import/kreslenie) — vlastné regulatív parametre, doplnené z číselníka podľa kódu.
export interface ZoneLike {
  code?: string | null; name?: string | null;
  ipp?: number | null; izp?: number | null; kz?: number | null;
  character?: string | null; kategoria?: string | null;
  pripustne?: string | null; podmienecne?: string | null; nepripustne?: string | null;
}
export function regulativFromZone(z: ZoneLike | null | undefined): Regulativ | null {
  if (!z) return null;
  const base = z.code ? regulativByCode(z.code) : undefined;
  const ipp = z.ipp ?? base?.ipp;
  if (ipp == null) return base ?? null;
  const char = (z.character as ZoneCharacter) ?? base?.character ?? (ipp > 0 ? "rozvojove" : "nezastavatelne");
  return {
    code: z.code ?? base?.code ?? "ÚP",
    municipality: base?.municipality ?? "import",
    name: z.name ?? base?.name ?? "Funkčná plocha (ÚP)",
    ipp, izp: z.izp ?? base?.izp ?? 0.3, kz: z.kz ?? base?.kz ?? 0.3,
    cppCoef: base?.cppCoef ?? 0.8,
    character: char,
    kategoria: z.kategoria ?? base?.kategoria ?? "ÚP zóna",
    pripustne: z.pripustne ?? base?.pripustne ?? "—",
    podmienecne: z.podmienecne ?? base?.podmienecne ?? "—",
    nepripustne: z.nepripustne ?? base?.nepripustne ?? "—",
  };
}

// Proxy zóna z katastra, keď nie je formálny ÚP (orientačné): druh pozemku + umiestnenie → kód.
export function proxyZone(useType: string | null | undefined, placement: string | null | undefined): string {
  const t = (useType ?? "").toLowerCase();
  const inTown = /v zastavanom/i.test(placement ?? "");
  if (/lesn/.test(t)) return "LP";
  if (/vodn/.test(t)) return "PP";
  if (/orná|orna|trvalé trávne|trvale travne|ttp|chmeľ|vinic|ovocn|záhrad|zahrad/.test(t) && !inTown) return "PP";
  if (/zastavan|nádvor|nadvor/.test(t) && inTown) return "ZM";
  if (/záhrad|zahrad/.test(t) && inTown) return "OB";
  if (inTown) return "OB";
  return "PP";
}

export interface DevOpts {
  m2PerByt: number;        // m² ČPP na 1 byt
  nakladyEurM2Hpp: number; // stavebné náklady €/m² HPP
  predajEurM2: number;     // predajná cena €/m² ČPP (novostavba) — neskôr zo scrapu
}
export const DEV_DEFAULTS: DevOpts = { m2PerByt: 70, nakladyEurM2Hpp: 2800, predajEurM2: 2500 };

export interface DevCalc {
  reg: Regulativ;
  buildable: boolean;
  hpp: number; cpp: number; izpArea: number; kzArea: number;
  byty: number;
  parking: { vazane: number; navstevnicke: number; spolu: number; cyklo: number; moto: number; imobil: number };
  ekonomika: { naklady: number; gdv: number; marzaPct: number };
  harmonogram: { ipMonths: number; buildMonths: number; totalMonths: number };
  score: number;          // 0..100 development skóre
  reasons: string[];      // kladné dôvody
  risks: string[];        // riziká/limity
}

export function developmentCalc(areaM2: number, reg: Regulativ, opts: DevOpts = DEV_DEFAULTS): DevCalc {
  const buildable = reg.character !== "nezastavatelne" && reg.ipp > 0;
  const hpp = Math.round(areaM2 * reg.ipp);
  const cpp = Math.round(hpp * reg.cppCoef);
  const izpArea = Math.round(areaM2 * reg.izp);
  const kzArea = Math.round(areaM2 * reg.kz);
  const byty = buildable ? Math.round(cpp / opts.m2PerByt) : 0;
  const vazane = Math.round(byty * 1.07);
  const navstevnicke = Math.round(vazane * 0.2);
  const spolu = vazane + navstevnicke;
  const parking = { vazane, navstevnicke, spolu, cyklo: Math.round(spolu * 0.25), moto: Math.round(spolu * 0.05), imobil: Math.round(spolu * 0.05) };
  const naklady = Math.round(hpp * opts.nakladyEurM2Hpp);
  const gdv = Math.round(cpp * opts.predajEurM2);
  const marzaPct = gdv > 0 ? Math.round(((gdv - naklady) / gdv) * 1000) / 10 : 0;
  const ipMonths = 24, buildMonths = 24, totalMonths = ipMonths + buildMonths + 5;

  const reasons: string[] = []; const risks: string[] = [];
  if (reg.character === "rozvojove") reasons.push("Rozvojová / rozvojaschopná zóna");
  if (reg.character === "stabilizovane") reasons.push("Stabilizované územie");
  if (reg.character === "nezastavatelne") risks.push("Nezastavateľné podľa ÚP (limit)");
  if (reg.ipp >= 1.5) reasons.push("Vysoký IPP — silný stavebný potenciál");
  else if (reg.ipp > 0 && reg.ipp < 0.5) risks.push("Nízky IPP — obmedzený objem");
  if (reg.kategoria === "Zmiešané územia") reasons.push("Prémiová zmiešaná zóna");
  let score = 0;
  if (buildable) {
    score = Math.min(100, Math.round(30 + reg.ipp * 25 + (reg.character === "rozvojove" ? 15 : 0) + (marzaPct > 15 ? 15 : marzaPct)));
  }
  return { reg, buildable, hpp, cpp, izpArea, kzArea, byty, parking, ekonomika: { naklady, gdv, marzaPct }, harmonogram: { ipMonths, buildMonths, totalMonths }, score, reasons, risks };
}

export function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("sk-SK", { month: "short", year: "numeric" });
}
