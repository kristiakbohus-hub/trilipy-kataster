import { createFileRoute } from "@tanstack/react-router";
import { ingestParcelZoning } from "../lib/api/kataster.functions";

// POST /api/ingest-parcel-zoning — bulk zápis per-parcela funkčného využitia (ÚP) z Mac enginu.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
// Body: { replaceKu?: string[], rows: [{ kodKu, parcelNo, register, zone?, verdict? }] }
export const Route = createFileRoute("/api/ingest-parcel-zoning")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { replaceKu?: string[]; rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestParcelZoning({ data: { secret, replaceKu: body.replaceKu, rows: rows as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
