import { useEffect, useMemo, useRef, useState } from "react";

// 3D PREHĽAD (2026-11-13, porovnanie s parcelnik.sk): terén s ortofotom ZBGIS, 3D budovy, obrys parcely a slnko —
// posuvník dňa a hodiny mení smer a výšku slnka (osvetlenie terénu a budov). MapLibre sa načíta až po kliknutí
// (samostatný balík, nie v hlavnom JS). Zdroje: © ÚGKK SR ortofoto ZBGIS, výšky AWS Terrain Tiles (Mapzen,
// SRTM/EU-DEM ~10–30 m), budovy © OpenMapTiles © prispievatelia OpenStreetMap (OpenFreeMap).
// Vrhané tiene MapLibre nepočíta — presný tieň z okolitých budov a stromov je v kapitole Terén a slnko (DMP 1.0).

/** Poloha slnka (SunCalc): azimut od severu v smere hodín a výška nad obzorom, v stupňoch. */
export function sunPos(date: Date, lat: number, lng: number): { az: number; el: number } {
  const rad = Math.PI / 180, d = date.getTime() / 864e5 - 0.5 + 2440588 - 2451545;
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI, e = rad * 23.4397;
  const dec = Math.asin(Math.sin(L) * Math.sin(e)), ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = rad * (280.16 + 360.9856235 * d) + rad * lng - ra, phi = rad * lat;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { az: ((az / rad) + 180 + 360) % 360, el: el / rad };
}

type Ring = [number, number][];
const pad = (n: number) => String(n).padStart(2, "0");

export function Terrain3D({ lat, lng, rings }: { lat: number; lng: number; rings: Ring[] }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ setLight: (l: unknown) => void; setPaintProperty: (id: string, p: string, v: unknown) => void; remove: () => void; getLayer: (id: string) => unknown } | null>(null);
  const today = new Date();
  const [day, setDay] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  const [mins, setMins] = useState(12 * 60);
  const [err, setErr] = useState<string | null>(null);
  const sun = useMemo(() => sunPos(new Date(`${day}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`), lat, lng), [day, mins, lat, lng]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ml = (await import("maplibre-gl")).default;
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (!alive || !box.current) return;
        const wms = "https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=1&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg";
        const map = new ml.Map({
          container: box.current, center: [lng, lat], zoom: 17, pitch: 62, bearing: -25, maxPitch: 85, attributionControl: { compact: true },
          style: {
            version: 8,
            sources: {
              orto: { type: "raster", tiles: [wms], tileSize: 512, maxzoom: 20, attribution: "© ÚGKK SR — ZBGIS ortofoto" },
              dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "výšky: AWS Terrain Tiles (Mapzen)" },
              omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
              parcel: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r]) } } },
            },
            layers: [
              { id: "bg", type: "background", paint: { "background-color": "#dfe3d6" } },
              { id: "orto", type: "raster", source: "orto" },
              { id: "hill", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-illumination-anchor": "map" } },
              { id: "p-fill", type: "fill", source: "parcel", paint: { "fill-color": "#e0561f", "fill-opacity": 0.18 } },
              { id: "p-line", type: "line", source: "parcel", paint: { "line-color": "#e0561f", "line-width": 3 } },
              { id: "bld", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 14,
                paint: { "fill-extrusion-color": "#d8d2c4", "fill-extrusion-opacity": 0.92,
                  "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] } },
            ],
            terrain: { source: "dem", exaggeration: 1.2 },
          } as never,
        });
        map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
        mapRef.current = map as never;
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "3D prehľad sa nepodarilo načítať.");
      }
    })();
    return () => { alive = false; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const up = sun.el > 0;
    try {
      m.setLight({ anchor: "map", position: [1.5, sun.az, Math.max(0, Math.min(90, 90 - Math.max(sun.el, 2)))], intensity: up ? 0.35 + 0.4 * Math.sin((Math.max(sun.el, 0) * Math.PI) / 180) : 0.12, color: up ? "#fff6e5" : "#8796b8" });
      if (m.getLayer("hill")) m.setPaintProperty("hill", "hillshade-illumination-direction", Math.round(sun.az) % 360);
      if (m.getLayer("orto")) m.setPaintProperty("orto", "raster-brightness-max", up ? 1 : 0.45);
    } catch { /* mapa sa ešte načítava */ }
  }, [sun]);

  const time = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  return (
    <div className="no-print space-y-2">
      <div ref={box} className="h-[420px] w-full overflow-hidden rounded border border-line bg-surface-2" />
      {err ? <p className="text-xs text-muted">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1 text-muted">Deň <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded border border-line bg-surface px-1.5 py-0.5 text-fg" /></label>
        <label className="flex min-w-[220px] flex-1 items-center gap-2 text-muted">Čas {time}
          <input type="range" min={4 * 60} max={22 * 60} step={10} value={mins} onChange={(e) => setMins(Number(e.target.value))} className="flex-1" /></label>
        <span className="text-muted">slnko: {sun.el > 0 ? `výška ${Math.round(sun.el)}°, azimut ${Math.round(sun.az)}°` : "pod obzorom"}</span>
      </div>
      <p className="text-[11px] text-muted">Ťahaním otáčate a nakláňate pohľad. Osvetlenie terénu a budov sleduje polohu slnka; vrhané tiene okolitých budov a stromov počíta kapitola Terén a slnko. Výšky terénu ~10–30 m rozlíšenie, budovy z OpenStreetMap — orientačné.</p>
    </div>
  );
}
