// Formulácie, ktoré klientsky výstup NESMIE tvrdiť bez primeraného dôkazu (dok. 16 §4).
//
// Prečo v kóde: kontrakt ich mal len ako tabuľku v dokumentácii a „držali sa ručne" (review
// 2026-11-10). Texty v reporte však z veľkej časti nepíše appka, ale enginy na Macu (dôvody,
// neistoty, popisy) — a tie sa menia bez toho, aby ich niekto čítal. Preto dve kontroly nad
// tým istým zoznamom:
//   1. pri zostavení klientskeho reportu (`phraseIssues` v getClientReport) — report to ukáže
//      v dôkazovej prílohe a výskyty sú aj v JSON exporte,
//   2. pri builde (`scripts/phrase-guard.mjs`) — build padne, ak sa formulácia objaví v UI texte.
//
// Pozor: JS `\w` nezachytí diakritiku („povolenú") → `\p{L}` s príznakom `u`.
// Samostatný modul BEZ importov: číta ho aj build skript (bun importuje .ts priamo).

export type ForbiddenPhrase = { id: string; re: RegExp; claim: string; use: string };

export const FORBIDDEN_PHRASES: ForbiddenPhrase[] = [
  {
    id: "neobyva",
    re: /vlastn[íi][kc]\p{L}*\s+(tu|tam|v\s+(byte|nehnuteľnosti))\s+neb[ýy]v|\bneb[ýy]va\s+(tu|v\s+(byte|nehnuteľnosti))/iu,
    claim: "Vlastník tu nebýva.",
    use: "Evidovaná adresa relevantného vlastníka sa podľa zdroja nezhoduje s adresou nehnuteľnosti na uvedenej úrovni presnosti.",
  },
  {
    id: "povolena-vystavba",
    re: /povolen\p{L}*\s+výstavb/iu,
    claim: "Pozemok má povolenú výstavbu.",
    use: "Podľa uvedeného regulatívu bol vyhodnotený súlad účelu; platia uvedené podmienky a obmedzenia.",
  },
  {
    id: "bez-povodne",
    re: /bez\s+povodňov\p{L}*\s+rizik/iu,
    claim: "Bez povodňového rizika.",
    use: "Bez prieniku s použitou vrstvou/scenárom v dostupnom pokrytí.",
  },
  {
    id: "pripojenie",
    re: /pripojeni\p{L}*[^.\n]{0,30}\bzabezpečen/iu,
    claim: "Pripojenie je zabezpečené.",
    use: "Vedenie je vo vzdialenosti X; kapacita a pripojenie majú samostatný doložený alebo neznámy stav.",
  },
  {
    id: "predaj-za",
    re: /\bpredal[aoi]?\s+(sa\s+)?za\b|\bsa\s+predal[aoi]?\s+za\b/iu,
    claim: "Pozemok sa predal za X.",
    use: "Ponuková cena v inzeráte k dátumu X je Y (ak nie je dôkaz transakcie).",
  },
  {
    id: "vsetky-lokality",
    re: /všetky\s+vhodn\p{L}*\s+(lokalit|pozemk|byt|parcel)/iu,
    claim: "Toto sú všetky vhodné lokality.",
    use: "Výsledky v deklarovanom rozsahu a podľa uvedenej úplnosti vyhľadávania.",
  },
];

export type PhraseIssue = { id: string; claim: string; use: string; n: number; sample: string };

/** Nájde zakázané formulácie v zozname textov (dôvody, neistoty, popisy kandidátov). */
export function phraseIssues(texts: (string | null | undefined)[]): PhraseIssue[] {
  const out = new Map<string, PhraseIssue>();
  for (const t of texts) {
    if (!t) continue;
    for (const p of FORBIDDEN_PHRASES) {
      const m = p.re.exec(t);
      if (!m) continue;
      const cur = out.get(p.id);
      if (cur) cur.n += 1;
      else {
        const from = Math.max(0, m.index - 30);
        out.set(p.id, { id: p.id, claim: p.claim, use: p.use, n: 1, sample: (from > 0 ? "…" : "") + t.slice(from, m.index + m[0].length + 30) + "…" });
      }
    }
  }
  return [...out.values()];
}
