import { createFileRoute } from "@tanstack/react-router";
import { ingestBuyerFirms } from "../lib/api/kataster.functions";

// POST /api/ingest-buyer-firms — firmy z RPO ako možní kupci (Mac dávka 24_OWNER_INTEL/rpo_buyer_firms.py).
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
export const Route = createFileRoute("/api/ingest-buyer-firms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { replaceOkres?: string[]; rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestBuyerFirms({ data: { secret, replaceOkres: body.replaceOkres, rows: rows as never } });
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : 401, headers: { "content-type": "application/json" } });
      },
    },
  },
});
