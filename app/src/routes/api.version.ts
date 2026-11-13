import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "../lib/bindings.server";

// GET /api/version — ktorý commit práve beží (verejné: len sha a čas buildu, nič citlivé).
// Dôvod: repozitár je súkromný → stav nasadenia sa už nedá čítať z verejného GitHub API. Mac (deploy_wait)
// sa pýta priamo appky: beží už nový commit? Pri zlyhaní buildu/migrácie workflow zapíše chybu do KV
// (`build:last_fail`); tú vráti len s hlavičkou x-alert-secret (= D1 market_meta.alert_secret).
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
          const expected = DB ? (await DB.prepare("SELECT value FROM market_meta WHERE key='alert_secret'").first<{ value: string }>())?.value : undefined;
          if (eq(secret, expected) && KV) {
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
