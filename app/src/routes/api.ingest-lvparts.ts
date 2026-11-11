import { createFileRoute } from "@tanstack/react-router";
import { ingestLvParts } from "../lib/api/kataster.functions";

// POST /api/ingest-lvparts — parcely C/E pri LV + stavby (súpisné číslo) z Macu
// (41_IMPORT/kataster_lvparts_push.py). Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/ingest-lvparts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof ingestLvParts>>;
        try { r = await ingestLvParts({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
