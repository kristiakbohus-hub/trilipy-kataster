import { createFileRoute } from "@tanstack/react-router";
import { publicOfferCore } from "../lib/offer.server";

// GET /api/offer?t=<token> — verejné čítanie ponuky pre klienta (bod 10). Bez session; platnosť a zrušenie
// stráži tabuľka offer_shares. Vracia len snapshot položiek (žiadne mená vlastníkov ani klienta).
export const Route = createFileRoute("/api/offer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        let r;
        try { r = await publicOfferCore(t); } catch { r = { ok: false, message: "Ponuku sa nepodarilo načítať." }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : 404, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
      },
    },
  },
});
