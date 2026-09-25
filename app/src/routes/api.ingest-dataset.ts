import { createFileRoute } from "@tanstack/react-router";
import { ingestDataset } from "../lib/api/kataster.functions";

// POST /api/ingest-dataset — auto-publish k.ú. (parcely/LV/vlastníci/BPEJ) z 41_IMPORT pipeline do D1.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret. Chunkovaný (reset na prvom, append ďalej).
export const Route = createFileRoute("/api/ingest-dataset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; } catch { /* prázdne */ }
        const r = await ingestDataset({ data: { ...body, secret } as never });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
