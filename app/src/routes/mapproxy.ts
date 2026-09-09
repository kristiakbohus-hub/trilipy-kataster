import { createFileRoute } from "@tanstack/react-router";

// Worker-side mapový proxy: GET /mapproxy?u=<encoded upstream URL> → natiahne dlaždicu/WMS z CF edge
// a vráti obrázok. Odomyká zdroje blokované z prehliadača/siete (ŠOP, PÚSR, VÚPOP), obchádza CORS
// a umožní zjednotiť hlavičky (User-Agent). Bezpečnosť: len https + whitelist geo-hostiteľov, len GET.
// `?probe=1` → JSON {status, contentType, bytes} (diagnostika dosiahnuteľnosti z Workera).
const ALLOW_HOSTS = new Set<string>([
  "maps.sopsr.sk", "geoserver.sopsr.sk", "mapy.sopsr.sk",           // ŠOP — chránené územia / Natura 2000
  "image.discomap.eea.europa.eu", "bio.discomap.eea.europa.eu",     // EEA — Corine / Natura2000 / CDDA
  "mpt.svp.sk",                                                     // SVP — záplavy
  "mapy.pamiatky.sk", "mnv.pamiatky.sk", "mapserver.pamiatky.sk",  // PÚSR — pamiatky
  "mapy.vupop.sk", "portal.vupop.sk",                              // VÚPOP — BPEJ / pôdny portál
  "ags.geology.sk", "gis.nlcsk.org",                              // ŠGÚDŠ / NLC (jednotnosť)
  "tiles.maps.eox.at",                                            // EOX — Sentinel-2 / terén
]);

export const Route = createFileRoute("/mapproxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const u = sp.get("u") ?? "";
        const probe = sp.get("probe") === "1";
        let target: URL;
        try { target = new URL(u); } catch { return new Response("bad url", { status: 400 }); }
        if (target.protocol !== "https:" || !ALLOW_HOSTS.has(target.hostname)) {
          return new Response(JSON.stringify({ error: "host not allowed", host: target.hostname }), { status: 403, headers: { "content-type": "application/json" } });
        }
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 20000);
        try {
          const res = await fetch(target.toString(), {
            headers: { "user-agent": "tri-lipy/1.0 (kataster; +kristiak.bohus@gmail.com)", accept: "image/*,*/*" },
            signal: ctrl.signal,
          });
          const ct = res.headers.get("content-type") ?? "application/octet-stream";
          const buf = await res.arrayBuffer();
          if (probe) {
            return new Response(JSON.stringify({ status: res.status, contentType: ct, bytes: buf.byteLength, host: target.hostname }), {
              status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
            });
          }
          return new Response(buf, {
            status: res.status,
            headers: {
              "content-type": ct,
              "access-control-allow-origin": "*",
              "cache-control": "public, max-age=86400",
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.name : "error";
          if (probe) return new Response(JSON.stringify({ error: msg, host: target.hostname }), { status: 200, headers: { "content-type": "application/json" } });
          return new Response("upstream error", { status: 502 });
        } finally { clearTimeout(to); }
      },
    },
  },
});
