import { createFileRoute } from "@tanstack/react-router";
import { ingestListingMatches } from "../lib/api/kataster.functions";

// POST /api/ingest-listing-matches — inzerát → parcela/LV (16_TRHOVE_CENY/listing_parcel_match.py).
// Auth: hlavička x-alert-secret. Bez secretu vždy 401.
export const Route = createFileRoute("/api/ingest-listing-matches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne */ }
        let r: Awaited<ReturnType<typeof ingestListingMatches>>;
        try { r = await ingestListingMatches({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
