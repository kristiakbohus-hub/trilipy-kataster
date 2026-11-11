import { createFileRoute } from "@tanstack/react-router";
import { ingestFirmFinance } from "../lib/api/kataster.functions";

// POST /api/ingest-firm-finance — RÚZ finančné údaje firiem (24_OWNER_INTEL/ruz_firm_finance.py).
// Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/ingest-firm-finance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof ingestFirmFinance>>;
        try { r = await ingestFirmFinance({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
