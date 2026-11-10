import { createFileRoute } from "@tanstack/react-router";
import { buyerMatchesForLead } from "../lib/api/kataster.functions";

// POST /api/buyer-matches { externalId } — zhody pre záujemcu z OS TRI LIPY (pozemkové príležitosti + inzeráty).
// Auth: hlavička x-alert-secret. Vracia len to, čo vidí aj karta „Kupci a dopyt" — žiadne mená vlastníkov.
export const Route = createFileRoute("/api/buyer-matches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: { externalId?: string } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof buyerMatchesForLead>>;
        try { r = await buyerMatchesForLead({ data: { secret, externalId: String(body.externalId ?? "") } }); }
        catch { r = { ok: false, message: "Chýba externalId." }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 404, headers: { "content-type": "application/json" } });
      },
    },
  },
});
