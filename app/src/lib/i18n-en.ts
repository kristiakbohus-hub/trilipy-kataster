// ANGLICKÁ VERZIA LISTU (2026-11-13, v1): titulka, zhrnutie, názvy kapitol, semafor a vysvetlenia „What this means
// for you" v angličtine. Podrobné tabuľky z registrov ostávajú v slovenčine (úradná terminológia) — uvedené na titulke.
import { fact, mainKey, riskyHit, zoneOf, type Light, type SheetData } from "./property-eval";
import type { FinResult } from "./finance";

export const EN_TITLES: Record<string, string> = {
  prehlad: "Overview", skladba: "Composition", vlastnictvo: "Ownership", pravo: "Legal status", historia: "Property timeline", pristup: "Access and neighbours",
  up: "Zoning plan and buildability", limity: "Constraints and risks", teren: "Terrain and sunlight", klima: "Climate and building codes", siete: "Utilities and energy",
  doprava: "Transport and amenities", hodnota: "Value", predikcia: "Value forecast", trh: "Market and demand", financovanie: "Financing and mortgage",
  naklady: "Purchase, ownership costs and taxes", poistenie: "Insurance and risks", investicia: "Yield and negotiation", obec: "Municipality and people",
  praca: "Internal signals", udaje: "Seller's information", povolenia: "Permits and timing", rozhodnutie: "Decision and scenarios", postup: "Purchase process and deadlines", overit: "What to verify before purchase", zdroje: "Sources and completeness", poznamka: "Agent's note",
};
export const EN_LIGHT: Record<string, string> = { pravo: "Legal status", pristup: "Access", limity: "Constraints and risks", up: "Zoning plan", siete: "Utilities", cena: "Price" };
export const EN_WORD: Record<Light["state"], string> = { ok: "fine", warn: "attention", bad: "risk", unknown: "unknown" };
export const EN_UI: Record<string, string> = {
  "List nehnuteľnosti": "Property sheet", "Pre klienta": "Client edition", "Interná verzia": "Internal edition", "Výmera": "Area", "Parcely": "Parcels",
  "Hypotéka mesačne": "Mortgage per month", "List vlastníctva": "Title deed (LV)", "Územný plán": "Zoning", "Orientačná hodnota": "Indicative value", "Katastrálne územie": "Cadastral area",
  "Zhrnutie": "Summary", "Kľúčové zistenia": "Key findings", "Vhodnosť podľa využitia": "Suitability by use", "Semafor": "Traffic light", "Čo overiť pred kúpou — výber": "What to verify before purchase — selection",
  "Obsah dokumentu": "Contents", "Čo to pre vás znamená": "What this means for you", "Pripravené pre": "Prepared for", "Dokument": "Document", "údaje katastra k": "cadastre data as of",
  "Rodinný dom": "Family house", "Chata / rekreácia": "Cottage / leisure", "Investícia (prenájom)": "Investment (rental)", "Developer (viac jednotiek)": "Developer (multiple units)",
};
const nf = (n: number, d = 0) => n.toLocaleString("en-GB", { maximumFractionDigits: d });
const eur = (n: number | null | undefined) => (n == null ? "—" : `€${nf(Math.round(n))}`);

export function enFindings(d: SheetData, fin: FinResult | null): string[] {
  const c = d.core; const mk = mainKey(c); const out: string[] = [];
  if (c.compStats?.estimateEur) out.push(`Indicative value ${eur(c.compStats.estimateEur)} based on ${c.compStats.n} comparable sales recorded in the cadastre (median €${nf(c.compStats.medPpm2 ?? 0)}/m²).`);
  const z = zoneOf(d); out.push(z.name ? `Zoning plan: ${z.name} (Slovak zoning category).` : "No zoning category on record — to be confirmed with the municipality.");
  const pr = mk ? fact(c, "pristup", mk) : null; if (pr?.trieda) out.push(/priamy/i.test(String(pr.trieda)) ? "Direct access from a public road." : /cez/i.test(String(pr.trieda)) ? "Access via a private road — an easement should be secured." : "No legal access from a public road.");
  const t = mk ? fact(c, "teren", mk) : null; if (t) out.push(`Terrain: average slope ${nf(Number(t.sklon_avg ?? 0), 1)} %.`);
  const hits = [...(d.limits?.items ?? []).filter((h) => h.hit), ...(d.ext ?? []).filter(riskyHit)];
  out.push(hits.length ? `${hits.length} hit(s) in official constraint registers (flood, landslide, protection zones etc.) — see chapter Constraints.` : "No hits in the monitored constraint registers.");
  if (fin?.mortgage) out.push(`Financing: with an ${Math.round(fin.inputs.ltv * 100)} % loan the payment is about ${eur(fin.mortgage.payment)} per month; own funds about ${eur(fin.mortgage.ownFunds.total)}.`);
  if (fin?.prediction) out.push(`Value in 5 years (base scenario): about ${eur(fin.prediction.scenarios[1].values[2])}.`);
  return out;
}

export function enExplain(id: string, d: SheetData, fin: FinResult | null): string[] {
  const c = d.core;
  switch (id) {
    case "prehlad": return ["The title deed (list vlastníctva, LV) is the official cadastre record of owners (part B), the property (part A) and third-party rights such as mortgages or easements (part C). Always obtain a current official extract before signing."];
    case "vlastnictvo": { const n = c.owners.perLv.reduce((s, l) => s + l.count, 0); return [n <= 1 ? "Single owner — the simplest negotiation and signing." : `${n} co-owners — all must sign to sell the whole; a co-owner selling a share must first offer it to the others.`]; }
    case "pravo": return [c.legal.reduce((s, l) => s + l.tarchyCount, 0) ? "Encumbrances are registered (e.g. bank mortgage, easement, pre-emption right). A mortgage is normally repaid from the purchase price and deleted; an easement passes to the new owner." : "No encumbrance in our record — the official extract on the day of signing is decisive."];
    case "up": return ["The municipal zoning plan defines what may be built. Building in agricultural or green zones is not possible without a plan change, which usually takes 1–3 years."];
    case "limity": return ["Constraints do not mean prohibition — they mean consent of the relevant authority or operator and sometimes a more expensive technical solution."];
    case "teren": return ["Slope and winter sun drive construction cost and heating demand; the monthly chart shows hours of direct sunlight including terrain (and buildings/trees where available)."];
    case "siete": return ["Utility connections (power, water, sewer, gas) can cost from hundreds to tens of thousands of euros; exact routes are confirmed only by the operators' statements."];
    case "hodnota": return ["The estimate uses actual sale prices from contracts recorded in the cadastre, not asking prices. It is not a formal valuation; a bank uses its own valuer."];
    case "predikcia": return fin?.prediction ? [`If the market develops as so far, the value in 5 years is about ${eur(fin.prediction.scenarios[1].values[2])} (range ${eur(fin.prediction.scenarios[0].values[2])} – ${eur(fin.prediction.scenarios[2].values[2])}). A forecast is not a promise.`] : [];
    case "financovanie": return fin?.mortgage ? [`Loan ${eur(fin.mortgage.loan)} over ${fin.inputs.years} years at ${nf(fin.mortgage.rate, 2)} %: about ${eur(fin.mortgage.payment)} per month. Slovak central bank rules require the payment to be affordable at a 2-point higher rate (max 6 %), so a net household income of about ${eur(fin.mortgage.income.netMonthly)} per month is needed.`] : [];
    case "naklady": return fin ? [`Add one-off purchase costs of about ${eur(fin.costs.oneOffTotal)} and annual ownership costs of about ${eur(fin.costs.annualTotal)}. There is no property transfer tax in Slovakia.`] : [];
    case "poistenie": return fin?.insurance?.rebuild ? [`Insure the building for its rebuild cost (about ${eur(fin.insurance.rebuild)}), not the market price, to avoid under-insurance.`] : [];
    case "investicia": return fin?.invest.gross != null ? [`Gross yield ${nf(fin.invest.gross, 1)} %, net yield ${nf(fin.invest.net ?? 0, 1)} % per year. Figures are model calculations, not investment advice.`] : [];
    case "postup": return ["Steps from decision to registration in the cadastre; the cadastre decides on registration within 30 days (15 days in the expedited procedure)."];
    case "overit": return ["Checklist generated from findings in this sheet — verify before signing or paying a deposit."];
    default: return [];
  }
}
