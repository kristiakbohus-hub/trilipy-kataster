import { createFileRoute } from "@tanstack/react-router";
import { macFactsAdmin } from "../lib/mac-facts.server";

// POST /api/mac-facts — prepojenie appky s rozšírenými údajmi na Macu (2026-11-21): uloženie adresy tunela, stav,
// prenos objemných skupín z D1 na Mac a ich zmazanie z D1. Auth: hlavička x-alert-secret = kľúč Macu. Bez neho 401.
export const Route = createFileRoute("/api/mac-facts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Record<string, unknown>;
        try { r = await macFactsAdmin({ ...body, secret }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400,
          headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
