import { createFileRoute } from "@tanstack/react-router";
import { ingestLandsearch } from "../lib/api/kataster.functions";

// POST /api/ingest-landsearch — bulk zápis pozemkových príležitostí (land-search) z Mac enginu.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret.
// Body: { replaceKu?: string[], rows: [{ kodKu, kuName?, purpose?, verdict?, quality?, areaM2?, nParcels?, parcels?, shape?, zone?, build?, access?, slope?, frontage?, ppf?, existingUse?, yard?, accessTimes?, owners?, nOwners?, reason? }] }
export const Route = createFileRoute("/api/ingest-landsearch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { replaceKu?: string[]; rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const r = await ingestLandsearch({ data: { secret, replaceKu: body.replaceKu, rows: rows as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
