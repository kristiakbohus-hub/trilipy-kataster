#!/usr/bin/env node
// Regresná stráž autorizácie — beží v `bun run build`, takže porušenie zhodí build v CI aj pri deployi.
//
// Prečo existuje: 20 server funkcií kedysi odvodzovalo rolu z tela požiadavky (`data.role as Role`),
// pričom klient si rolu drží len v localStorage (demo kontext). Stačilo prepísať jednu hodnotu v
// devtools a appka ju brala ako autorizáciu — viewer sa dostal na mená vlastníkov, `exportBackup`
// nad celou DB aj na zápisy. Server fn sú VEREJNÉ POST endpointy a prihlasovacia brána je len na
// klientovi, takže kontrola musí byť na serveri a rola musí prísť zo session (`roleFromToken`).
//
// Tento skript staticky vynucuje tri invarianty nad kataster.functions.ts:
//   1. Žiadny handler nerozhoduje podľa `data.role` (predikát roly ani `data.role as Role`).
//   2. Každý handler s rolovým predikátom (ownerAccess/canSeeOwners/canExport/canRunPipeline/canSign)
//      musí mať v tele odvodenie roly zo session (roleFromToken/userFromToken/requireUser(data.token)).
//   3. Každý handler, čo ZAPISUJE (INSERT/UPDATE/DELETE), musí mať session odvodenie alebo secret
//      (data.secret) — okrem auditovaného zoznamu výnimiek nižšie.
//
// Keď pribudne funkcia, ktorá niektorý invariant poruší, build padne s menom funkcie a dôvodom.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "lib", "api", "kataster.functions.ts");

// Výnimky — každá má dôvod, prečo nepotrebuje session rolu. Pridanie sem je vedomé rozhodnutie.
// (prihlásenie/registrácia/odhlásenie už nie sú server funkcie — bežia cez /api/auth, src/lib/auth.server.ts)
const WRITE_EXCEPTIONS = new Map([
  ["esknIdentify", "zápis len do reg_cache (read-through cache VEREJNÝCH ÚGKK/ESKN dát na súradnici); nevracia identitu vlastníka"],
]);

const src = readFileSync(SRC, "utf8");

// Invariant 0 — BRÁNA: každé volanie /_serverFn/* musí overiť session v request middleware (src/start.ts).
// Bez nej bolo 69 zo 161 funkcií volateľných z internetu bez prihlásenia (review 2026-11-10).
const START = readFileSync(join(HERE, "..", "src", "start.ts"), "utf8");
const gateOk = /\/_serverFn\//.test(START) && /userForToken\(/.test(START) && /requestMiddleware:\s*\[[^\]]*sessionGate/.test(START);
if (!gateOk) {
  console.error("\n✗ authz-guard: src/start.ts nemá session bránu pre /_serverFn/* v requestMiddleware — server funkcie by boli verejné.\n");
  process.exit(1);
}

// Rozsekaj na funkcie: telo = od `export const NAME = createServerFn` po ďalší taký začiatok (alebo EOF).
const starts = [...src.matchAll(/^export const (\w+) = createServerFn/gm)];
const fns = starts.map((m, i) => {
  const from = m.index;
  const to = i + 1 < starts.length ? starts[i + 1].index : src.length;
  return { name: m[1], body: src.slice(from, to) };
});

// Telo handlera (bez validátora) — tam patrí autorizačná logika. Komentáre odstránime, nech
// `// … data.role …` nespúšťa falošný poplach.
function handlerOf(body) {
  const h = body.indexOf(".handler");
  const scope = h >= 0 ? body.slice(h) : body;
  return scope
    .replace(/\/\/[^\n]*/g, "")       // riadkové komentáre
    .replace(/\/\*[\s\S]*?\*\//g, ""); // blokové komentáre
}

const ROLE_PREDICATE = /\b(ownerAccess|canSeeOwners|canExport|canRunPipeline|canSign)\s*\(/;
const CLIENT_ROLE_GATE = /\b(ownerAccess|canSeeOwners|canExport|canRunPipeline|canSign)\s*\(\s*data\.role\b|data\.role\s*(===|!==|as\s+Role)/;
const SESSION = /(roleFromToken|userFromToken|requireUser)\s*\(\s*data\.token\s*\)/;
const SECRET = /data\.secret\b/;
const WRITE = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/i;

const violations = [];
for (const { name, body } of fns) {
  const h = handlerOf(body);

  // Invariant 1 — nijaký handler nesmie rozhodovať podľa roly z tela požiadavky.
  if (CLIENT_ROLE_GATE.test(h)) {
    violations.push(`${name}: rozhoduje podľa \`data.role\` z tela požiadavky (musí ísť zo session cez roleFromToken(data.token))`);
  }

  // Invariant 2 — ak má rolový predikát, rola musí byť zo session.
  if (ROLE_PREDICATE.test(h) && !SESSION.test(h) && !SECRET.test(h)) {
    violations.push(`${name}: používa rolový predikát, ale neodvodzuje rolu zo session (chýba roleFromToken/userFromToken/requireUser(data.token))`);
  }

  // Invariant 3 — zapisujúce funkcie potrebujú session alebo secret.
  if (WRITE.test(h) && !SESSION.test(h) && !SECRET.test(h) && !WRITE_EXCEPTIONS.has(name)) {
    violations.push(`${name}: ZAPISUJE bez session a bez secret (pridaj requireUser(data.token), alebo ak je to zámer, zapíš výnimku do WRITE_EXCEPTIONS v authz-guard.mjs)`);
  }
}

if (violations.length) {
  console.error(`\n✗ authz-guard: ${violations.length} porušení autorizácie v kataster.functions.ts:\n`);
  for (const v of violations) console.error("  • " + v);
  console.error("\nPozri app/scripts/authz-guard.mjs — autorizácia musí prísť zo session, nie z tela požiadavky.\n");
  process.exit(1);
}

console.log(`✓ authz-guard: ${fns.length} server funkcií, autorizácia všade zo session alebo secret (${WRITE_EXCEPTIONS.size} auditované výnimky).`);
