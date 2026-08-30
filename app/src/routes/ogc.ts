import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "../lib/bindings.server";

// Živá OGC/GeoJSON služba pre QGIS: GET /ogc?dataset=<id> → FeatureCollection parciel (CRS84).
// QGIS: Layer → Add Layer → Add Vector Layer → Protocol HTTP(S), alebo priamo URL.
export const Route = createFileRoute("/ogc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const dataset = new URL(request.url).searchParams.get("dataset") ?? "";
        const headers = {
          "Content-Type": "application/geo+json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300",
        };
        const { DB } = bindings();
        const empty = { type: "FeatureCollection", features: [] as unknown[] };
        if (!DB || !dataset) return new Response(JSON.stringify(empty), { headers });
        const res = await DB.prepare(
          "SELECT parcel_no, kn_type, area_m2, use_type, lv_no, centroid_lat, centroid_lng, geometry_json FROM parcels WHERE dataset_id = ? AND geometry_json IS NOT NULL",
        ).bind(dataset).all<{ parcel_no: string; kn_type: string; area_m2: number; use_type: string | null; lv_no: number | null; centroid_lat: number | null; centroid_lng: number | null; geometry_json: string }>();
        const features = (res.results ?? []).map((r) => {
          let geometry: unknown = null;
          try { geometry = JSON.parse(r.geometry_json); } catch { geometry = null; }
          return {
            type: "Feature",
            properties: { parcel_no: r.parcel_no, kn_type: r.kn_type, area_m2: r.area_m2, use_type: r.use_type, lv_no: r.lv_no, centroid_lat: r.centroid_lat, centroid_lng: r.centroid_lng },
            geometry,
          };
        }).filter((f) => f.geometry != null);
        const fc = {
          type: "FeatureCollection",
          name: dataset,
          crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
          features,
        };
        return new Response(JSON.stringify(fc), { headers });
      },
    },
  },
});
