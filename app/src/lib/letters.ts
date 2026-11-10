// Listy možným kupcom (plán vlastníka 2026-11-10: popri pozemkoch rovno aj kupci).
// Adresa ide z katastra (pole vlastníka „Priezvisko Meno r. Rodné, Ulica 12, Obec, PSČ 010 01, SR")
// alebo z registra firiem — appka kontakty osôb NEDOHĽADÁVA. Text je ZISŤOVANIE ZÁUJMU, nie ponuka
// pozemku, ktorý nám nepatrí; päta nesie informáciu o zdroji adresy a práve odmietnuť kontakt (GDPR).

export type LetterRecipient = { key: string; label: string; group: "sused" | "kupec" | "firma" | "register"; lvNo: number | null };
export type LetterJob = { datasetId: string; parcelNo: string; kuName: string | null; areaM2: number | null; recipients: LetterRecipient[] };

const TITLE_RX = /^(Ing|Mgr|Bc|MUDr|JUDr|PhDr|RNDr|PaedDr|MVDr|doc|prof|PhD|MBA|Dr|Ing\. arch)\.?$/i;

/** „Novák Ján r. Nováková, Ing., Hlavná 12, Žilina, PSČ 010 01, SR" → meno + riadky adresy. */
export function splitAddress(raw: string): { name: string; lines: string[]; complete: boolean } {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const name0 = (parts[0] ?? raw).replace(/\s+r\.\s+.*$/i, "").trim();        // bez rodného priezviska
  const rest = parts.slice(1).filter((p) => !/^(SR|Slovensk[áa] republika)$/i.test(p));
  const titles: string[] = [];
  while (rest.length && TITLE_RX.test(rest[0])) titles.push(rest.shift() as string);
  const pscIdx = rest.findIndex((p) => /^(PSČ\s*)?\d{3}\s?\d{2}$/i.test(p));
  if (pscIdx >= 0) {
    const psc = rest[pscIdx].replace(/^PSČ\s*/i, "");
    rest.splice(pscIdx, 1);
    if (rest.length) rest[rest.length - 1] = `${psc} ${rest[rest.length - 1]}`; else rest.push(psc);
  }
  return { name: titles.length ? `${titles.join(" ")} ${name0}` : name0, lines: rest, complete: rest.length >= 2 && pscIdx >= 0 };
}

const WHY: Record<LetterRecipient["group"], string> = {
  sused: "Obraciame sa na Vás ako na vlastníka susedného pozemku. Pozemok, o ktorom píšeme, susedí s Vaším a mohol by byť vhodným rozšírením Vašej nehnuteľnosti.",
  kupec: "Obraciame sa na Vás ako na vlastníka nehnuteľnosti v tejto lokalite.",
  firma: "Obraciame sa na Vašu spoločnosť, pretože vlastníte nehnuteľnosti v tejto lokalite.",
  register: "Obraciame sa na Vašu spoločnosť, pretože podnikáte v tomto regióne.",
};

export function defaultBody(r: LetterRecipient, job: LetterJob): string {
  const area = job.areaM2 ? ` s výmerou ${Math.round(job.areaM2).toLocaleString("sk-SK")} m²` : "";
  return [
    "Dobrý deň,",
    "",
    WHY[r.group],
    "",
    `V katastrálnom území ${job.kuName ?? "—"} sa nachádza pozemok parc. č. ${job.parcelNo}${area}. Zisťujeme, či by ste o takýto pozemok mali záujem. Ak áno, radi Vám poskytneme bližšie informácie a možnosti ďalšieho postupu.`,
    "",
    "Ozvite sa nám prosím telefonicky alebo e-mailom — kontakt je uvedený nižšie.",
  ].join("\n");
}

export function privacyNote(r: LetterRecipient): string {
  const src = r.group === "register" ? "z verejného Registra právnických osôb (ŠÚ SR)" : "z verejne prístupného katastra nehnuteľností";
  return `Vašu adresu sme získali ${src} výlučne na účel tohto jednorazového oslovenia. Ak si neželáte ďalší kontakt, oznámte nám to a Vaše údaje vyradíme (čl. 21 nariadenia GDPR).`;
}
