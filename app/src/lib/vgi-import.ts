// Klientský parser VGI → parcelná geometria vo WGS84.
// S-JTSK (EPSG:5514) → WGS84 cez verifikovaný bilineárny grid (pyproj-presný, sub-metrový v SR).
import { SJTSK_GRID as G } from "./sjtsk-grid";

const EMIN = G.emin, NMIN = G.nmin, STEP = G.step, COLS = G.cols, ROWS = G.rows;

function bilin(E: number, N: number): { lng: number; lat: number } {
  const fx = (E - EMIN) / STEP, fy = (N - NMIN) / STEP;
  let i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0) i = 0; if (i > COLS - 2) i = COLS - 2;
  if (j < 0) j = 0; if (j > ROWS - 2) j = ROWS - 2;
  const tx = fx - i, ty = fy - j;
  const lon = G.lon, lat = G.lat;
  const g = (M: readonly (readonly number[])[]) =>
    M[j][i] * (1 - tx) * (1 - ty) + M[j][i + 1] * tx * (1 - ty) + M[j + 1][i] * (1 - tx) * ty + M[j + 1][i + 1] * tx * ty;
  return { lng: g(lon), lat: g(lat) };
}

function candidates(v1: number, v2: number): [number, number][] {
  return [[-v1, -v2], [-v2, -v1], [v1, v2], [v2, v1], [-v2, v1], [v2, -v1]];
}
function detectConv(v1: number, v2: number): number | null {
  const c = candidates(v1, v2);
  for (let i = 0; i < c.length; i++) {
    const [E, N] = c[i];
    if (E > EMIN && E < EMIN + STEP * (COLS - 1) && N > NMIN && N < NMIN + STEP * (ROWS - 1)) {
      const p = bilin(E, N);
      if (p.lat > 47.4 && p.lat < 49.8 && p.lng > 16.7 && p.lng < 22.7) return i;
    }
  }
  return null;
}

export type ImportParcel = {
  parcel_no: string;
  area_m2: number;
  ring: [number, number][];
  centroid_lat: number;
  centroid_lng: number;
};

function ringAreaCentroid(ring: [number, number][]): { area: number; clat: number; clng: number } {
  const lat0 = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  const mlat = 111320, mlng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    const cr = x0 * mlng * (y1 * mlat) - x1 * mlng * (y0 * mlat);
    a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    return { area: 0, clat: lat0, clng: ring.reduce((s, p) => s + p[0], 0) / ring.length };
  }
  return { area: Math.abs(a), clng: cx / (6 * a), clat: cy / (6 * a) };
}

const FLOAT = /-?\d+\.\d+/g;

export function parseVgi(text: string, maxParcels = 600): {
  parcels: ImportParcel[];
  total: number;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
} {
  const raw: { no: string; pts: [number, number][] }[] = [];
  let curNo: string | null = null;
  let pts: [number, number][] = [];
  const flush = () => {
    if (curNo && pts.length >= 3) raw.push({ no: curNo, pts: pts.slice() });
    pts = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (s.startsWith("&O KLADPAR")) { flush(); curNo = null; }
    else if (s.startsWith("&O")) { flush(); curNo = null; }
    else if (s.startsWith("&A PARCIS=")) {
      flush();
      const m = s.match(/PARCIS=([\d.]+)/);
      if (m) {
        const [kmen, frac] = m[1].split(".");
        const sub = frac ? parseInt((frac + "000").slice(0, 3), 10) : 0;
        curNo = sub > 0 ? `${parseInt(kmen, 10)}/${sub}` : String(parseInt(kmen, 10));
      }
    } else if (s.startsWith("&A UO=")) {
      // E-KN (register E / určený operát) v UO*.vgi: &O UOV skupina, číslo v &A UO=287.002 → 287/2
      flush();
      const m = s.match(/UO=([\d.]+)/);
      if (m) {
        const [kmen, frac] = m[1].split(".");
        const k = parseInt(kmen, 10);
        const sub = frac ? parseInt((frac + "000").slice(0, 3), 10) : 0;
        curNo = k > 0 ? (sub > 0 ? `${k}/${sub}` : String(k)) : null;   // UO=0.000 = žiadna E-KN parcela → preskoč
      }
    } else if (s.startsWith("&L") || s.startsWith("L ") || s.startsWith("P ")) {
      const nums = s.match(FLOAT);
      if (nums && nums.length >= 2) pts.push([parseFloat(nums[0]), parseFloat(nums[1])]);
    }
  }
  flush();
  if (raw.length === 0) return { parcels: [], total: 0, bbox: null };

  const conv = detectConv(raw[0].pts[0][0], raw[0].pts[0][1]);
  if (conv === null) return { parcels: [], total: raw.length, bbox: null };
  const cand = (v1: number, v2: number) => candidates(v1, v2)[conv];

  const out: ImportParcel[] = [];
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of raw) {
    if (out.length >= maxParcels) break;
    let ring: [number, number][] = p.pts.map(([v1, v2]) => {
      const [E, N] = cand(v1, v2);
      const g = bilin(E, N);
      return [Math.round(g.lng * 1e7) / 1e7, Math.round(g.lat * 1e7) / 1e7] as [number, number];
    });
    if (ring.length > 42) {
      const step = Math.ceil(ring.length / 42);
      ring = ring.filter((_, i) => i % step === 0);
    }
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
    if (ring.length < 4) continue;
    const ac = ringAreaCentroid(ring);
    out.push({ parcel_no: p.no, area_m2: Math.round(ac.area), ring, centroid_lat: Math.round(ac.clat * 1e7) / 1e7, centroid_lng: Math.round(ac.clng * 1e7) / 1e7 });
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    }
  }
  return { parcels: out, total: raw.length, bbox: { minLat, maxLat, minLng, maxLng } };
}
