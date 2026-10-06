import { createFileRoute } from "@tanstack/react-router";
import { ingestUP } from "../lib/api/kataster.functions";

// POST /api/ingest-up — bulk zápis kandidátov GOLD-UP (ÚP na bývanie, kataster stále orná/TTP).
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
export const Route = createFileRoute("/api/ingest-up")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { replaceKu?: string[]; rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestUP({ data: { secret, replaceKu: body.replaceKu, rows: rows as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
