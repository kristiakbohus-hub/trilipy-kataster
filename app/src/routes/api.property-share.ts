import { createFileRoute } from "@tanstack/react-router";
import { publicPropertyCore } from "../lib/property-share.server";

// GET /api/property-share?t=<token> — verejné čítanie klientskej verzie listu nehnuteľnosti. Bez session;
// platnosť a zrušenie stráži tabuľka property_shares. Vracia len očistený snapshot (žiadne mená).
export const Route = createFileRoute("/api/property-share")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        let r;
        try { r = await publicPropertyCore(t); } catch { r = { ok: false, message: "List sa nepodarilo načítať." }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : 404, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
      },
    },
  },
});
