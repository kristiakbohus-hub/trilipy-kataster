import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "../lib/bindings.server";

// GET /api/up-raster?id=<id> — obrázok výkresu ÚP z Macu (up_rasters kind 'up_mac', R2) priamo ako JPEG.
// Výkresy ÚP sú verejné dokumenty obcí; iné (používateľom nahraté) podklady sa tadiaľto NEvydávajú.
// Predtým sa obrázok posielal ako base64 v odpovedi server funkcie (~3 MB) a v mape sa nezobrazil.
export const Route = createFileRoute("/api/up-raster")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const { DB, STORAGE } = bindings();
        if (!DB || !STORAGE || !/^mac-[a-z0-9_]{3,60}-\d{6}$/.test(id)) return new Response("not found", { status: 404 });
        const row = await DB.prepare("SELECT r2_key, mime FROM up_rasters WHERE id = ? AND kind = 'up_mac'").bind(id).first<{ r2_key: string; mime: string | null }>();
        if (!row) return new Response("not found", { status: 404 });
        const obj = await STORAGE.get(row.r2_key);
        if (!obj) return new Response("not found", { status: 404 });
        return new Response(await obj.arrayBuffer(), { headers: { "content-type": row.mime ?? "image/jpeg", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
