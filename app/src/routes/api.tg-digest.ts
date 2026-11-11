import { createFileRoute } from "@tanstack/react-router";
import { tgDigest } from "../lib/api/kataster.functions";

// POST /api/tg-digest { action: "claim" | "ack" | "fail" | "preview", runner: "mac" | "cloud" } — ranný
// Telegram súhrn. Odosielatelia: Mac 37_OPPORTUNITY/tg_digest_send.py (7:30), cloud tri-lipy-market
// digest.yml (záloha od 7:45). Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/tg-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof tgDigest>>;
        try { r = await tgDigest({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatná požiadavka." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
