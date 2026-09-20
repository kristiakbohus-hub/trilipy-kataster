import { createFileRoute } from "@tanstack/react-router";
import { ingestAcquisitions } from "../lib/api/kataster.functions";

// POST /api/ingest-acquisitions — bulk zápis per-nehnuteľnosť akvizícií z kanonickej Mac DB.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
// Body: { replaceKu?: string[], rows: [{ kodKu, kuName?, lvNumber?, assetType?, assetId?, unitNumber?, areaM2?, kind?, regYear?, instYear?, addrDiffers?, hasPerson? }] }
export const Route = createFileRoute("/api/ingest-acquisitions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { replaceKu?: string[]; rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestAcquisitions({ data: { secret, replaceKu: body.replaceKu, rows: rows as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
