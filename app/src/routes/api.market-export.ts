import { createFileRoute } from "@tanstack/react-router";
import { exportMarketListings } from "../lib/api/kataster.functions";

// POST /api/market-export { sinceDays?, after?, limit? } — aktívne inzeráty pre Mac (deal radar,
// opportunity engine; 16_TRHOVE_CENY/app_sync.py). Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/market-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof exportMarketListings>>;
        try { r = await exportMarketListings({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatná požiadavka." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
