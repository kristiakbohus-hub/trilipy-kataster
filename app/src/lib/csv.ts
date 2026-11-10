// CSV pre Excel (slovenské nastavenie: „;" ako oddeľovač, BOM kvôli diakritike).
//
// Bunka sa vždy dáva do úvodzoviek a text začínajúci = + - @ (alebo tabulátorom/CR) dostane
// apostrof — inak by ho Excel/LibreOffice vyhodnotil ako vzorec (CSV injection, dok. 10 §7).
// Text v reporte pochádza aj z enginov a inzerátov, teda z obsahu, ktorý appka nepísala.
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(";");
}

export function csvDocument(lines: string[]): string {
  return "﻿" + lines.join("\r\n");
}
