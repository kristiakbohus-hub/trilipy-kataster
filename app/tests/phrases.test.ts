// Zakázané formulácie (dok. 16 §4): každé zakázané tvrdenie z tabuľky musí stráž zachytiť
// a jeho korektná náhrada (aj text, ktorý appka bežne píše) NESMIE spustiť falošný poplach.
import { describe, expect, test } from "bun:test";
import { FORBIDDEN_PHRASES, phraseIssues } from "../src/lib/phrases";

const hit = (t: string) => FORBIDDEN_PHRASES.filter((p) => p.re.test(t)).map((p) => p.id);

describe("zakázané tvrdenia z dok. 16 §4 sa zachytia", () => {
  const cases: [string, string][] = [
    ["Vlastník tu nebýva.", "neobyva"],
    ["vlastníci v byte nebývajú", "neobyva"],
    ["Pozemok má povolenú výstavbu Lidlu.", "povolena-vystavba"],
    ["Bez povodňového rizika.", "bez-povodne"],
    ["Pripojenie elektriny je zabezpečené.", "pripojenie"],
    ["Tento pozemok sa predal za 120 000 €.", "predaj-za"],
    ["Toto sú všetky vhodné lokality.", "vsetky-lokality"],
  ];
  for (const [text, id] of cases) {
    test(text, () => expect(hit(text)).toContain(id));
  }
});

describe("korektné formulácie neprechádzajú ako zakázané", () => {
  const ok = [
    ...FORBIDDEN_PHRASES.map((p) => p.use),
    "Evidovaná adresa relevantného vlastníka sa nezhoduje s adresou nehnuteľnosti.",
    "Bez prieniku s použitou vrstvou/scenárom v dostupnom pokrytí.",
    "Ponuková cena v inzeráte k dátumu 1. 11. 2026 je 120 000 €.",
    "Výsledky v deklarovanom rozsahu a podľa uvedenej úplnosti vyhľadávania.",
    "Informatívny analytický podklad z dostupných zdrojov — nie úradný výpis, znalecký posudok ani právne stanovisko.",
    "zoning (retail): občianska vybavenosť / zmiešané OV",
    "úzky krk spojenia (0 m) — dva samostatné bloky, nie súvislá použiteľná plocha",
  ];
  for (const text of ok) {
    test(text.slice(0, 60), () => expect(hit(text)).toEqual([]));
  }
});

test("phraseIssues zráta výskyty a vráti náhradu", () => {
  const out = phraseIssues(["Vlastník tu nebýva.", null, "vlastníci tam nebývajú", "OK text"]);
  expect(out.length).toBe(1);
  expect(out[0].id).toBe("neobyva");
  expect(out[0].n).toBe(2);
  expect(out[0].use.length).toBeGreaterThan(10);
});
