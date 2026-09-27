import { createFileRoute } from "@tanstack/react-router";
import { ingestSettlement } from "../lib/api/kataster.functions";

// POST /api/ingest-settlement — bulk zápis kandidátov VYSPORIADANIA (GOLD 04) z Mac enginu.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
// Body: { replaceKu?: string[], rows: [{ kodKu, kuName?, buildingId?, buildingDesc?, parcelNo?, register?,
//         landLvNo?, classification, score?, nLandOwners?, hasSpf?, hasUnknown?, viaE?, reason? }] }
export const Route = createFileRoute("/api/ingest-settlement")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { replaceKu?: string[]; rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestSettlement({ data: { secret, replaceKu: body.replaceKu, rows: rows as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
