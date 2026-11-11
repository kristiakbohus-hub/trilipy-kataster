import { createFileRoute } from "@tanstack/react-router";
import { ingestStateContracts } from "../lib/api/kataster.functions";

// POST /api/ingest-state-contracts — štátne zmluvy o pozemkoch z CRZ (17_UP_MONITOR/crz_state_land.py).
// Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/ingest-state-contracts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof ingestStateContracts>>;
        try { r = await ingestStateContracts({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
