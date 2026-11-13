import { createFileRoute } from "@tanstack/react-router";
import { ingestTarchyItems } from "../lib/api/kataster.functions";

// POST /api/ingest-tarchy — ťarchy po položkách (časť C LV) z Macu (41_IMPORT/kataster_tarchy_push.py), 0114.
// Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/ingest-tarchy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof ingestTarchyItems>>;
        try { r = await ingestTarchyItems({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
