// WGS84 → S-JTSK (Křovák, kladné X/Y ako v ZBGIS) a export obrysu parcely (GeoJSON / KML / DXF).
// Postup: WGS84 → ECEF → Helmert (inverzia S-JTSK→WGS84: 570,69; 85,69; 462,84 m; 4,99821″; 1,58676″;
// 5,2611″; 3,543 ppm) → Bessel 1841 → Křovák. Overené 2026-11-11 voči ZBGIS (48,098638°; 20,757722°):
// rozdiel 0,9 m a 2,4 m — ZBGIS ukazuje JTSK03, toto je S-JTSK → INFORMATÍVNE, nie na vytyčovanie.
export type Ring = [number, number][];

export function wgsToSjtsk(lat: number, lon: number): { X: number; Y: number } {
  let a = 6378137.0, f = 1 / 298.257223563, e2 = f * (2 - f);
  let phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180;
  let N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const X = N * Math.cos(phi) * Math.cos(lam), Y = N * Math.cos(phi) * Math.sin(lam), Z = N * (1 - e2) * Math.sin(phi);
  const sec = (v: number) => ((v / 3600) * Math.PI) / 180;
  const rx = sec(-4.99821), ry = sec(-1.58676), rz = sec(-5.2611), s = 1 - 3.543e-6;
  const X2 = -570.69 + s * (X - rz * Y + ry * Z), Y2 = -85.69 + s * (rz * X + Y - rx * Z), Z2 = -462.84 + s * (-ry * X + rx * Y + Z);
  a = 6377397.155; f = 1 / 299.1528128; e2 = f * (2 - f);
  const p = Math.hypot(X2, Y2);
  lam = Math.atan2(Y2, X2);
  phi = Math.atan2(Z2, p * (1 - e2));
  for (let i = 0; i < 10; i++) { N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2); phi = Math.atan2(Z2 + e2 * N * Math.sin(phi), p); }
  const e = Math.sqrt(e2), s45 = Math.PI / 4, fi0 = (49.5 * Math.PI) / 180;
  const alfa = Math.sqrt(1 + (e2 * Math.cos(fi0) ** 4) / (1 - e2));
  const uq = ((59 + 42 / 60 + 42.69689 / 3600) * Math.PI) / 180;
  const u0 = Math.asin(Math.sin(fi0) / alfa);
  const g = ((1 + e * Math.sin(fi0)) / (1 - e * Math.sin(fi0))) ** ((alfa * e) / 2);
  const k = (Math.tan(u0 / 2 + s45) / Math.tan(fi0 / 2 + s45) ** alfa) * g;
  const n0 = (a * Math.sqrt(1 - e2)) / (1 - e2 * Math.sin(fi0) ** 2);
  const s0 = (78.5 * Math.PI) / 180, n = Math.sin(s0), ro0 = (0.9999 * n0) / Math.tan(s0), ad = Math.PI / 2 - uq;
  const lon0 = ((24 + 50 / 60) * Math.PI) / 180;
  const gfi = ((1 + e * Math.sin(phi)) / (1 - e * Math.sin(phi))) ** ((alfa * e) / 2);
  const u = 2 * (Math.atan((k * Math.tan(phi / 2 + s45) ** alfa) / gfi) - s45);
  const dv = -(lam - lon0) * alfa;
  const sS = Math.asin(Math.cos(ad) * Math.sin(u) + Math.sin(ad) * Math.cos(u) * Math.cos(dv));
  const d = Math.asin((Math.cos(u) * Math.sin(dv)) / Math.cos(sS));
  const eps = n * d;
  const ro = (ro0 * Math.tan(s0 / 2 + s45) ** n) / Math.tan(sS / 2 + s45) ** n;
  return { X: ro * Math.cos(eps), Y: ro * Math.sin(eps) };
}

export const fmtSjtsk = (lat: number, lon: number) => {
  const { X, Y } = wgsToSjtsk(lat, lon);
  const f = (v: number) => v.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Y ${f(Y)} · X ${f(X)}`;
};

function download(name: string, mime: string, body: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// feats: [{ name: "C 1500", rings }] — rings v WGS84 [lng, lat]
export function exportOutline(kind: "geojson" | "kml" | "dxf", baseName: string, feats: { name: string; rings: Ring[] }[]) {
  const safe = baseName.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "parcely";
  if (kind === "geojson") {
    const fc = { type: "FeatureCollection", features: feats.map((f) => ({ type: "Feature", properties: { name: f.name, crs_note: "WGS84; obrys informatívny" }, geometry: { type: "Polygon", coordinates: f.rings } })) };
    download(`${safe}.geojson`, "application/geo+json", JSON.stringify(fc));
  } else if (kind === "kml") {
    const esc = (t: string) => t.replace(/[<&>]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" }[c] as string));
    const pm = feats.map((f) => `<Placemark><name>${esc(f.name)}</name><Style><LineStyle><color>ff1f56e0</color><width>2</width></LineStyle><PolyStyle><color>401f56e0</color></PolyStyle></Style><MultiGeometry>${
      f.rings.map((r) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${r.map(([x, y]) => `${x},${y},0`).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join("")}</MultiGeometry></Placemark>`).join("");
    download(`${safe}.kml`, "application/vnd.google-earth.kml+xml", `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(baseName)}</name>${pm}</Document></kml>`);
  } else {
    // DXF R12, súradnice S-JTSK v tvare EPSG:5514 (záporné X=-Y, Y=-X), uzavreté LWPOLYLINE po obrysoch + text s názvom
    const L: string[] = ["0", "SECTION", "2", "ENTITIES"];
    for (const f of feats) {
      for (const r of f.rings) {
        const pts = r.map(([lng, lat]) => wgsToSjtsk(lat, lng));
        L.push("0", "POLYLINE", "8", "PARCELY", "66", "1", "70", "1");
        for (const p of pts) L.push("0", "VERTEX", "8", "PARCELY", "10", (-p.Y).toFixed(3), "20", (-p.X).toFixed(3), "30", "0.0");
        L.push("0", "SEQEND");
        if (pts.length) {
          const cx = pts.reduce((s2, p) => s2 - p.Y, 0) / pts.length, cy = pts.reduce((s2, p) => s2 - p.X, 0) / pts.length;
          L.push("0", "TEXT", "8", "CISLA", "10", cx.toFixed(3), "20", cy.toFixed(3), "30", "0.0", "40", "2.0", "1", f.name);
        }
      }
    }
    L.push("0", "ENDSEC", "0", "EOF");
    download(`${safe}_SJTSK.dxf`, "application/dxf", L.join("\r\n"));
  }
}
