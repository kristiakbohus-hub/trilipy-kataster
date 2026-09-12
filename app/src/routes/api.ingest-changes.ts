import { createFileRoute } from "@tanstack/react-router";
import { ingestChanges } from "../lib/api/kataster.functions";

// POST /api/ingest-changes — bulk zápis zmien z kanonického diff enginu (Mac) do change_log.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret (rovnaký secret ako run-alerts).
// Body: { runId?, changes: [{ datasetId?, lvNo?, parcelNo?, entity, field?, oldValue?, newValue?, changeType, importance? }] }
// Vráti { ok, inserted } — Mac po kanonickom importe pošle detegované zmeny.
export const Route = createFileRoute("/api/ingest-changes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { runId?: string; changes?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const changes = Array.isArray(body.changes) ? body.changes : [];
        const r = await ingestChanges({ data: { secret, runId: body.runId, changes: changes as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
