import { createFileRoute } from "@tanstack/react-router";
import { ingestMarketAll } from "../lib/api/kataster.functions";

// POST /api/ingest-market — kompletný ingest trhových dát (index+opps+listing chunky+pricehistory) z verejného market-data.json.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret. Volá GitHub Action po scrape+publishi (Mac-nezávislé).
export const Route = createFileRoute("/api/ingest-market")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        const r = await ingestMarketAll({ data: { secret } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
