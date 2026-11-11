// Dopyt z voľného textu → polia formulára (bod 11, 2026-11-11). Rozhodnutie vlastníka: BEZPLATNÉ pravidlá,
// bez AI. Čisto na klientovi, nič sa nikam neposiela. Čo pravidlá nespoznajú, ostane prázdne na doplnenie.
//   „Hľadám pozemok na rodinný dom 800–1200 m² do 60 tisíc okolo Turzovky alebo okres Čadca, v zastavanom území"
export type ParsedDemand = {
  ptype?: "pozemok" | "byt" | "dom" | "chata" | "komercne";
  purpose?: "residential" | "retail" | "industrial" | "rekreacia";
  areaMin?: number; areaMax?: number; budgetMax?: number;
  locations?: string; timeframe?: string;
  intravilan?: boolean; cleanTitle?: boolean; maxOwners?: number;
  recognized: string[];
};

const low = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

function amount(n: number, unit: string | undefined): number {
  const u = low(unit ?? "");
  if (/^mil/.test(u)) return n * 1_000_000;
  if (/^(tis|k\b|k$|tisic)/.test(u)) return n * 1000;
  return n < 1000 ? n * 1000 : n;              // „do 60" pri nehnuteľnosti = 60 tisíc
}
function area(n: number, unit: string): number {
  const u = low(unit);
  if (/^ha/.test(u)) return n * 10_000;
  if (/^a(r|ro|rov)?\b|^ar/.test(u)) return n * 100;
  return n;
}

/** Hrubý návrat do 1. pádu pre názvy obcí: „okolo Turzovky", „v Žiline", „v Čadci", „v Ružomberku". */
function nominative(w: string): string {
  return w.replace(/(ovky|ovke)$/i, "ovka").replace(/ine$/i, "ina").replace(/([dc])ci$/i, "$1ca").replace(/rku$/i, "rok")
    .replace(/ke$/i, "ka").replace(/(ovej|ovú)$/i, "ová").replace(/([^aeiouyáéíóúý])y$/i, "$1a");
}

export function parseDemand(text: string): ParsedDemand {
  const t = text.trim();
  const l = low(t);
  const out: ParsedDemand = { recognized: [] };
  // typ = PRVÝ spomenutý („pozemok na rodinný dom" = pozemok, „chata s pozemkom 10 árov" = chata)
  const TYPES: [NonNullable<ParsedDemand["ptype"]>, RegExp][] = [
    ["pozemok", /pozem|parcel|stavebn\w* miest/], ["chata", /\bchat|chalup|zrub|drevenic|rekreacn\w* objekt/],
    ["byt", /\bbyt|garson|\d\s*[-+]?\s*izb/], ["dom", /\bdom\b|rodinn\w* dom|\brd\b|bungalov|domcek/],
    ["komercne", /komerc|sklad|\bhal|kancel|obchodn\w* priestor|prevadzk/],
  ];
  let best = Infinity;
  for (const [k, rx] of TYPES) { const i = l.search(rx); if (i >= 0 && i < best) { best = i; out.ptype = k; } }
  if (out.ptype) out.recognized.push(`typ: ${out.ptype}`);
  // účel pozemku
  if (out.ptype === "pozemok") {
    if (/rekrea|chat|chalup/.test(l)) out.purpose = "rekreacia";
    else if (/sklad|\bhal|vyrob|priemys|logist/.test(l)) out.purpose = "industrial";
    else if (/obchod|retail|predajn|supermarket/.test(l)) out.purpose = "retail";
    else if (/na dom|rodinn|byvan|stavebn/.test(l)) out.purpose = "residential";
    if (out.purpose) out.recognized.push(`účel: ${out.purpose}`);
  }
  // výmera: rozsah, od/do, „aspoň", ár/ha
  const U = "(m2|m²|m\\s*2|metrov|ar\\w*|ár\\w*|á\\b|ha\\b|hektar\\w*)";
  let m = t.match(new RegExp(`(\\d[\\d\\s.,]*)\\s*(?:-|–|až|do)\\s*(\\d[\\d\\s.,]*)\\s*${U}`, "i"));
  if (m) { out.areaMin = area(num(m[1]), m[3]); out.areaMax = area(num(m[2]), m[3]); }
  else {
    m = t.match(new RegExp(`(?:od|aspo[nň]|min(?:imálne|\\.)?|nad)\\s*(\\d[\\d\\s.,]*)\\s*${U}`, "i"));
    if (m) out.areaMin = area(num(m[1]), m[2]);
    m = t.match(new RegExp(`(?:do|max(?:imálne|\\.)?|najviac)\\s*(\\d[\\d\\s.,]*)\\s*${U}`, "i"));
    if (m) out.areaMax = area(num(m[1]), m[2]);
    if (out.areaMin == null && out.areaMax == null) {
      m = t.match(new RegExp(`(?:^|\\s)(\\d[\\d\\s.,]*)\\s*${U}`, "i"));
      if (m) { const a = area(num(m[1]), m[2]); out.areaMin = Math.round(a * 0.8); out.areaMax = Math.round(a * 1.2); }
    }
  }
  if (out.areaMin != null || out.areaMax != null) out.recognized.push(`výmera ${out.areaMin ?? ""}–${out.areaMax ?? ""} m²`);
  // rozpočet
  for (const mb of t.matchAll(/(?:do|max(?:imálne)?|rozpo[čc]et|za|najviac)\s*(\d[\d\s.,]*)\s*(mil\w*|tis\w*|k\b|€|eur\w*)?/gi)) {
    const rest = t.slice((mb.index ?? 0) + mb[0].length);
    if (new RegExp(`^\\s*${U}`, "i").test(rest) || /^\s*-?\s*(vlastn|izb|podla|poschod|mesiac|týž|rok)/i.test(rest)) continue;
    const v = amount(num(mb[1]), mb[2]);
    if (v >= (mb[2] ? 1000 : 5000) && v < 50_000_000) { out.budgetMax = Math.round(v); out.recognized.push(`rozpočet do ${out.budgetMax} €`); break; }
  }
  // lokality: „okres X", „k.ú. X", po predložkách v/vo/okolo/pri/blízko/v okolí
  const locs = new Set<string>();
  for (const mm of t.matchAll(/okres\w*\s+([A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ][\wáäčďéíĺľňóôŕšťúýž-]+(?:\s+(?:nad|pod|pri)\s+[A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ][\wáäčďéíĺľňóôŕšťúýž-]+|\s+[A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ][\wáäčďéíĺľňóôŕšťúýž-]+)?)/g)) locs.add(`okres ${mm[1]}`);
  for (const mm of t.matchAll(/(?:\bv|\bvo|okolo|okolie|pri|blízko|v okolí|lokalit\w*|k\.\s*ú\.)\s+([A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ][\wáäčďéíĺľňóôŕšťúýž-]+(?:\s+(?:nad|pod|pri)\s+[A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ][\wáäčďéíĺľňóôŕšťúýž-]+)?)/g)) {
    const w = mm[1];
    if (/^(okres|centre|meste|obci|zastavanom|okolí)$/i.test(w)) continue;
    locs.add(nominative(w));
  }
  for (const mm of t.matchAll(/,\s*([A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ][\wáäčďéíĺľňóôŕšťúýž-]+)(?=\s*(?:,|$|\.|alebo|a\s))/g)) locs.add(mm[1]);
  if (locs.size) { out.locations = [...locs].join(", "); out.recognized.push(`lokalita: ${out.locations}`); }
  // podmienky
  if (/zastavan\w* uzem|intravilan/.test(l)) { out.intravilan = true; out.recognized.push("v zastavanom území"); }
  if (/bez tarch|bez zatazen|cist\w* (lv|list)/.test(l)) { out.cleanTitle = true; out.recognized.push("LV bez ťarchy"); }
  m = l.match(/(?:max(?:imalne)?|najviac)\s*(\d+)\s*vlastnik/);
  if (m) { out.maxOwners = Number(m[1]); out.recognized.push(`max. ${out.maxOwners} vlastníkov`); }
  else if (/jeden vlastnik|1 vlastnik|jedin\w* vlastnik/.test(l)) { out.maxOwners = 1; out.recognized.push("1 vlastník"); }
  // termín
  m = t.match(/(do\s+\d+\s+(?:mesiac\w*|týž\w*|rok\w*)|do konca roka|čo najskôr|ihneď|súrne)/i);
  if (m) { out.timeframe = m[1]; out.recognized.push(`kedy: ${out.timeframe}`); }
  return out;
}
