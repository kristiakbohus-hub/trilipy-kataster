import { createFileRoute } from "@tanstack/react-router";
import { briefQueue, ingestBriefResults } from "../lib/api/kataster.functions";

// POST /api/brief-queue — front zadaní hľadania pozemkov pre Mac engine (21_NL_SEARCH/brief_worker.py).
// Telo: { action: "pending" | "start" | "progress" | "finish" | "fail" | "results", … }.
// Auth: hlavička x-alert-secret = kľúč Macu (ingestSecretOk, 0116). Bez secretu vždy 401.
export const Route = createFileRoute("/api/brief-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: { ok: boolean; message?: string };
        try {
          r = body.action === "results"
            ? await ingestBriefResults({ data: { secret, briefId: body.briefId as number, rows: (Array.isArray(body.rows) ? body.rows : []) as never } })
            : await briefQueue({ data: { ...(body as object), secret, action: body.action as never } });
        } catch {
          // neplatné telo — bez secretu aj tak 401 (neprezradí, či je endpoint/akcia platná)
          r = { ok: false, message: secret ? "Neplatná požiadavka." : "unauthorized" };
        }
        const status = r.ok ? 200 : r.message === "unauthorized" ? 401 : 400;
        return new Response(JSON.stringify(r), { status, headers: { "content-type": "application/json" } });
      },
    },
  },
});
