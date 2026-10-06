import { createFileRoute } from "@tanstack/react-router";
import { ingestScenarioRun } from "../lib/api/kataster.functions";

// POST /api/ingest-scenario-run — štatistika behu scenára per k.ú. (examined/match/rejected + dôvody).
// Podklad pre sekciu F klientskeho reportu („prečo iné kandidáty neprešli").
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
export const Route = createFileRoute("/api/ingest-scenario-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestScenarioRun({ data: { secret, rows: rows as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
