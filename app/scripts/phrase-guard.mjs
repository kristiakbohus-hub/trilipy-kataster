#!/usr/bin/env bun
// Stráž formulácií — beží v `bun run build`, takže zakázaná formulácia v UI texte zhodí build.
//
// Dok. 16 §4 vymenúva tvrdenia, ktoré klientsky výstup nesmie robiť bez dôkazu („Vlastník tu nebýva",
// „Bez povodňového rizika", „Toto sú všetky vhodné lokality"…). Dovtedy sa držali len ručne. Zoznam
// je v src/lib/phrases.ts a ten istý zoznam kontroluje aj getClientReport pri texte z enginov.
//
// Kontroluje sa celý src/ okrem samotného zoznamu. Komentáre sa vynechávajú — vysvetlenie, PREČO je
// formulácia zakázaná, ju smie citovať.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PHRASES } from "../src/lib/phrases.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const SKIP = new Set([join(SRC, "lib", "phrases.ts")]);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name) && !SKIP.has(p)) yield p;
  }
}

const hits = [];
for (const f of files(SRC)) {
  const code = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))   // blokové komentáre (zachovaj riadky)
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");                          // riadkové komentáre (nie URL)
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    for (const p of FORBIDDEN_PHRASES) {
      if (p.re.test(line)) hits.push(`${relative(join(HERE, ".."), f)}:${i + 1} — „${p.claim}" → použi: ${p.use}`);
    }
  });
}

if (hits.length) {
  console.error(`\n✗ phrase-guard: ${hits.length} zakázaných formulácií (dok. 16 §4):\n`);
  for (const h of hits) console.error("  • " + h);
  console.error("\nZoznam a náhrady: app/src/lib/phrases.ts\n");
  process.exit(1);
}
console.log(`✓ phrase-guard: ${FORBIDDEN_PHRASES.length} zakázaných formulácií, v src/ žiadna.`);
