import { createFileRoute } from "@tanstack/react-router";
import { ingestObecChanges } from "../lib/api/kataster.functions";

// POST /api/ingest-obec-changes — zmeny na úradných tabuliach obcí z Mac ÚP monitora.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret (rovnaký secret ako ostatné ingesty).
// Body: { rows: [{ obec, kuCode?, title?, url?, change?, relevance?, detectedAt? }],
//         registry?: [{ kuCode, obec?, upPageUrl? }] }
// POZOR: `registry` sa MUSÍ odovzdať ďalej. Prvá verzia ho vynechala, takže 30 poslaných
// záznamov sa ticho zahodilo a endpoint vrátil ok:true s inserted:0.
//
// Prečo priamo a nie cez GitHub: monitor publikoval do repo tri-lipy-market, odkiaľ to v appke
// nikto nečítal — a navyše ten publish bol pokazený (git push s check=False a nepodmieneným
// hlásením úspechu), takže súbor na GitHube stál 4 dni, kým sa lokálne hromadili commity.
export const Route = createFileRoute("/api/ingest-obec-changes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { rows?: unknown; registry?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne telo */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const registry = Array.isArray(body.registry) ? body.registry : undefined;
        const r = await ingestObecChanges({ data: { secret, rows: rows as never, registry: registry as never } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
