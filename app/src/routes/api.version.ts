import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "../lib/bindings.server";

// GET /api/version — ktorý commit práve beží (verejné: len sha a čas buildu, nič citlivé).
// Dôvod: repozitár je súkromný → stav nasadenia sa už nedá čítať z verejného GitHub API. Mac (deploy_wait)
// sa pýta priamo appky: beží už nový commit? Pri zlyhaní buildu/migrácie workflow zapíše chybu do KV
// (`build:last_fail`); tú vráti len s hlavičkou x-alert-secret (kľúč Macu podľa SHA-256 v D1, alebo cloudový alert_secret).
declare const __BUILD_SHA__: string;
declare const __BUILD_AT__: string;

function eq(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const out: Record<string, unknown> = { sha: __BUILD_SHA__, built_at: __BUILD_AT__ };
        const secret = request.headers.get("x-alert-secret") ?? "";
        if (secret) {
          const { DB, KV } = bindings();
          // kľúč Macu (v D1 len SHA-256, 0116) alebo cloudový alert_secret — stav buildu smú vidieť oba
          const rows = DB ? (await DB.prepare("SELECT key, value FROM market_meta WHERE key IN ('alert_secret','ingest_secret_sha256')").all<{ key: string; value: string }>()).results ?? [] : [];
          const m = new Map(rows.map((r): [string, string] => [r.key, r.value]));
          const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))), (b) => b.toString(16).padStart(2, "0")).join("");
          if ((eq(hex, m.get("ingest_secret_sha256")) || eq(secret, m.get("alert_secret"))) && KV) {
            const raw = await KV.get("build:last_fail");
            out.last_fail = raw ? (() => { try { return JSON.parse(raw) as unknown; } catch { return raw; } })() : null;
          }
        }
        return new Response(JSON.stringify(out), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
