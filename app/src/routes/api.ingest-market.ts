import { createFileRoute } from "@tanstack/react-router";
import { ingestMarketAll } from "../lib/api/kataster.functions";

// POST /api/ingest-market — STEPOVÝ ingest trhových dát z verejného market-data.json.
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret. Volá GitHub Action po scrape+publishi (Mac-nezávislé).
// Telo { step?, chunk? }: každý krok je samostatný request, aby žiaden neprekročil limit Workera.
// Monolitný `{}` beh (všetko naraz) prekračoval ~1000 subrequestov → curl padal → D1 ostal zastaraný.
// Bez `step` ostáva spätne kompatibilné (= krok "data"). Rozpis krokov je v ingestMarketAll.
export const Route = createFileRoute("/api/ingest-market")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { step?: "data" | "listings" | "pricehistory" | "compute"; chunk?: number; ref?: string } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne telo = krok "data" */ }
        let r: Awaited<ReturnType<typeof ingestMarketAll>>;
        try {
          r = await ingestMarketAll({ data: { secret, step: body.step, chunk: typeof body.chunk === "number" ? body.chunk : undefined,
            ref: typeof body.ref === "string" ? body.ref : undefined } });
        } catch { r = { ok: false, message: secret ? "Neplatná požiadavka." : "Neplatný secret" }; }
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : r.message === "Neplatný secret" ? 401 : 400,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
