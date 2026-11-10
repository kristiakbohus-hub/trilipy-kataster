// Listy kupcom: adresa sa skladá z poľa vlastníka v katastri („Priezvisko Meno r. Rodné, Ulica, Obec,
// PSČ, SR"). Chyba tu = list príde na zlú adresu alebo s rodným priezviskom na obálke.
import { expect, test } from "bun:test";
import { defaultBody, privacyNote, splitAddress, type LetterJob } from "../src/lib/letters";
import { FORBIDDEN_PHRASES } from "../src/lib/phrases";

test("osoba: bez rodného priezviska, PSČ pred obcou, bez SR", () => {
  const a = splitAddress("Novák Ján r. Nováková, Hlavná 12, Žilina, PSČ 010 01, SR");
  expect(a.name).toBe("Novák Ján");
  expect(a.lines).toEqual(["Hlavná 12", "010 01 Žilina"]);
  expect(a.complete).toBe(true);
});

test("titul ide pred meno", () => {
  const a = splitAddress("Kováč Peter, Ing., Lesná 5/3, Čadca, PSČ 022 01, SR");
  expect(a.name).toBe("Ing. Kováč Peter");
  expect(a.lines).toEqual(["Lesná 5/3", "022 01 Čadca"]);
});

test("neúplná adresa (firma z registra) je označená", () => {
  const a = splitAddress("ABC Develop s.r.o., Žilina");
  expect(a.name).toBe("ABC Develop s.r.o.");
  expect(a.complete).toBe(false);
});

test("text listu je zisťovanie záujmu a nemá zakázané tvrdenia", () => {
  const job: LetterJob = { datasetId: "kn-1", parcelNo: "123/4", kuName: "Budatín", areaM2: 812, recipients: [] };
  for (const g of ["sused", "kupec", "firma", "register"] as const) {
    const r = { key: g, label: "X", group: g, lvNo: null };
    const t = defaultBody(r, job) + privacyNote(r);
    expect(t).toContain("123/4");
    expect(t).toContain("Zisťujeme");
    expect(FORBIDDEN_PHRASES.filter((p) => p.re.test(t))).toEqual([]);
    expect(privacyNote(r)).toContain("GDPR");
  }
});
