import { createFileRoute } from "@tanstack/react-router";
import { scenarioVariantQueue } from "../lib/api/kataster.functions";

// POST /api/scenario-queue — prepínače GOLD scenárov (0117): Mac si berie čakajúce varianty, posiela výsledky
// a zverejňuje zoznam prepínačov. Auth: hlavička x-alert-secret = kľúč Macu (ingestSecretOk). Bez secretu 401.
export const Route = createFileRoute("/api/scenario-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: unknown = {};
        try { body = await request.json(); } catch { /* prázdne telo */ }
        let r: { ok: boolean; message?: string };
        try { r = await scenarioVariantQueue({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
