import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "../lib/bindings.server";
import { upVectorIngest } from "../lib/api/kataster.functions";

// Vektorový územný plán k.ú. (0120, 2026-11-14).
//   GET  /api/up-vector?kod=<kód k.ú.>&f=wgs84|geojson5514|gpkg|dxf — súbor z R2 (wgs84 pre mapu, ostatné na stiahnutie)
//   POST /api/up-vector — Mac posiela súbor (hlavička x-alert-secret = kľúč Macu; ingestSecretOk)
// ÚP sú verejné dokumenty obcí (bez osobných údajov), preto GET bez prihlásenia — rovnako ako /api/up-raster.
const EXT: Record<string, string> = { wgs84: "wgs84.geojson", geojson5514: "5514.geojson", gpkg: "gpkg", dxf: "dxf" };
export const Route = createFileRoute("/api/up-vector")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const kod = u.searchParams.get("kod") ?? "";
        const f = u.searchParams.get("f") ?? "wgs84";
        const { DB, STORAGE } = bindings();
        if (!DB || !STORAGE || !/^\d{6}$/.test(kod) || !EXT[f]) return new Response("not found", { status: 404 });
        const row = await DB.prepare("SELECT r2_key FROM up_vectors WHERE kod_ku = ? AND fmt = ?").bind(kod, f).first<{ r2_key: string }>();
        if (!row) return new Response("not found", { status: 404 });
        const obj = await STORAGE.get(row.r2_key);
        if (!obj) return new Response("not found", { status: 404 });
        const h: Record<string, string> = {
          "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "public, max-age=900" };
        if (f !== "wgs84") h["content-disposition"] = `attachment; filename="UP_${kod}_${EXT[f]}"`;
        return new Response(await obj.arrayBuffer(), { headers: h });
      },
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: unknown = {};
        try { body = await request.json(); } catch { /* prázdne telo */ }
        let r: { ok: boolean; message?: string };
        try { r = await upVectorIngest({ data: { ...(body as object), secret } as never }); }
        catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
