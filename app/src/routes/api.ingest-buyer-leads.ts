import { createFileRoute } from "@tanstack/react-router";
import { ingestBuyerLeads } from "../lib/api/kataster.functions";

// POST /api/ingest-buyer-leads — kvalifikovaní záujemcovia z OS TRI LIPY → evidencia dopytu (upsert podľa externalId).
// Auth: hlavička x-alert-secret. Kontrakt: execution pack 23_API_OS_TRI_LIPY_KUPCI.md.
export const Route = createFileRoute("/api/ingest-buyer-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { rows?: unknown } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        const rows = Array.isArray(body.rows) ? body.rows : [];
        let r: { ok: boolean; upserted?: number; skippedErased?: number; message?: string };
        try { r = await ingestBuyerLeads({ data: { secret, rows: rows as never } }); }
        catch { r = { ok: false, message: "Neplatné údaje záujemcu (skontroluj povinné polia a hodnoty)." }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
