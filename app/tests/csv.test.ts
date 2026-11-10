// CSV export klientskeho reportu: text začínajúci znakom vzorca sa NESMIE dostať do Excelu ako vzorec
// (dok. 10 §7, test E15 — export injection). Úvodzovky a diakritika musia prežiť.
import { expect, test } from "bun:test";
import { csvCell, csvDocument, csvLine } from "../src/lib/csv";

test("vzorce dostanú apostrof", () => {
  expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
  expect(csvCell("+1")).toBe(`"'+1"`);
  expect(csvCell("-2+3")).toBe(`"'-2+3"`);
  expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  expect(csvCell("\t=1")).toBe(`"'\t=1"`);
});

test("bežný text a čísla ostanú, úvodzovky sa zdvoja", () => {
  expect(csvCell("Žilina 874604")).toBe(`"Žilina 874604"`);
  expect(csvCell('podiel "1/2"')).toBe(`"podiel ""1/2"""`);
  expect(csvCell(5000)).toBe(`"5000"`);
  expect(csvCell(null)).toBe(`""`);
});

test("riadok so stredníkom a dokument s BOM a CRLF", () => {
  expect(csvLine(["a", 1, null])).toBe(`"a";"1";""`);
  const doc = csvDocument(["x", "y"]);
  expect(doc.charCodeAt(0)).toBe(0xfeff);
  expect(doc.slice(1)).toBe("x\r\ny");
});
