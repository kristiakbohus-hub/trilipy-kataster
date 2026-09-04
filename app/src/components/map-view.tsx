import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent, ReactNode } from "react";
import type { LvOwner, Parcel, Role } from "../lib/domain";
import { QUALITY_META, canRunPipeline, m2 } from "../lib/domain";
import { getLvDetail, getLvVypis, listRasters, getRasterData, uploadRaster, saveGeoref, updateRaster, deleteRaster, listUpInfo, addUpInfo, listBpejZones, listUpZones, getParcelZone, importUpZones, getParcelAccessibility, getParcelLimits, getUpDocs, getUpChanges, importUpDocs, refreshUpRegistry, getUpRegulativ, setUpRegulativ, deleteUpRegulativ, getLocalityMedian, getMarketListingsNear, esknIdentify, type EsknParcel } from "../lib/api/kataster.functions";
import { LimitsPanel } from "./limits-panel";
import { marketValueEur } from "../lib/domain";
import { DEV_DEFAULTS, REGULATIV, type ZoneLike } from "../lib/development";
import { AccessibilityPanel } from "./accessibility-panel";
import { Icon } from "./kit";
import { LegalRef } from "./legal-ref";
import { DevelopmentPanel } from "./development-panel";

// ——— Georeferencovanie ÚP rastrov: kontrolné body → affine (pixel → Web Mercator) ———
type GCP = { px: number; py: number; lng: number; lat: number };
type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };
type RasterInfo = {
  id: string; name: string; kind: string; mime: string | null;
  width: number | null; height: number | null;
  transform_json: string | null; points_json: string | null; opacity: number; note: string | null;
};
function solve3(M: number[][]): [number, number, number] | null {
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    [M[i], M[piv]] = [M[piv], M[i]];
    const p = M[i][i];
    if (Math.abs(p) < 1e-12) return null;
    for (let j = i; j < 4; j++) M[i][j] /= p;
    for (let k = 0; k < 3; k++) if (k !== i) { const fac = M[k][i]; for (let j = i; j < 4; j++) M[k][j] -= fac * M[i][j]; }
  }
  return [M[0][3], M[1][3], M[2][3]];
}
function fitAffine(gcps: GCP[]): Affine | null {
  if (gcps.length < 3) return null;
  let Spx2 = 0, Spxy = 0, Spx = 0, Spy2 = 0, Spy = 0, n = 0;
  let rx0 = 0, rx1 = 0, rx2 = 0, ry0 = 0, ry1 = 0, ry2 = 0;
  for (const g of gcps) {
    const m = toMerc(g.lng, g.lat);
    Spx2 += g.px * g.px; Spxy += g.px * g.py; Spx += g.px; Spy2 += g.py * g.py; Spy += g.py; n += 1;
    rx0 += g.px * m.x; rx1 += g.py * m.x; rx2 += m.x;
    ry0 += g.px * m.y; ry1 += g.py * m.y; ry2 += m.y;
  }
  const abc = solve3([[Spx2, Spxy, Spx, rx0], [Spxy, Spy2, Spy, rx1], [Spx, Spy, n, rx2]]);
  const dfe = solve3([[Spx2, Spxy, Spx, ry0], [Spxy, Spy2, Spy, ry1], [Spx, Spy, n, ry2]]);
  if (!abc || !dfe) return null;
  return { a: abc[0], b: abc[1], c: abc[2], d: dfe[0], e: dfe[1], f: dfe[2] };
}
function rasterMatrix(t: Affine, X: number, Y: number, res: number, w: number, h: number): string {
  const A = t.a / res, C = t.b / res, E = t.c / res + w / 2 - X / res;
  const B = -t.d / res, D = -t.e / res, F = -t.f / res + h / 2 + Y / res;
  return `matrix(${A}, ${B}, ${C}, ${D}, ${E}, ${F})`;
}

type IdOwners = { access: "full" | "summary" | "denied"; count: number; owners: LvOwner[] };

// ——— Web Mercator (EPSG:3857) — zhoduje sa s WMS bbox, takže vektor sadne na raster ———
const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const BASE_RES = 156543.03392804097;

function toMerc(lng: number, lat: number) {
  return { x: R * rad(lng), y: R * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) };
}
function toLngLat(x: number, y: number) {
  return { lng: deg(x / R), lat: deg(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) };
}
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type Ring = [number, number][];
type View = { X: number; Y: number; zoom: number };
type Tool = "pan" | "select" | "measure" | "upinfo";
type Ev = { time: string; msg: string };
type UpInfo = { id: string; lat: number; lng: number; parcel_no: string | null; functional_area: string | null; regulativ: string | null; note: string | null };

function parseRing(geo: string | null): Ring | null {
  if (!geo) return null;
  try {
    const g = JSON.parse(geo);
    const c = g?.coordinates?.[0];
    return Array.isArray(c) ? (c as Ring) : null;
  } catch {
    return null;
  }
}

const ZMIN = 7, ZMAX = 21;   // 7 = národný pohľad na celé SR (ESKN-first), 21 = plný ESKN detail

// BPEJ farba — hash kódu na odtieň (fallback, keď skupina nie je známa).
function bpejColor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 50%)`;
}

// Kvalitatívna škála bonity: skupina 1 = najkvalitnejšia pôda (zelená) → 9 = najmenej produkčná (červená).
const BPEJ_SKUPINA_COLORS: Record<number, string> = {
  1: "#1a7a3a", 2: "#4a9d3f", 3: "#7ab648", 4: "#a9cf4f", 5: "#e6d84a",
  6: "#e8b93e", 7: "#e39131", 8: "#d6632a", 9: "#c23b22",
};
function bpejSkupinaColor(skupina: number | null | undefined, code: string): string {
  return skupina && BPEJ_SKUPINA_COLORS[skupina] ? BPEJ_SKUPINA_COLORS[skupina] : bpejColor(code);
}
// Sadzby NV 58/2013 (€/m² za trvalé odňatie) — pre klientsky výpočet, keď parcela nemá odnatie_eur.
const BPEJ_SADZBA_TRVALE: Record<number, number> = {
  1: 20, 2: 15, 3: 10, 4: 7, 5: 4, 6: 2, 7: 1, 8: 0.7, 9: 0.5,
};

// Kurátorovaný register národných SK WMS — auto-pripojiteľné ku každému k.ú.
// (fail-soft: ak sa vrstva nenačíta, zobrazí sa prázdne, nič sa nerozbije).
export type WmsDef = { id: string; name: string; url: string; layers: string; format: string; attribution?: string; reliable?: boolean };
const CURATED_WMS: WmsDef[] = [
  { id: "ortofoto", name: "ZBGIS ortofoto", url: "https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get", layers: "1", format: "image/jpeg", attribution: "© ÚGKK SR / GKÚ — ZBGIS ortofoto (CC BY 4.0)", reliable: true },
  { id: "zbgis", name: "ZBGIS základná mapa", url: "https://zbgisws.skgeodesy.sk/zbgis_wms_featureinfo/service.svc/get", layers: "0", format: "image/png", attribution: "© ÚGKK SR — ZBGIS" },
  { id: "dmr", name: "ZBGIS DMR (výškopis / terén)", url: "https://zbgisws.skgeodesy.sk/zbgis_dmr_wms/service.svc/get", layers: "0", format: "image/png", attribution: "© ÚGKK SR / GKÚ — DMR 5.0", reliable: true },
  // ESKN kataster je per-k.ú. (podľa kraja) — pripája sa cez wms_sources pri importe, nie globálne.
];

function wmsGetMap(def: WmsDef, X: number, Y: number, res: number, w: number, h: number): string {
  const minx = X - (w / 2) * res, maxx = X + (w / 2) * res;
  const miny = Y - (h / 2) * res, maxy = Y + (h / 2) * res;
  const p = new URLSearchParams({
    service: "WMS", version: "1.3.0", request: "GetMap", layers: def.layers, styles: "",
    crs: "EPSG:3857", format: def.format, width: String(w), height: String(h),
    bbox: `${minx},${miny},${maxx},${maxy}`,
  });
  return def.url + (def.url.includes("?") ? "&" : "?") + p.toString();
}

// ——— Limity výstavby ako zapínateľné úradné vrstvy (ArcGIS export → transparentné PNG) ———
type LimitLayer = { id: string; name: string; url: string; layers: string; attribution: string };
const LIMIT_LAYERS: LimitLayer[] = [
  { id: "zosuvy", name: "Zosuvy / svahové deformácie", url: "https://ags.geology.sk/arcgis/rest/services/Geofond/zosuvy_vect/MapServer", layers: "2,3,4", attribution: "ŠGÚDŠ" },
  { id: "env", name: "Env. záťaže / skládky", url: "https://ags.geology.sk/arcgis/rest/services/Geofond/skladky_vect/MapServer", layers: "0,1", attribution: "ŠGÚDŠ" },
  { id: "banske", name: "Staré banské diela", url: "https://ags.geology.sk/arcgis/rest/services/Geofond/sbd_vect/MapServer", layers: "0,1,2", attribution: "ŠGÚDŠ" },
  { id: "les", name: "Lesné pozemky (JPRL)", url: "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/JPRL/MapServer", layers: "0", attribution: "NLC" },
  { id: "toky", name: "Vodné toky", url: "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/TokySR/MapServer", layers: "0", attribution: "NLC" },
];
function arcgisExport(l: LimitLayer, X: number, Y: number, res: number, w: number, h: number, dpi?: number): string {
  const minx = X - (w / 2) * res, maxx = X + (w / 2) * res;
  const miny = Y - (h / 2) * res, maxy = Y + (h / 2) * res;
  const p = new URLSearchParams({
    bbox: `${minx},${miny},${maxx},${maxy}`, bboxSR: "3857", imageSR: "3857",
    size: `${w},${h}`, format: "png32", transparent: "true", layers: `show:${l.layers}`, f: "image",
  });
  // dpi-trik: znížením dpi ArcGIS „uverí" menšej mierke → ESKN parcely sa vykreslia aj pri nižšom priblížení (ako ZBGIS).
  if (dpi) p.set("dpi", String(dpi));
  return `${l.url}/export?${p.toString()}`;
}
// ESKN podklad ako samostatná definícia (nezávislý od LIMIT_LAYERS toggle) — celoSR kataster, default vrstva.
const ESKN_BASE: LimitLayer = { id: "eskn", name: "ESKN register C — celé SR (ÚGKK)", url: "https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer", layers: "1,4,5,7,10,14", attribution: "ÚGKK ESKN" };
// ESKN register E (určený operát) — parcely E-KN sú samostatná služba VRM/uo (layer 2 plocha, 0 číslo).
const ESKN_BASE_E: LimitLayer = { id: "eskn-e", name: "ESKN register E (určený operát)", url: "https://kataster.skgeodesy.sk/eskn/rest/services/VRM/uo/MapServer", layers: "0,2", attribution: "ÚGKK ESKN" };
// Dynamické dpi tak, aby efektívna mierka ostala v okne kreslenia ESKN (~1:1500) pri každom zoome.
function esknDpiFor(res: number): number {
  return Math.max(1, Math.min(96, Math.round((1500 * 0.0254) / res)));
}

// ——— Územné plány (celá SR) — krajské ÚP z rôznych zdrojov zjednotené do 1 overlay ———
// Obecný parcelný ÚP nie je otvorene dostupný ako vektor; krajský (VÚC) ÚP áno (rôzne platformy).
// ext = [minx,miny,maxx,maxy] vo WebMercator (EPSG:3857); overlay sa vykreslí len ak pretína výrez.
const RMERC = Math.PI * R; // 20037508.34 — polovica šírky WebMercator sveta
type UpSource =
  | { id: string; name: string; kind: "xyz"; url: string; ext: [number, number, number, number]; maxZ: number; opacity?: number }
  | { id: string; name: string; kind: "wms"; def: WmsDef; ext: [number, number, number, number]; opacity?: number };
// Krajské ÚP (VÚC) komplexné výkresy — autoritatívne georeferencované ArcGIS dlaždice (overené).
// Chýbajú TSK/NSK/PSK/KSK (ich ÚP nie je otvorene dostupný ako služba) — doplniť keď sa nájde.
const UP_SR_SOURCES: UpSource[] = [
  {
    id: "zsk", name: "ÚP kraj — Žilinský (okres Čadca)", kind: "xyz",
    url: "https://tiles-eu1.arcgis.com/gAxkiolkahuXc28I/arcgis/rest/services/UPN_URBANIZMUS/MapServer/tile/{z}/{y}/{x}",
    ext: [2019349, 6205208, 2253779, 6402965], maxZ: 23, opacity: 0.6,
  },
  {
    id: "ttsk", name: "ÚP kraj — Trnavský", kind: "xyz",
    url: "https://tiles-eu1.arcgis.com/WhQc2QZAmyA40edq/arcgis/rest/services/02___KOMPLEXN%C3%9D_V%C3%9DKRES/MapServer/tile/{z}/{y}/{x}",
    ext: [1823911, 6028641, 2049649, 6297427], maxZ: 22, opacity: 0.6,
  },
  {
    id: "bsk", name: "ÚP kraj — Bratislavský", kind: "xyz",
    url: "https://gis.region-bsk.sk/server/rest/services/UPNR_BSK/02_Komplexny_navrh/MapServer/tile/{z}/{y}/{x}",
    ext: [1728549, 6005128, 2099465, 6304764], maxZ: 19, opacity: 0.6,
  },
  {
    id: "bbsk", name: "ÚP kraj — Banskobystrický", kind: "xyz",
    url: "https://tiles-eu1.arcgis.com/ODrCBoJHlKVMl3Cg/arcgis/rest/services/Komplexn%C3%BD_urbanistick%C3%BD_n%C3%A1vrh_tif/MapServer/tile/{z}/{y}/{x}",
    ext: [2041488, 6094387, 2294629, 6292016], maxZ: 23, opacity: 0.6,
  },
];
function extIntersects(e: readonly [number, number, number, number], minx: number, miny: number, maxx: number, maxy: number) {
  return !(e[2] < minx || e[0] > maxx || e[3] < miny || e[1] > maxy);
}
// Jedna XYZ dlaždicová ÚP vrstva vykreslená do aktuálneho výrezu (custom tile-grid, mapa nie je MapLibre).
function UpTiles({ src, X, Y, res, w, h, dragT }: { src: Extract<UpSource, { kind: "xyz" }>; X: number; Y: number; res: number; w: number; h: number; dragT?: string }) {
  const Z = Math.max(0, Math.min(src.maxZ, Math.round(Math.log2(BASE_RES / res))));
  const tileRes = BASE_RES / 2 ** Z;
  const span = tileRes * 256;
  const minx = X - (w / 2) * res, maxx = X + (w / 2) * res;
  const miny = Y - (h / 2) * res, maxy = Y + (h / 2) * res;
  const n = 2 ** Z;
  const tx0 = Math.max(0, Math.floor((minx + RMERC) / span)), tx1 = Math.min(n - 1, Math.floor((maxx + RMERC) / span));
  const ty0 = Math.max(0, Math.floor((RMERC - maxy) / span)), ty1 = Math.min(n - 1, Math.floor((RMERC - miny) / span));
  const px = (tileRes / res) * 256;
  const tiles: ReactNode[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const tMinX = -RMERC + tx * span, tMaxY = RMERC - ty * span;
      const sx = w / 2 + (tMinX - X) / res, sy = h / 2 - (tMaxY - Y) / res;
      const url = src.url.replace("{z}", String(Z)).replace("{x}", String(tx)).replace("{y}", String(ty));
      tiles.push(<img key={`${Z}-${tx}-${ty}`} src={url} alt="" draggable={false}
        style={{ position: "absolute", left: sx, top: sy, width: px + 1, height: px + 1, userSelect: "none" }} />);
    }
  }
  return <div style={{ position: "absolute", inset: 0, transform: dragT, opacity: src.opacity ?? 0.6, pointerEvents: "none" }}>{tiles}</div>;
}

// ——— Inžinierske siete — správcovia + „vyjadrenie k existencii sietí" (detailné siete nie sú otvorené dáta v SR) ———
function sietiLinks(lat: number, lng: number): { kind: string; op: string; url: string; note?: string }[] {
  // Elektrina podľa distribučného územia (hrubo podľa zemepisnej dĺžky).
  const el = lng < 18.0
    ? { op: "ZSD — Západoslovenská distribučná", url: "https://www.zsdis.sk/Uvod/Podnikatelia/Sluzby-distribucie/Existencia-a-zakreslovanie-sieti" }
    : lng < 20.3
      ? { op: "SSD — Stredoslovenská distribučná", url: "https://www.ssd.sk" }
      : { op: "VSD — Východoslovenská distribučná", url: "https://www.vsds.sk/edso/mapa" };
  const zilina = lng >= 18.0 && lng < 19.7 && lat >= 49.0; // Kysuce / Žilina (SEVAK) — hrubý odhad
  const voda = zilina
    ? { op: "SEVAK — Severoslovenské vodárne a kanalizácie", url: "https://www.sevak.sk", note: undefined as string | undefined }
    : { op: "Miestny vodárenský podnik", url: "https://www.vodarne.eu", note: "vyber podľa obce" };
  return [
    { kind: "⚡ Elektrina", op: el.op, url: el.url },
    { kind: "🔥 Plyn", op: "SPP-distribúcia", url: "https://www.spp-distribucia.sk" },
    { kind: "💧 Voda / kanalizácia", op: voda.op, url: voda.url, note: voda.note },
    { kind: "📞 Telekom", op: "Slovak Telekom", url: "https://www.telekom.sk" },
  ];
}
function SietiPanel({ lat, lng }: { lat: number; lng: number }) {
  const items = sietiLinks(lat, lng);
  return (
    <details className="rounded-lg border border-line bg-surface-2/30 p-2">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted">🛠️ Inžinierske siete — vyjadrenie správcov</summary>
      <div className="mt-1 space-y-1">
        <div className="text-[10px] text-muted">Detailné siete nie sú otvorené dáta — presnú polohu potvrdí správca cez „vyjadrenie k existencii sietí" pre toto miesto:</div>
        {items.map((it) => (
          <div key={it.kind} className="flex items-center justify-between gap-2">
            <span className="text-muted">{it.kind}: <span className="text-fg">{it.op}</span>{it.note ? ` (${it.note})` : ""}</span>
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-fg hover:border-ink">portál ↗</a>
          </div>
        ))}
      </div>
    </details>
  );
}

export function MapView({
  parcels,
  datasetName,
  datasetId,
  role,
  texts = [],
  wmsExtra = [],
  opportunities = [],
  focusParcelId = null,
  initialCenter = null,
  flyTo = null,
}: {
  parcels: Parcel[];
  datasetName?: string;
  datasetId?: string;
  role: Role;
  texts?: { lat: number; lng: number; txt: string }[];
  wmsExtra?: WmsDef[];
  opportunities?: { parcel_id: string; score: number; kind: string }[];
  focusParcelId?: string | null;
  initialCenter?: { lat: number; lng: number; zoom: number } | null;
  flyTo?: { lat: number; lng: number; zoom: number; nonce: number } | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragState = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [identified, setIdentified] = useState<Parcel | null>(null);
  const [idOwners, setIdOwners] = useState<IdOwners | null>(null);
  type FullLv = Awaited<ReturnType<typeof getLvVypis>>;
  const [fullLv, setFullLv] = useState<FullLv | null>(null);
  const [fullBusy, setFullBusy] = useState(false);
  const [showDev, setShowDev] = useState(false);
  type Access = Awaited<ReturnType<typeof getParcelAccessibility>>;
  const [access, setAccess] = useState<Access | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  type Limits = Awaited<ReturnType<typeof getParcelLimits>>;
  const [limits, setLimits] = useState<Limits | null>(null);
  const [medians, setMedians] = useState<{ pozemok: number | null; byt: number | null } | null>(null);
  type NearListing = Awaited<ReturnType<typeof getMarketListingsNear>>[number];
  const [nearListings, setNearListings] = useState<NearListing[]>([]);
  // Trh: prehliadanie inzerátov pre celý viditeľný výrez (toggle, nezávislé od výberu parcely)
  const [marketBrowse, setMarketBrowse] = useState(false);
  const [browsePins, setBrowsePins] = useState<NearListing[]>([]);
  const [pinSel, setPinSel] = useState<NearListing | null>(null);
  type UpZone = Awaited<ReturnType<typeof getParcelZone>>;
  const [upZone, setUpZone] = useState<UpZone>(null);
  const [upZones, setUpZones] = useState<Awaited<ReturnType<typeof listUpZones>>>([]);
  const [upZonesOn, setUpZonesOn] = useState(false);
  const [upSrOn, setUpSrOn] = useState(false);   // krajský ÚP (celá SR) — dlaždice/WMS overlay
  const [upImportBusy, setUpImportBusy] = useState(false);
  const [upImportMsg, setUpImportMsg] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [measure, setMeasure] = useState<{ lat: number; lng: number }[]>([]);
  const [snap, setSnap] = useState(true);
  const [snapPt, setSnapPt] = useState<{ x: number; y: number } | null>(null);
  // vrstvy (Layer Catalog)
  const allWms = useMemo(
    () => [...CURATED_WMS, ...wmsExtra.map((w) => ({ ...w, attribution: w.attribution ?? "vlastná WMS", reliable: false }))],
    [wmsExtra],
  );
  const [wmsOn, setWmsOn] = useState<Record<string, boolean>>({});
  const [wmsOp, setWmsOp] = useState<Record<string, number>>({});
  const [baseMap, setBaseMap] = useState<string>("ortofoto"); // ZBGIS-style podklad (jeden naraz)
  const [showCKN, setShowCKN] = useState(true);   // register C (čierne)
  const [showEKN, setShowEKN] = useState(true);   // register E (zelené)
  const showParcels = showCKN || showEKN;
  const knIsE = (t?: string | null) => (t ?? "").toUpperCase().startsWith("E");
  const [parcelOpacity, setParcelOpacity] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showTexts, setShowTexts] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [limOn, setLimOn] = useState<Record<string, boolean>>({});   // úradné limity ako prekrytie
  const [limOp, setLimOp] = useState<Record<string, number>>({});
  // ESKN-first: národný ÚGKK kataster ako DEFAULT podklad + identify ľubovoľnej parcely v SR
  const [esknBaseOn, setEsknBaseOn] = useState(true);   // ESKN kataster ako default celoSR vrstva
  const [esknMode, setEsknMode] = useState(true);       // klik = live ESKN identify (default zapnuté)
  const [esknHit, setEsknHit] = useState<EsknParcel | null>(null);
  const [esknBusy, setEsknBusy] = useState(false);
  // Kompletný obraz parcely po kliku: limity (všetky ArcGIS/WMS vrstvy) + trh + ÚP zóna — agregované pre ľubovoľnú parcelu v SR
  const [esknLimits, setEsknLimits] = useState<Limits | null>(null);
  const [esknMarket, setEsknMarket] = useState<NearListing[]>([]);
  const [esknZone, setEsknZone] = useState<UpZone | null>(null);
  const [esknZonePick, setEsknZonePick] = useState<string>("");  // ručný výber funkčnej zóny (podľa ÚP overlay) → kalkulačka
  // ÚP dokumenty obce (auto-fetch)
  const [upDocs, setUpDocs] = useState<Awaited<ReturnType<typeof getUpDocs>>>([]);
  const [upChanges, setUpChanges] = useState<Awaited<ReturnType<typeof getUpChanges>>>([]);
  const [upDocUrl, setUpDocUrl] = useState("");
  const [upDocBusy, setUpDocBusy] = useState(false);
  const [upDocMsg, setUpDocMsg] = useState<string | null>(null);
  // regulatívy (ručný číselník per zóna)
  const [upReg, setUpReg] = useState<Awaited<ReturnType<typeof getUpRegulativ>>>([]);
  const [regForm, setRegForm] = useState({ zone: "", funkcia: "", izp: "", kz: "", ipp: "", vyska: "", podlazi: "" });
  const [regBusy, setRegBusy] = useState(false);
  // session workbench
  const [events, setEvents] = useState<Ev[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  const pushEvent = useCallback((msg: string) => {
    const time = typeof window !== "undefined" ? new Date().toLocaleTimeString("sk-SK") : "";
    setEvents((e) => [{ time, msg }, ...e].slice(0, 60));
  }, []);

  // ——— Fáza C: ÚP rastre (georeferencované podklady z R2) ———
  const canEdit = canRunPipeline(role);
  const [rasters, setRasters] = useState<RasterInfo[]>([]);
  const [rasterData, setRasterData] = useState<Record<string, string>>({});
  const [rasterOn, setRasterOn] = useState<Record<string, boolean>>({});
  const [georefId, setGeorefId] = useState<string | null>(null);
  const [gcps, setGcps] = useState<GCP[]>([]);
  const [pendingPx, setPendingPx] = useState<{ px: number; py: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const reloadRasters = useCallback(async () => {
    if (!datasetId) { setRasters([]); return; }
    try { setRasters(await listRasters({ data: { datasetId } })); } catch { /* fail-soft */ }
  }, [datasetId]);
  useEffect(() => { void reloadRasters(); }, [reloadRasters]);
  useEffect(() => {
    setRasterOn((cur) => {
      const next = { ...cur };
      for (const r of rasters) if (r.transform_json && next[r.id] === undefined) next[r.id] = true;
      return next;
    });
  }, [rasters]);
  useEffect(() => {
    let alive = true;
    for (const r of rasters) {
      if ((rasterOn[r.id] || georefId === r.id) && !rasterData[r.id]) {
        getRasterData({ data: { id: r.id } }).then((d) => {
          if (alive && d.ok && d.dataUrl) setRasterData((m) => (m[r.id] ? m : { ...m, [r.id]: d.dataUrl! }));
        }).catch(() => {});
      }
    }
    return () => { alive = false; };
  }, [rasters, rasterOn, georefId, rasterData]);

  async function handleRasterUpload(file: File) {
    if (!datasetId) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(new Error("read"));
        fr.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(",");
      const mime = dataUrl.slice(5, comma).split(";")[0] || "image/png";
      const base64 = dataUrl.slice(comma + 1);
      if (base64.length > 12_000_000) { pushEvent("Súbor je príliš veľký (max ~9 MB)."); return; }
      const dim = await new Promise<{ w: number; h: number }>((resolve) => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => resolve({ w: 0, h: 0 });
        im.src = dataUrl;
      });
      if (!dim.w || !dim.h) { pushEvent("Neplatný obrázok."); return; }
      const r = await uploadRaster({ data: { datasetId, name: file.name, kind: "up", mime, width: dim.w, height: dim.h, dataBase64: base64, role } });
      if (r.ok && r.id) {
        const id = r.id;
        setRasterData((m) => ({ ...m, [id]: dataUrl }));
        await reloadRasters();
        setGeorefId(id); setGcps([]); setPendingPx(null); setCatalogOpen(false);
        pushEvent(`Podklad „${file.name}" nahratý — umiestni ho kontrolnými bodmi.`);
      } else pushEvent(r.message ?? "Nahranie zlyhalo.");
    } finally { setUploading(false); }
  }

  async function saveGeorefNow() {
    if (!georefId) return;
    const t = fitAffine(gcps);
    if (!t) { pushEvent("Potrebné aspoň 3 nekolineárne kontrolné body."); return; }
    const r = await saveGeoref({ data: { id: georefId, transform: t, points: gcps, role } });
    if (r.ok) {
      setRasterOn((m) => ({ ...m, [georefId]: true }));
      await reloadRasters();
      pushEvent(`Georeferencia uložená (${gcps.length} bodov).`);
      setGeorefId(null); setGcps([]); setPendingPx(null);
    } else pushEvent(r.message ?? "Uloženie zlyhalo.");
  }

  const georefRaster = rasters.find((r) => r.id === georefId) ?? null;

  // ——— Swipe porovnanie (dnes ↔ historický georeferencovaný raster) ———
  const [swipe, setSwipe] = useState<{ id: string; x: number } | null>(null);

  // ——— BPEJ zóny (mapová vrstva, farebne podľa kódu) ———
  const [bpejZones, setBpejZones] = useState<{ code: string; skupina: number | null; geometry_json: string }[]>([]);
  const [bpejOn, setBpejOn] = useState(false);
  // Farebný režim parciel: none = obrys · bpej = choropleth podľa skupiny kvality (1 zelená → 9 červená)
  const [colorMode, setColorMode] = useState<"none" | "bpej">("none");
  const vectorSvgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!datasetId) { setBpejZones([]); return; }
    let alive = true;
    listBpejZones({ data: { datasetId } }).then((z) => { if (alive) setBpejZones(z); }).catch(() => {});
    return () => { alive = false; };
  }, [datasetId]);

  // ——— ÚP zóny (funkčné plochy — polygóny) ———
  const reloadUpZones = useCallback(() => {
    if (!datasetId) { setUpZones([]); return; }
    listUpZones({ data: { datasetId } }).then(setUpZones).catch(() => {});
  }, [datasetId]);
  useEffect(() => { reloadUpZones(); }, [reloadUpZones]);
  async function importUpZonesFile(file: File) {
    if (!datasetId) return;
    setUpImportBusy(true); setUpImportMsg(null);
    try {
      const text = await file.text();
      const r = await importUpZones({ data: { datasetId, geojson: text, role, replace: true } });
      setUpImportMsg(r.ok ? `Naimportované ${r.count} ÚP zón.` : (r.message ?? "Import zlyhal."));
      if (r.ok) { reloadUpZones(); pushEvent(`ÚP zóny importované (${r.count}).`); }
    } catch (e) { setUpImportMsg(e instanceof Error ? e.message : "Chyba importu."); }
    finally { setUpImportBusy(false); }
  }

  // ——— Režim mapy: celé k.ú. vs zvýraznené príležitosti ———
  const [mode, setMode] = useState<"full" | "opps">("full");
  // NL/atribútový filter mapy — zvýrazní parcely podľa dopytu (klientsky, z Parcel polí)
  const [filterQ, setFilterQ] = useState("");
  const filterSet = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q) return null;
    const tests: ((p: Parcel) => boolean)[] = [];
    if (/nevyspor/.test(q)) tests.push((p) => p.settled === 0);
    else if (/vyspor/.test(q)) tests.push((p) => p.settled === 1);
    if (/orn/.test(q)) tests.push((p) => /orn/i.test(p.use_type ?? ""));
    if (/\bles/.test(q)) tests.push((p) => /les/i.test(p.use_type ?? ""));
    if (/z[aá]hrad/.test(q)) tests.push((p) => /[zž][aá]hrad/i.test(p.use_type ?? ""));
    if (/tr[aá]vny|ttp/.test(q)) tests.push((p) => /tr[aá]vny/i.test(p.use_type ?? ""));
    if (/zastavan|stavebn/.test(q)) tests.push((p) => /zastavan/i.test(p.use_type ?? ""));
    const gm = q.match(/skupina\s*(\d)|bpej\s*(\d)/);
    if (gm) { const g = Number(gm[1] ?? gm[2]); tests.push((p) => p.bpej_skupina === g); }
    const am = q.match(/nad\s*(\d{3,})/); if (am) { const n = Number(am[1]); tests.push((p) => (p.area_m2 ?? 0) >= n); }
    const dm = q.match(/do\s*(\d{3,})/); if (dm) { const n = Number(dm[1]); tests.push((p) => (p.area_m2 ?? 0) <= n); }
    if (!tests.length) return null;
    const s = new Set<string>();
    for (const p of parcels) if (tests.every((t) => t(p))) s.add(p.id);
    return s;
  }, [filterQ, parcels]);

  const oppSet = useMemo(() => new Set(opportunities.map((o) => o.parcel_id)), [opportunities]);
  const oppScore = useMemo(() => new Map(opportunities.map((o) => [o.parcel_id, o.score] as const)), [opportunities]);

  // ——— Územnoplánovacia informácia (body z georeferencovaného ÚP rastra) ———
  const [upInfos, setUpInfos] = useState<UpInfo[]>([]);
  const [upForm, setUpForm] = useState<{ lat: number; lng: number; parcel_no: string | null; fa: string; reg: string; note: string } | null>(null);
  const reloadUpInfo = useCallback(async () => {
    if (!datasetId) { setUpInfos([]); return; }
    try { setUpInfos(await listUpInfo({ data: { datasetId } })); } catch { /* fail-soft */ }
  }, [datasetId]);
  useEffect(() => { void reloadUpInfo(); }, [reloadUpInfo]);
  async function saveUpInfo() {
    if (!datasetId || !upForm || upForm.fa.trim().length < 1) { pushEvent("Zadaj funkčnú plochu."); return; }
    const r = await addUpInfo({ data: { datasetId, lat: upForm.lat, lng: upForm.lng, parcelNo: upForm.parcel_no ?? undefined, functionalArea: upForm.fa.trim(), regulativ: upForm.reg.trim() || undefined, note: upForm.note.trim() || undefined, role } });
    if (r.ok) { setUpForm(null); await reloadUpInfo(); pushEvent(`ÚP info „${upForm.fa.trim()}" uložené.`); }
    else pushEvent(r.message ?? "Uloženie zlyhalo.");
  }

  // ——— Selection → report: súpis vybraných parciel (CSV) ———
  function exportSelectionCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = [
      ["Súpis parciel z výberu", datasetName ?? datasetId ?? ""].map(esc).join(";"),
      "",
      ["Parcelné číslo", "Register", "Výmera (m²)", "Druh", "LV"].map(esc).join(";"),
    ];
    for (const p of selectedParcels) rows.push([p.parcel_no, p.kn_type ?? "", p.area_m2 ?? 0, p.use_type ?? "", p.lv_no ?? ""].map(esc).join(";"));
    rows.push("", ["Spolu parciel", selectedParcels.length].map(esc).join(";"), ["Súhrnná výmera (m²)", totalArea].map(esc).join(";"));
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `supis_vyber_${selectedParcels.length}_parciel.csv`; a.click(); URL.revokeObjectURL(url);
    pushEvent(`Súpis výberu (${selectedParcels.length} parciel) exportovaný do CSV.`);
  }

  const rings = useMemo(
    () =>
      parcels
        .map((p) => ({ parcel: p, ring: parseRing(p.geometry_json) }))
        .filter((x): x is { parcel: Parcel; ring: Ring } => !!x.ring),
    [parcels],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitAll = useCallback(() => {
    if (size.w === 0 || rings.length === 0) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const { ring } of rings)
      for (const [lng, lat] of ring) {
        const m = toMerc(lng, lat);
        minx = Math.min(minx, m.x); maxx = Math.max(maxx, m.x);
        miny = Math.min(miny, m.y); maxy = Math.max(maxy, m.y);
      }
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const rNeed = Math.max(Math.max(1, maxx - minx) / (size.w * 0.85), Math.max(1, maxy - miny) / (size.h * 0.85));
    const zoom = Math.max(ZMIN, Math.min(ZMAX, Math.log2(BASE_RES / rNeed)));
    setView({ X: cx, Y: cy, zoom });
  }, [size, rings]);

  useEffect(() => {
    if (view || size.w === 0) return;
    if (initialCenter) {                 // ESKN-first: otvor na národnom SR pohľade (nezávisle od datasetu)
      const m = toMerc(initialCenter.lng, initialCenter.lat);
      setView({ X: m.x, Y: m.y, zoom: initialCenter.zoom });
      pushEvent("Národný ESKN pohľad — priblíž alebo vyhľadaj miesto.");
      return;
    }
    if (rings.length === 0) return;
    fitAll();
    pushEvent(`Dataset načítaný — ${rings.length} parciel, LocalCanvas engine.`);
  }, [view, size, rings, fitAll, pushEvent, initialCenter]);

  // Vyhľadávanie miesta/adresy (ZBGIS-style) → prelet mapy na súradnice
  useEffect(() => {
    if (!flyTo) return;
    const m = toMerc(flyTo.lng, flyTo.lat);
    setView({ X: m.x, Y: m.y, zoom: flyTo.zoom });
    pushEvent(`Prelet na vyhľadané miesto (${flyTo.lat.toFixed(5)}, ${flyTo.lng.toFixed(5)}).`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce]);

  const res = view ? BASE_RES / 2 ** view.zoom : BASE_RES;

  const project = useCallback(
    (lng: number, lat: number) => {
      if (!view) return { x: 0, y: 0 };
      const m = toMerc(lng, lat);
      return { x: size.w / 2 + (m.x - view.X) / res, y: size.h / 2 - (m.y - view.Y) / res };
    },
    [view, size, res],
  );
  const unproject = useCallback(
    (px: number, py: number) => {
      if (!view) return { lng: 0, lat: 0 };
      return toLngLat(view.X + (px - size.w / 2) * res, view.Y - (py - size.h / 2) * res);
    },
    [view, size, res],
  );

  // Trh browse: načítaj inzeráty pre stred aktuálneho výrezu (debounced), keď je toggle zapnutý.
  useEffect(() => {
    if (!marketBrowse || !view || size.w === 0) { setBrowsePins([]); return; }
    const c = toLngLat(view.X, view.Y);
    const halfKm = Math.min(60, Math.max(2, (Math.hypot(size.w, size.h) * res) / 2000));
    let alive = true;
    const t = setTimeout(() => {
      getMarketListingsNear({ data: { lat: c.lat, lng: c.lng, radiusKm: halfKm } })
        .then((r) => { if (alive) setBrowsePins(r); }).catch(() => {});
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [marketBrowse, view, res, size]);

  const enabledWms = allWms.filter((w) => wmsOn[w.id]);

  // ÚP dokumenty + zmeny + regulatívy obce — načítaj pri zmene datasetu
  useEffect(() => {
    if (!datasetId) { setUpDocs([]); setUpChanges([]); setUpReg([]); return; }
    let alive = true;
    getUpDocs({ data: { datasetId } }).then((d) => { if (alive) setUpDocs(d); }).catch(() => {});
    getUpChanges({ data: { datasetId } }).then((c) => { if (alive) setUpChanges(c); }).catch(() => {});
    getUpRegulativ({ data: { datasetId } }).then((r) => { if (alive) setUpReg(r); }).catch(() => {});
    return () => { alive = false; };
  }, [datasetId]);
  async function saveReg() {
    if (!datasetId || !regForm.zone.trim()) return;
    setRegBusy(true);
    const numOf = (s: string) => { const n = Number(s.replace(",", ".")); return isFinite(n) && s.trim() !== "" ? n : undefined; };
    try {
      await setUpRegulativ({ data: { datasetId, zoneCode: regForm.zone.trim(), funkcia: regForm.funkcia.trim() || undefined, izp: numOf(regForm.izp), kz: numOf(regForm.kz), ipp: numOf(regForm.ipp), maxVyska: numOf(regForm.vyska), maxPodlazi: numOf(regForm.podlazi), role } });
      setRegForm({ zone: "", funkcia: "", izp: "", kz: "", ipp: "", vyska: "", podlazi: "" });
      setUpReg(await getUpRegulativ({ data: { datasetId } }));
    } catch { /* noop */ } finally { setRegBusy(false); }
  }
  async function delReg(id: number) {
    try { await deleteUpRegulativ({ data: { id, role } }); if (datasetId) setUpReg(await getUpRegulativ({ data: { datasetId } })); } catch { /* noop */ }
  }
  async function syncUpRegistry() {
    setUpDocBusy(true); setUpDocMsg(null);
    try {
      const r = await refreshUpRegistry({ data: { role } });
      setUpDocMsg(r.ok ? `Číselník synchronizovaný z Macu: ${r.count} obcí.` : r.message ?? "Neúspešné.");
    } catch (e) { setUpDocMsg(e instanceof Error ? e.message : "Chyba."); }
    finally { setUpDocBusy(false); }
  }
  // Efektívny regulatív pre identifikovanú parcelu: zhoda podľa kódu ÚP zóny, inak default '*'.
  const effZone = useMemo(() => {
    const match = upReg.find((r) => upZone?.code && r.zone_code === upZone.code) ?? upReg.find((r) => r.zone_code === "*");
    if (!match) return upZone;
    return { code: match.zone_code ?? upZone?.code ?? undefined, name: match.funkcia ?? undefined, ipp: match.ipp ?? undefined, izp: match.izp ?? undefined, kz: match.kz ?? undefined, character: (match.ipp ?? 0) > 0 ? "rozvojove" : "nezastavatelne" };
  }, [upReg, upZone]);
  async function doImportUpDocs(useRegistry?: boolean) {
    if (!datasetId) return;
    if (!useRegistry && !upDocUrl.trim()) { setUpDocMsg("Vlož URL stránky obce, alebo použi Auto z číselníka."); return; }
    setUpDocBusy(true); setUpDocMsg(null);
    try {
      const r = await importUpDocs({ data: { datasetId, pageUrl: useRegistry ? undefined : upDocUrl.trim(), role } });
      setUpDocMsg(r.ok ? `Načítaných ${r.count} dokumentov${r.changed ? ` · ${r.changed} zmien` : ""}.` : r.message ?? "Neúspešné.");
      if (r.ok) {
        if (!useRegistry) setUpDocUrl("");
        try { setUpDocs(await getUpDocs({ data: { datasetId } })); setUpChanges(await getUpChanges({ data: { datasetId } })); } catch { /* noop */ }
      }
    } catch (e) { setUpDocMsg(e instanceof Error ? e.message : "Chyba."); }
    finally { setUpDocBusy(false); }
  }

  // Identify → reálni vlastníci LV (rolovo maskovaní na serveri)
  useEffect(() => {
    let alive = true;
    setFullLv(null); setFullBusy(false); setShowDev(false); setUpZone(null); setAccess(null); setAccessBusy(false); setMedians(null); setNearListings([]); setLimits(null);  // reset pri zmene parcely
    if (identified?.centroid_lat != null && identified?.centroid_lng != null && datasetId) {
      getParcelZone({ data: { datasetId, lat: identified.centroid_lat, lng: identified.centroid_lng } })
        .then((z) => { if (alive) setUpZone(z); }).catch(() => {});
    }
    if (identified?.centroid_lat != null && identified?.centroid_lng != null) {
      getMarketListingsNear({ data: { lat: identified.centroid_lat, lng: identified.centroid_lng, radiusKm: 12 } })
        .then((r) => { if (alive) setNearListings(r); }).catch(() => {});
      getParcelLimits({ data: { lat: identified.centroid_lat, lng: identified.centroid_lng } })
        .then((r) => { if (alive) setLimits(r); }).catch(() => {});
    }
    if (identified) {
      const locality = (datasetName ?? "").replace(/^k\.ú\.\s*/i, "").trim();
      if (locality) {
        Promise.all([
          getLocalityMedian({ data: { okres: locality, ptype: "pozemok", deal: "predaj" } }),
          getLocalityMedian({ data: { okres: locality, ptype: "byt", deal: "predaj" } }),
        ]).then(([pz, bt]) => { if (alive) setMedians({ pozemok: pz.median, byt: bt.median }); }).catch(() => {});
      }
    }
    if (identified?.lv_no != null && datasetId) {
      setIdOwners(null);
      getLvDetail({ data: { datasetId, lvNo: identified.lv_no, role } })
        .then((r) => { if (alive) setIdOwners({ access: r.access, count: r.count, owners: r.owners }); })
        .catch(() => { if (alive) setIdOwners({ access: "denied", count: 0, owners: [] }); });
    } else {
      setIdOwners(null);
    }
    return () => { alive = false; };
  }, [identified, datasetId, role]);

  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hitTest = useCallback(
    (px: number, py: number): Parcel | null => {
      if (!showParcels) return null;
      for (let i = rings.length - 1; i >= 0; i--) {
        const { parcel, ring } = rings[i];
        const pts = ring.map(([lng, lat]) => project(lng, lat));
        let inside = false;
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
          const yi = pts[a].y, xi = pts[a].x, yj = pts[b].y, xj = pts[b].x;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return parcel;
      }
      return null;
    },
    [rings, project, showParcels],
  );

  // najbližší vrchol (snapping) — len na viditeľné parcely
  const nearestVertex = useCallback(
    (px: number, py: number, tolPx = 12): { x: number; y: number } | null => {
      if (!showParcels) return null;
      let best: { x: number; y: number } | null = null;
      let bd = tolPx * tolPx;
      for (const { ring } of rings)
        for (const [lng, lat] of ring) {
          const p = project(lng, lat);
          const d = (p.x - px) ** 2 + (p.y - py) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
      return best;
    },
    [rings, project, showParcels],
  );

  // ——— Selection ———
  const selectOne = useCallback((id: string) => { setSelection([id]); }, []);
  const toggleSel = useCallback((id: string) => {
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }, []);
  const clearSel = useCallback(() => { setSelection([]); setIdentified(null); }, []);

  // ZBGIS search bar → fokus na parcelu (vycentruj + identify)
  useEffect(() => {
    if (!focusParcelId) return;
    const p = parcels.find((x) => x.id === focusParcelId);
    if (!p || p.centroid_lat == null || p.centroid_lng == null) return;
    const m = toMerc(p.centroid_lng, p.centroid_lat);
    setView({ X: m.x, Y: m.y, zoom: 17 });
    setIdentified(p);
  }, [focusParcelId, parcels]);

  // Geolokácia — presun mapy na GPS polohu (teréne)
  const locateMe = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { const m = toMerc(pos.coords.longitude, pos.coords.latitude); setView({ X: m.x, Y: m.y, zoom: 17 }); },
        undefined,
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, []);

  // Export aktuálneho vektorového pohľadu (parcely + popisy + výber) do PNG.
  // Same-origin SVG → bez CORS; ortofoto/WMS podklad sa rasterizovať nedá (cross-origin), preto export = katastrálna kresba na papieri.
  const exportPng = useCallback(() => {
    const svg = vectorSvgRef.current;
    if (!svg || size.w === 0) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(size.w));
    clone.setAttribute("height", String(size.h));
    clone.removeAttribute("style"); // odstráň drag transform
    const svgStr = new XMLSerializer().serializeToString(clone);
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = size.w * scale; canvas.height = size.h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#f7f5ef"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const name = (datasetName ?? "kataster").replace(/[^\wÀ-ɏ.-]+/g, "_");
        a.href = url; a.download = `${name}_parcely.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    };
    img.onerror = () => pushEvent("Export PNG zlyhal — skús to znova.");
    img.src = src;
  }, [size, datasetName, pushEvent]);

  // Živý ESKN identify — klik kdekoľvek v SR → atribúty parcely z ÚGKK ESKN
  const runEsknIdentify = useCallback((lng: number, lat: number) => {
    setEsknBusy(true);
    setEsknLimits(null); setEsknMarket([]); setEsknZone(null); setEsknZonePick("");
    esknIdentify({ data: { lat, lng } })
      .then((r) => { setEsknHit(r); pushEvent(r.found ? `ESKN parcela ${r.parcel_no} — ${r.area_m2 ?? "?"} m².` : "ESKN: na tomto mieste nie je parcela C."); })
      .catch(() => setEsknHit({ found: false, parcel_no: null, area_m2: null, druh_pozemku: null, umiestnenie: null, ku_id: null, lv_id: null, lat, lng, message: "ESKN nedostupné." }))
      .finally(() => setEsknBusy(false));
    // Kompletný obraz — národné zdroje (limity výstavby zo všetkých ArcGIS/WMS registrov + trh) pre ľubovoľnú parcelu v SR
    getParcelLimits({ data: { lat, lng } }).then((l) => setEsknLimits(l)).catch(() => {});
    getMarketListingsNear({ data: { lat, lng, radiusKm: 5 } }).then((m) => setEsknMarket(m)).catch(() => {});
  }, [pushEvent]);

  // ÚP zóna pre ESKN parcelu — kde máme importovaný územný plán (podľa nášho datasetu)
  useEffect(() => {
    const o = esknHit?.ours;
    if (!o?.dataset_id || !esknHit) return;
    let alive = true;
    getParcelZone({ data: { datasetId: o.dataset_id, lat: esknHit.lat, lng: esknHit.lng } })
      .then((z) => { if (alive) setEsknZone(z); }).catch(() => {});
    return () => { alive = false; };
  }, [esknHit]);

  // Watchlist — záložky parciel (localStorage) pre feedback/prieskum
  const [marks, setMarks] = useState<{ id: string; no: string }[]>([]);
  useEffect(() => { try { const s = localStorage.getItem("tlkc.marks"); if (s) setMarks(JSON.parse(s)); } catch { /* ignore */ } }, []);
  const toggleMark = useCallback((p: Parcel) => {
    setMarks((prev) => {
      const next = prev.some((m) => m.id === p.id) ? prev.filter((m) => m.id !== p.id) : [...prev, { id: p.id, no: p.parcel_no }];
      try { localStorage.setItem("tlkc.marks", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const goToParcel = useCallback((id: string) => {
    const p = parcels.find((x) => x.id === id);
    if (p && p.centroid_lat != null && p.centroid_lng != null) {
      const m = toMerc(p.centroid_lng, p.centroid_lat); setView({ X: m.x, Y: m.y, zoom: 17 }); setIdentified(p);
    }
  }, [parcels]);

  // Susedné parcely (assembly) — zdieľajú hranicu s cieľovou (klientsky, tolerancia ~6 m)
  const [neighborSet, setNeighborSet] = useState<Set<string> | null>(null);
  const findNeighbors = useCallback((target: Parcel) => {
    const tr = parseRing(target.geometry_json);
    if (!tr) { setNeighborSet(null); return; }
    const tol = 0.00006;
    let tminx = 1e9, tminy = 1e9, tmaxx = -1e9, tmaxy = -1e9;
    for (const [x, y] of tr) { tminx = Math.min(tminx, x); tminy = Math.min(tminy, y); tmaxx = Math.max(tmaxx, x); tmaxy = Math.max(tmaxy, y); }
    const s = new Set<string>();
    for (const p of parcels) {
      if (p.id === target.id) continue;
      const r = parseRing(p.geometry_json);
      if (!r) continue;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (const [x, y] of r) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
      if (bx1 < tminx - tol || bx0 > tmaxx + tol || by1 < tminy - tol || by0 > tmaxy + tol) continue;
      if (r.some(([x, y]) => tr.some(([tx, ty]) => Math.abs(x - tx) < tol && Math.abs(y - ty) < tol))) s.add(p.id);
    }
    setNeighborSet(s.size ? s : new Set());
  }, [parcels]);
  useEffect(() => { setNeighborSet(null); }, [identified]);

  const selectedParcels = useMemo(
    () => parcels.filter((p) => selection.includes(p.id)),
    [parcels, selection],
  );
  const totalArea = selectedParcels.reduce((a, p) => a + (p.area_m2 || 0), 0);

  const zoomToSelection = useCallback(() => {
    const sel = rings.filter((r) => selection.includes(r.parcel.id));
    if (sel.length === 0 || size.w === 0) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const { ring } of sel)
      for (const [lng, lat] of ring) {
        const m = toMerc(lng, lat);
        minx = Math.min(minx, m.x); maxx = Math.max(maxx, m.x);
        miny = Math.min(miny, m.y); maxy = Math.max(maxy, m.y);
      }
    const rNeed = Math.max(Math.max(1, maxx - minx) / (size.w * 0.7), Math.max(1, maxy - miny) / (size.h * 0.7));
    const zoom = Math.max(ZMIN, Math.min(ZMAX, Math.log2(BASE_RES / rNeed)));
    setView({ X: (minx + maxx) / 2, Y: (miny + maxy) / 2, zoom });
    pushEvent(`Zoom na výber — ${sel.length} parciel.`);
  }, [rings, selection, size, pushEvent]);

  // ——— Pointer ———
  const onPointerDown = (e: RPointerEvent) => {
    if (!view) return;
    const { x, y } = localXY(e);
    // Georeferencovanie: ak čaká bod z rastra, klik na mapu ho spáruje (kontrolný bod).
    if (georefId && pendingPx) {
      const ll = unproject(x, y);
      setGcps((g) => [...g, { px: pendingPx.px, py: pendingPx.py, lng: ll.lng, lat: ll.lat }]);
      setPendingPx(null);
      pushEvent(`Kontrolný bod #${gcps.length + 1} spárovaný (raster ↔ mapa).`);
      return;
    }
    if (tool === "upinfo") {
      const ll = unproject(x, y);
      const hit = hitTest(x, y);
      setUpForm({ lat: ll.lat, lng: ll.lng, parcel_no: hit?.parcel_no ?? null, fa: "", reg: "", note: "" });
      return;
    }
    if (tool === "measure") {
      const sp = snap ? nearestVertex(x, y) : null;
      const ll = sp ? unproject(sp.x, sp.y) : unproject(x, y);
      setMeasure((m) => [...m, { lat: ll.lat, lng: ll.lng }]);
      return;
    }
    if (tool === "select") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragState.current = { sx: x, sy: y, moved: false };
      setBox({ x0: x, y0: y, x1: x, y1: y });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { sx: x, sy: y, moved: false };
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!view) return;
    const { x, y } = localXY(e);
    if (tool === "measure") {
      setSnapPt(snap ? nearestVertex(x, y) : null);
    }
    if (dragState.current) {
      const dx = x - dragState.current.sx, dy = y - dragState.current.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragState.current.moved = true;
      if (tool === "select") setBox({ x0: dragState.current.sx, y0: dragState.current.sy, x1: x, y1: y });
      else setDrag({ dx, dy });
      return;
    }
    if (tool === "pan") setHoverId(hitTest(x, y)?.id ?? null);
  };

  const onPointerUp = (e: RPointerEvent) => {
    if (!view) return;
    const st = dragState.current;
    dragState.current = null;
    const { x, y } = localXY(e);

    if (tool === "select") {
      if (st && st.moved && box) {
        const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
        const hitIds = rings
          .filter(({ parcel }) => {
            const c = project(parcel.centroid_lng ?? 0, parcel.centroid_lat ?? 0);
            return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
          })
          .map((r) => r.parcel.id);
        setBox(null);
        if (hitIds.length) {
          setSelection((s) => Array.from(new Set([...s, ...hitIds])));
          pushEvent(`Box výber — pridaných ${hitIds.length} parciel.`);
        }
        return;
      }
      setBox(null);
      const hit = hitTest(x, y);
      if (hit) { toggleSel(hit.id); setIdentified(hit); pushEvent(`Výber prepnutý — parcela ${hit.parcel_no}.`); }
      return;
    }

    // pan
    if (st && drag && st.moved) {
      setView({ X: view.X - drag.dx * res, Y: view.Y + drag.dy * res, zoom: view.zoom });
      setDrag(null);
      return;
    }
    setDrag(null);
    if (!st || !st.moved) {
      const hit = hitTest(x, y);
      if (hit) {
        setIdentified(hit);
        if (e.ctrlKey || e.metaKey || e.shiftKey) { toggleSel(hit.id); pushEvent(`Výber prepnutý — parcela ${hit.parcel_no}.`); }
        else selectOne(hit.id);
      } else {
        setIdentified(null);
        if (!(e.ctrlKey || e.metaKey || e.shiftKey)) setSelection([]);
      }
      if (esknMode) { const ll = unproject(x, y); runEsknIdentify(ll.lng, ll.lat); }
    }
  };

  const zoomBy = (delta: number, cx?: number, cy?: number) => {
    if (!view) return;
    const px = cx ?? size.w / 2, py = cy ?? size.h / 2;
    const cur = unproject(px, py);
    const zoom = Math.max(ZMIN, Math.min(ZMAX, view.zoom + delta));
    const newRes = BASE_RES / 2 ** zoom;
    const m = toMerc(cur.lng, cur.lat);
    setView({ X: m.x - (px - size.w / 2) * newRes, Y: m.y + (py - size.h / 2) * newRes, zoom });
  };
  const onWheel = (e: RWheelEvent) => {
    if (!view) return;
    const { x, y } = localXY(e);
    zoomBy(-e.deltaY * 0.0015, x, y);
  };

  // Viewport culling — pri tisícoch parciel renderuj len tie v zábere (+margin), s tvrdým stropom.
  const shownRings = (() => {
    if (!view || size.w === 0) return rings;
    const out: typeof rings = [];
    for (const r of rings) {
      const c = project(r.parcel.centroid_lng ?? r.ring[0][0], r.parcel.centroid_lat ?? r.ring[0][1]);
      if (c.x > -80 && c.x < size.w + 80 && c.y > -80 && c.y < size.h + 80) {
        out.push(r);
        if (out.length >= 3000) break;
      }
    }
    return out;
  })();

  const dragT = drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined;
  const measurePx = measure.map((mp) => project(mp.lng, mp.lat));
  const measureTotal = measure.reduce((acc, cur, i) => (i === 0 ? 0 : acc + haversine(measure[i - 1], cur)), 0);
  const cursorClass = tool === "measure" || tool === "upinfo" ? "cursor-crosshair" : tool === "select" ? "cursor-cell" : "cursor-grab active:cursor-grabbing";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line bg-cream">
      <div
        ref={wrapRef}
        className={"absolute inset-0 " + cursorClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { if (!dragState.current) { setHoverId(null); setSnapPt(null); } }}
        onWheel={onWheel}
        onDoubleClick={(e) => { const { x, y } = localXY(e); zoomBy(1, x, y); }}
        style={{ touchAction: "none" }}
      >
        {/* Podkladová mapa (ZBGIS base-map switcher — najspodnejšia vrstva) */}
        {view && size.w > 0 && baseMap !== "none"
          ? (() => {
              const bd = CURATED_WMS.find((c) => c.id === baseMap);
              return bd ? (
                <img key={`base-${baseMap}`} src={wmsGetMap(bd, view.X, view.Y, res, size.w, size.h)} alt="podklad" draggable={false}
                  style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, transform: dragT, userSelect: "none" }} />
              ) : null;
            })()
          : null}

        {/* ESKN register E (určený operát) — pod C-KN, aby čísla C ostali navrchu */}
        {view && size.w > 0 && esknBaseOn ? (
          <img
            key="eskn-base-e"
            src={arcgisExport(ESKN_BASE_E, view.X, view.Y, res, size.w, size.h, esknDpiFor(res))}
            alt="ESKN register E (ÚGKK)"
            draggable={false}
            style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, transform: dragT, opacity: 0.75, userSelect: "none", pointerEvents: "none" }}
          />
        ) : null}

        {/* ESKN register C — DEFAULT celoSR podklad (dynamické dpi → parcely viditeľné pri každom zoome, ako ZBGIS) */}
        {view && size.w > 0 && esknBaseOn ? (
          <img
            key="eskn-base"
            src={arcgisExport(ESKN_BASE, view.X, view.Y, res, size.w, size.h, esknDpiFor(res))}
            alt="ESKN kataster (ÚGKK)"
            draggable={false}
            style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, transform: dragT, opacity: 0.95, userSelect: "none", pointerEvents: "none" }}
          />
        ) : null}

        {/* WMS rastrové vrstvy (stack, fail-soft) */}
        {view && size.w > 0
          ? enabledWms.map((w) => (
              <img
                key={w.id}
                src={wmsGetMap(w, view!.X, view!.Y, res, size.w, size.h)}
                alt={w.name}
                draggable={false}
                style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, transform: dragT, opacity: wmsOp[w.id] ?? 1, userSelect: "none" }}
              />
            ))
          : null}

        {/* Územný plán — krajský (celá SR), zjednotený overlay: dlaždice (ArcGIS) + WMS podľa výrezu */}
        {view && size.w > 0 && upSrOn
          ? UP_SR_SOURCES.filter((s) => extIntersects(
              s.ext,
              view!.X - (size.w / 2) * res, view!.Y - (size.h / 2) * res,
              view!.X + (size.w / 2) * res, view!.Y + (size.h / 2) * res,
            )).map((s) => s.kind === "xyz"
              ? <UpTiles key={s.id} src={s} X={view!.X} Y={view!.Y} res={res} w={size.w} h={size.h} dragT={dragT} />
              : (
                <img key={s.id} src={wmsGetMap(s.def, view!.X, view!.Y, res, size.w, size.h)} alt={s.name} draggable={false}
                  style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, transform: dragT, opacity: s.opacity ?? 0.6, userSelect: "none", pointerEvents: "none" }} />
              ))
          : null}

        {/* Limity výstavby — úradné vrstvy (ArcGIS export, transparentné, fail-soft) */}
        {view && size.w > 0
          ? LIMIT_LAYERS.filter((l) => limOn[l.id]).map((l) => (
              <img
                key={l.id}
                src={arcgisExport(l, view!.X, view!.Y, res, size.w, size.h)}
                alt={l.name}
                draggable={false}
                style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, transform: dragT, opacity: limOp[l.id] ?? 0.6, userSelect: "none", pointerEvents: "none" }}
              />
            ))
          : null}

        {/* Georeferencované ÚP rastre (overlay medzi WMS a vektorom) */}
        {view && size.w > 0
          ? rasters.map((r) => {
              if (swipe?.id === r.id) return null; // swipe-ovaný raster sa kreslí klipovaný nižšie
              if (!rasterOn[r.id] || !r.transform_json || !rasterData[r.id] || !r.width || !r.height) return null;
              let t: Affine | null = null;
              try { t = JSON.parse(r.transform_json) as Affine; } catch { return null; }
              if (!t) return null;
              const iw = r.width, ih = r.height;
              return (
                <img
                  key={r.id}
                  src={rasterData[r.id]}
                  alt={r.name}
                  draggable={false}
                  style={{
                    position: "absolute", left: 0, top: 0, width: iw, height: ih, transformOrigin: "0 0",
                    transform: `${dragT ? dragT + " " : ""}${rasterMatrix(t, view!.X, view!.Y, res, size.w, size.h)}`,
                    opacity: r.opacity, userSelect: "none", pointerEvents: "none",
                  }}
                />
              );
            })
          : null}

        {/* Swipe: georeferencovaný (historický) raster klipovaný do ľavej časti od rozdeľovníka */}
        {swipe && view && size.w > 0 ? (() => {
          const r = rasters.find((x) => x.id === swipe.id);
          if (!r || !r.transform_json || !rasterData[r.id] || !r.width || !r.height) return null;
          let t: Affine | null = null;
          try { t = JSON.parse(r.transform_json) as Affine; } catch { return null; }
          if (!t) return null;
          const iw = r.width, ih = r.height;
          return (
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${Math.max(0, size.w - swipe.x)}px 0 0)` }}>
              <img
                src={rasterData[r.id]}
                alt={r.name}
                draggable={false}
                style={{
                  position: "absolute", left: 0, top: 0, width: iw, height: ih, transformOrigin: "0 0",
                  transform: `${dragT ? dragT + " " : ""}${rasterMatrix(t, view!.X, view!.Y, res, size.w, size.h)}`,
                  opacity: 1, userSelect: "none", pointerEvents: "none",
                }}
              />
            </div>
          );
        })() : null}

        {/* Papierový grid podklad (len keď nie je raster) */}
        {enabledWms.length === 0 ? (
          <svg className="absolute inset-0" width={size.w} height={size.h} style={{ opacity: 0.35 }}>
            <defs>
              <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M48 0H0V48" fill="none" stroke="#d8c7a5" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={size.w} height={size.h} fill="url(#grid)" />
          </svg>
        ) : null}

        {/* BPEJ zóny (bonita pôdy) — farebne podľa kódu */}
        {bpejOn && view ? (
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} style={{ transform: dragT, opacity: 0.45 }}>
            {bpejZones.map((zone, zi) => {
              const r = parseRing(zone.geometry_json);
              if (!r) return null;
              const pts = r.map(([lng, lat]) => project(lng, lat));
              const d = pts.map((p, j) => (j === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
              const col = bpejSkupinaColor(zone.skupina, zone.code);
              return <path key={zi} d={d} fill={col} fillOpacity={0.5} stroke={col} strokeWidth={0.8} />;
            })}
          </svg>
        ) : null}

        {/* ÚP zóny (funkčné plochy) — farebne podľa charakteru */}
        {upZonesOn && view ? (
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} style={{ transform: dragT, opacity: 0.5 }}>
            {upZones.map((zn, zi) => {
              const r = parseRing(zn.geometry_json);
              if (!r) return null;
              const pts = r.map(([lng, lat]) => project(lng, lat));
              const d = pts.map((p, j) => (j === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
              const col = zn.character === "rozvojove" ? "#5b7a58" : zn.character === "nezastavatelne" ? "#9c4a40" : "#c9a45c";
              return <path key={zi} d={d} fill={col} fillOpacity={0.35} stroke={col} strokeWidth={1} />;
            })}
          </svg>
        ) : null}

        {/* Inzeráty v okolí (piny) — pri identifikovanej parcele */}
        {nearListings.length && view ? (
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} style={{ transform: dragT }}>
            {nearListings.map((l, li) => {
              if (l.lat == null || l.lng == null) return null;
              const p = project(l.lng, l.lat);
              const opp = !!(l.flags && (l.flags.includes("below") || l.flags.includes("drop")));
              return <circle key={li} cx={p.x} cy={p.y} r={opp ? 5 : 3.5} fill={opp ? "#5b7a58" : "#c9a45c"} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />;
            })}
          </svg>
        ) : null}

        {/* Parcely + selection + meranie */}
        {view ? (
          <svg ref={vectorSvgRef} className="absolute inset-0" width={size.w} height={size.h} style={{ transform: dragT }}>
            {showParcels ? (
              <g style={{ opacity: parcelOpacity }}>
                {[...shownRings].sort((a, b) => (knIsE(a.parcel.kn_type) ? 1 : 0) - (knIsE(b.parcel.kn_type) ? 1 : 0)).map(({ parcel, ring }) => {
                  const isE = knIsE(parcel.kn_type);
                  if (isE ? !showEKN : !showCKN) return null;   // vrstvy C-KN / E-KN samostatne zapínateľné
                  const pts = ring.map(([lng, lat]) => project(lng, lat));
                  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
                  const col = isE ? "#2f7d32" : "#1c1c1a";   // E-KN zelené · C-KN čierne
                  const isSel = selection.includes(parcel.id);
                  const isHover = hoverId === parcel.id;
                  const c = project(parcel.centroid_lng ?? ring[0][0], parcel.centroid_lat ?? ring[0][1]);
                  const bpejFill = colorMode === "bpej" && parcel.bpej_skupina && BPEJ_SKUPINA_COLORS[parcel.bpej_skupina]
                    ? BPEJ_SKUPINA_COLORS[parcel.bpej_skupina] + "66" : null;
                  return (
                    <g key={parcel.id}>
                      <path
                        d={d}
                        fill={isSel ? "#c9a45c55" : isHover ? col + "33" : bpejFill ?? "none"}
                        stroke={isSel ? "#9a7b3e" : col}
                        strokeWidth={isSel ? 2.6 : isHover ? 1.8 : view.zoom >= 17 ? 1.2 : view.zoom >= 15 ? 0.9 : view.zoom >= 13 ? 0.65 : 0.5}
                        strokeOpacity={isSel || isHover ? 1 : isE ? 0.9 : 0.75}
                      />
                      {showLabels && view.zoom >= 16 ? (
                        <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#1e1d19" style={{ paintOrder: "stroke", stroke: "#fffdf8", strokeWidth: 3 }}>
                          {parcel.parcel_no}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* Príležitosti — zvýraznenie na celej mape (režim „Príležitosti") */}
            {mode === "opps" ? (
              <g>
                {rings.filter(({ parcel }) => oppSet.has(parcel.id)).map(({ parcel, ring }) => {
                  const pts = ring.map(([lng, lat]) => project(lng, lat));
                  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
                  const c = project(parcel.centroid_lng ?? ring[0][0], parcel.centroid_lat ?? ring[0][1]);
                  const sc = Math.round((oppScore.get(parcel.id) ?? 0) * 100);
                  return (
                    <g key={"opp-" + parcel.id}>
                      <path d={d} fill="#9a7b3e33" stroke="#9a7b3e" strokeWidth={2.6} />
                      <circle cx={c.x} cy={c.y} r={9} fill="#9a7b3e" stroke="#fffdf8" strokeWidth={1.5} />
                      <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="bold" fill="#fffdf8">{sc}</text>
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* NL/atribútový filter — zvýraznenie zhôd */}
            {filterSet && filterSet.size > 0 ? (
              <g>
                {rings.filter(({ parcel }) => filterSet.has(parcel.id)).map(({ parcel, ring }) => {
                  const pts = ring.map(([lng, lat]) => project(lng, lat));
                  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
                  return <path key={"flt-" + parcel.id} d={d} fill="#0a8a8a2e" stroke="#0a8a8a" strokeWidth={2} />;
                })}
              </g>
            ) : null}

            {/* Susedné parcely (assembly) — zvýraznenie */}
            {neighborSet && neighborSet.size > 0 ? (
              <g>
                {rings.filter(({ parcel }) => neighborSet.has(parcel.id)).map(({ parcel, ring }) => {
                  const pts = ring.map(([lng, lat]) => project(lng, lat));
                  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
                  return <path key={"nbr-" + parcel.id} d={d} fill="#5b7a5833" stroke="#5b7a58" strokeWidth={2.2} />;
                })}
              </g>
            ) : null}

            {/* Miestne názvy (POPIS z VGI) */}
            {showTexts && view.zoom >= 14 ? (
              <g>
                {texts.map((t, i) => {
                  const p = project(t.lng, t.lat);
                  if (p.x < -60 || p.x > size.w + 60 || p.y < -20 || p.y > size.h + 20) return null;
                  return (
                    <text key={i} x={p.x} y={p.y} textAnchor="middle" fontSize="11" fontStyle="italic" fill="#5b5b63" style={{ paintOrder: "stroke", stroke: "#f8f8f8", strokeWidth: 2.5 }}>
                      {t.txt}
                    </text>
                  );
                })}
              </g>
            ) : null}

            {/* Fokus (identify) obrys navrchu */}
            {identified ? (() => {
              const r = rings.find((x) => x.parcel.id === identified.id);
              if (!r) return null;
              const pts = r.ring.map(([lng, lat]) => project(lng, lat));
              const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ") + " Z";
              return <g><path d={d} fill="none" stroke="#fffdf8" strokeWidth="4" strokeOpacity="0.7" /><path d={d} fill="none" stroke="#e0561f" strokeWidth="2.4" strokeDasharray="5 3" /></g>;
            })() : null}

            {measurePx.length > 0 ? (
              <g>
                <polyline points={measurePx.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#9a7b3e" strokeWidth="2" strokeDasharray="4 3" />
                {measurePx.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#9a7b3e" stroke="#fffdf8" strokeWidth="1.5" />
                ))}
              </g>
            ) : null}
          </svg>
        ) : null}

        {/* ÚP info markery (klik → dokument Územnoplánovacia informácia) */}
        {view ? (
          <div className="pointer-events-none absolute inset-0" style={{ transform: dragT }}>
            {upInfos.map((u) => {
              const p = project(u.lng, u.lat);
              if (p.x < -20 || p.x > size.w + 20 || p.y < -20 || p.y > size.h + 20) return null;
              return (
                <Link
                  key={u.id}
                  to="/upinfo/$id"
                  params={{ id: u.id }}
                  className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-cream text-[7px] font-bold text-cream"
                  style={{ left: p.x, top: p.y, background: "#5b7a58" }}
                  title={u.functional_area ?? "ÚP info"}
                >
                  ÚP
                </Link>
              );
            })}
          </div>
        ) : null}

        {/* Trhové inzeráty vo výreze — klikateľné piny (prehliadanie trhu) */}
        {marketBrowse && view ? (
          <div className="pointer-events-none absolute inset-0" style={{ transform: dragT }}>
            {browsePins.map((l, li) => {
              if (l.lat == null || l.lng == null) return null;
              const p = project(l.lng, l.lat);
              if (p.x < -20 || p.x > size.w + 20 || p.y < -20 || p.y > size.h + 20) return null;
              const opp = !!(l.flags && (l.flags.includes("below") || l.flags.includes("drop")));
              const active = pinSel === l;
              return (
                <button
                  key={li}
                  onClick={() => setPinSel(l)}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow"
                  style={{ left: p.x, top: p.y, width: active ? 15 : 11, height: active ? 15 : 11, background: opp ? "#5b7a58" : "#c9a45c" }}
                  title={l.title ?? "inzerát"}
                />
              );
            })}
          </div>
        ) : null}

        {/* Trh: popup detailu vybraného inzerátu */}
        {pinSel ? (
          <div className="absolute bottom-16 left-3 z-30 w-[300px] rounded-xl border border-line bg-surface/97 p-3 text-xs shadow backdrop-blur">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="font-semibold text-fg">{pinSel.title ?? "Inzerát"}</div>
              <button onClick={() => setPinSel(null)} className="shrink-0 text-muted hover:text-fg" title="Zavrieť">✕</button>
            </div>
            <div className="text-muted">
              {[pinSel.ptype, pinSel.deal, pinSel.obec ?? pinSel.okres].filter(Boolean).join(" · ")}
              {pinSel.area_m2 ? ` · ${pinSel.area_m2.toLocaleString("sk-SK")} m²` : ""}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-sm font-semibold text-fg">{pinSel.price_eur != null ? pinSel.price_eur.toLocaleString("sk-SK") + " €" : "—"}</span>
              <span className="tabular-nums text-muted">{pinSel.ppm2 != null ? Math.round(pinSel.ppm2).toLocaleString("sk-SK") + " €/m²" : ""}</span>
            </div>
            {pinSel.url ? <a href={pinSel.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-md border border-line px-2 py-1 text-fg hover:border-ink">Otvoriť inzerát ↗</a> : null}
          </div>
        ) : null}

        {/* Živý ESKN identify — panel len pre parcelu MIMO našich k.ú. (pri našej parcele sa ESKN+AVM zlúči do rich panela nižšie → vždy len jeden panel) */}
        {esknMode && (esknHit || esknBusy) && !identified ? (
          <div className="absolute right-14 top-16 bottom-14 z-30 w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-surface/97 p-3 text-xs shadow backdrop-blur max-md:inset-x-2 max-md:right-2 max-md:top-auto max-md:bottom-2 max-md:max-h-[58vh] max-md:w-auto">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold text-fg">Parcela — ESKN + naše dáta</span>
              <button onClick={() => setEsknHit(null)} className="text-muted hover:text-fg" title="Zavrieť">✕</button>
            </div>
            {esknBusy ? (
              <div className="py-2 text-muted">Načítavam z národného ESKN…</div>
            ) : esknHit ? (
              <div className="space-y-2">
                {/* ESKN autoritatívne */}
                {esknHit.found ? (
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">🇸🇰 ESKN (ÚGKK, naživo)</div>
                    <div className="text-sm font-medium text-fg">Parcela C č. {esknHit.parcel_no}</div>
                    <div className="text-muted">Výmera: <b className="text-fg">{esknHit.area_m2?.toLocaleString("sk-SK") ?? "—"} m²</b></div>
                    <div className="text-muted">Druh pozemku: {esknHit.druh_pozemku ?? "—"}</div>
                    <div className="text-muted">Umiestnenie: {esknHit.umiestnenie ?? "—"}</div>
                    <a href={`https://zbgis.skgeodesy.sk/mkzbgis/sk/kataster?pos=${esknHit.lat.toFixed(6)},${esknHit.lng.toFixed(6)},19`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded-md border border-line px-2 py-1 text-fg hover:border-ink">Otvoriť v ZBGIS ↗</a>
                  </div>
                ) : (
                  <div className="text-muted">{esknHit.message ?? "Na tomto mieste nie je parcela registra C v ESKN."}</div>
                )}

                {/* Naše vybudované dáta (naprieč všetkými k.ú.) */}
                {esknHit.ours ? (
                  <div className="space-y-0.5 rounded-lg border border-brand/40 bg-brand/5 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-brand">📋 Naše dáta — {esknHit.ours.ku_name ?? "?"}</div>
                    <div className="text-muted">Parcela <b className="text-fg">{esknHit.ours.parcel_no}</b>{esknHit.ours.kn_type ? ` · ${esknHit.ours.kn_type}` : ""} · {esknHit.ours.area_m2?.toLocaleString("sk-SK") ?? "—"} m²{esknHit.ours.use_type ? ` · ${esknHit.ours.use_type}` : ""}</div>
                    {esknHit.ours.lv_no != null ? <div className="text-muted">LV č. <b className="text-fg">{esknHit.ours.lv_no}</b>{esknHit.ours.co_owners != null ? ` · ${esknHit.ours.co_owners} spoluvlastníkov` : ""}</div> : null}
                    <div className="text-muted">Vysporiadanosť: {esknHit.ours.settled === 1 ? "vysporiadaná" : esknHit.ours.settled === 0 ? "nevysporiadaná" : "—"}{esknHit.ours.has_spf ? " · SPF/štát" : ""}</div>
                    {esknHit.ours.bpej ? <div className="text-muted">BPEJ {esknHit.ours.bpej}{esknHit.ours.bpej_skupina ? ` · skupina ${esknHit.ours.bpej_skupina}` : ""}</div> : null}
                    {esknHit.ours.score != null ? <div className="text-muted">Skóre príležitosti: <b className="text-fg">{esknHit.ours.score}</b></div> : null}
                    {esknHit.ours.lv_no != null ? (
                      <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: esknHit.ours.dataset_id, lvNo: String(esknHit.ours.lv_no) }} search={{ typ: "vypis" as const }} className="mt-1 inline-block rounded-md border border-ink bg-ink px-2 py-1 text-cream hover:opacity-90">Výpis z LV — všetky údaje ↗</Link>
                    ) : null}
                  </div>
                ) : esknHit.found ? (
                  <div className="text-[10px] text-muted">Túto parcelu zatiaľ nemáme v našich k.ú. — zobrazené len ESKN. Vlastníci/LV sú na oficiálnom portáli.</div>
                ) : null}

                {/* Územný plán — funkčná zóna (kde máme importovaný ÚP) */}
                {esknZone ? (
                  <div className="space-y-0.5 rounded-lg border border-line bg-surface-2/30 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">🗺️ Územný plán — funkčná zóna</div>
                    <div className="text-fg">{esknZone.name ?? "—"}{esknZone.code ? ` (${esknZone.code})` : ""}</div>
                    {esknZone.character ? <div className="text-muted">Charakter: {esknZone.character}</div> : null}
                    {esknZone.pripustne ? <div className="text-muted">Prípustné: {esknZone.pripustne}</div> : null}
                  </div>
                ) : null}

                {/* Zastavateľnosť / development potenciál — pre ĽUBOVOĽNÚ parcelu v SR (z ESKN druh+výmera, alebo importovaného ÚP) */}
                {(esknHit.area_m2 ?? esknHit.ours?.area_m2) ? (
                  <details className="rounded-lg border border-line bg-surface-2/30 p-2">
                    <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted">🏗️ Zastavateľnosť (development potenciál)</summary>
                    <div className="mt-2">
                      <label className="block text-[10px] text-muted">Funkčná zóna (zapni „🗺 ÚP kraj (SR)" a vyber podľa farby na mape):</label>
                      <select value={esknZonePick} onChange={(e) => setEsknZonePick(e.target.value)}
                        className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-brand">
                        <option value="">Auto (z druhu pozemku / importovaného ÚP)</option>
                        {REGULATIV.map((r) => (
                          <option key={`${r.municipality}:${r.code}`} value={`${r.municipality}:${r.code}`}>
                            {r.kategoria} — {r.name} ({r.code}{r.municipality !== "generic" ? " · " + r.municipality : ""})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 max-h-80 overflow-y-auto">
                      <DevelopmentPanel
                        areaM2={(esknHit.area_m2 ?? esknHit.ours?.area_m2) as number}
                        useType={esknHit.druh_pozemku ?? esknHit.ours?.use_type ?? null}
                        placement={esknHit.umiestnenie}
                        zone={(() => {
                          const pr = esknZonePick ? REGULATIV.find((r) => `${r.municipality}:${r.code}` === esknZonePick) : undefined;
                          return pr
                            ? { code: pr.code, name: pr.name, ipp: pr.ipp, izp: pr.izp, kz: pr.kz, character: pr.character, kategoria: pr.kategoria, pripustne: pr.pripustne, podmienecne: pr.podmienecne, nepripustne: pr.nepripustne } as ZoneLike
                            : esknZone;
                        })()}
                      />
                    </div>
                  </details>
                ) : null}

                {/* Limity výstavby — všetky úradné ArcGIS/WMS registre (geohazardy, les, voda, chránené…) */}
                {esknLimits ? (
                  <div className="rounded-lg border border-line bg-surface-2/30 p-2">
                    <LimitsPanel data={esknLimits} />
                  </div>
                ) : null}

                {/* Inžinierske siete — správcovia + vyjadrenie (podľa polohy parcely) */}
                <SietiPanel lat={esknHit.lat} lng={esknHit.lng} />

                {/* AVM — automatický odhad hodnoty */}
                {esknHit.avm && esknHit.avm.estimate_eur != null ? (
                  <div className="space-y-0.5 rounded-lg border border-brand/40 bg-brand/5 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">💶 AVM — odhad hodnoty</span>
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-muted">spoľahlivosť: {esknHit.avm.confidence}</span>
                    </div>
                    <div className="text-lg font-bold tabular-nums text-fg">{esknHit.avm.estimate_eur.toLocaleString("sk-SK")} €</div>
                    <div className="text-[11px] text-muted">rozpätie {esknHit.avm.low_eur?.toLocaleString("sk-SK")}–{esknHit.avm.high_eur?.toLocaleString("sk-SK")} € · {esknHit.avm.ppm2} €/m² · {esknHit.avm.klass}</div>
                    {esknHit.avm.factors.length ? <div className="text-[10px] text-muted">{esknHit.avm.factors.join(" · ")}</div> : null}
                    <div className="text-[10px] text-muted">Comparables: {esknHit.avm.comps} inzerátov v okolí. Orientačný odhad — nie znalecký posudok.</div>
                  </div>
                ) : null}

                {/* Trh v okolí — inzeráty */}
                {esknMarket.length > 0 ? (
                  <div className="space-y-0.5 rounded-lg border border-line bg-surface-2/30 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">🏷️ Trh v okolí (do 5 km)</div>
                    <div className="text-muted">{esknMarket.length} inzerátov v okolí (zapni „Trh vo výreze" pre piny).</div>
                  </div>
                ) : null}

                {esknHit.cached ? <div className="text-[10px] text-muted">(z cache)</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Overlay (netransformovaný): box výber + snap marker */}
        <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
          {box ? (
            <rect
              x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)}
              width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)}
              fill="#33333322" stroke="#6b6f86" strokeDasharray="4 3" strokeWidth="1.5"
            />
          ) : null}
          {tool === "measure" && snapPt ? (
            <g>
              <circle cx={snapPt.x} cy={snapPt.y} r="6" fill="none" stroke="#5b7a58" strokeWidth="1.5" />
              <circle cx={snapPt.x} cy={snapPt.y} r="1.5" fill="#5b7a58" />
            </g>
          ) : null}
        </svg>
      </div>

      {/* Swipe rozdeľovník (historický ↔ dnes) */}
      {swipe ? (
        <div
          className="absolute bottom-0 top-0 z-20 -ml-3 w-6 cursor-ew-resize"
          style={{ left: swipe.x }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { if (e.buttons) { const rect = wrapRef.current?.getBoundingClientRect(); if (rect) setSwipe((s) => (s ? { ...s, x: Math.max(0, Math.min(size.w, e.clientX - rect.left)) } : s)); } }}
        >
          <div className="mx-auto h-full w-0.5 bg-cream" />
          <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-xs text-fg shadow">↔</div>
          <div className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-[9px] text-cream">historický ↔ dnes</div>
        </div>
      ) : null}

      {/* Nástroje + Layer Catalog (vľavo hore) */}
      {/* Podkladové mapy — ZBGIS-style prepínač (vpravo dole) */}
      <div className="absolute bottom-3 right-3 z-20 flex gap-1 rounded-lg border border-line bg-surface/95 p-1 text-[11px] shadow backdrop-blur">
        {([["ortofoto", "Ortofoto"], ["zbgis", "ZBGIS"], ["dmr", "DMR"], ["none", "Bez"]] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setBaseMap(id)}
            className={"rounded px-2 py-1 " + (baseMap === id ? "bg-ink font-medium text-cream" : "text-muted hover:text-fg")}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Pravý vertikálny toolbar (ZBGIS štýl): zoom + poloha */}
      {view ? (
        <div className="absolute right-3 top-16 z-20 flex flex-col overflow-hidden rounded-lg border border-line bg-surface/95 shadow backdrop-blur">
          <button onClick={() => setView({ X: view.X, Y: view.Y, zoom: Math.min(ZMAX, view.zoom + 1) })} title="Priblížiť" className="h-8 w-8 border-b border-line text-lg leading-none text-fg hover:bg-surface-2">+</button>
          <button onClick={() => setView({ X: view.X, Y: view.Y, zoom: Math.max(ZMIN, view.zoom - 1) })} title="Oddialiť" className="h-8 w-8 border-b border-line text-lg leading-none text-fg hover:bg-surface-2">−</button>
          <button onClick={locateMe} title="Moja poloha (GPS)" className="h-8 w-8 text-sm leading-none text-fg hover:bg-surface-2">◎</button>
        </div>
      ) : null}

      <div className="absolute left-3 top-3 flex w-52 flex-col gap-2">
        <div className="flex overflow-hidden rounded-lg border border-line bg-surface/95 backdrop-blur">
          {([["pan", "arrow", "Pan"], ["select", "target", "Výber"], ["measure", "ruler", "Meranie"], ["upinfo", "zone", "ÚP"]] as const).map(([t, ic, lbl]) => (
            <button
              key={t}
              onClick={() => { setTool(t); if (t !== "measure") setSnapPt(null); }}
              className={"flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs " + (tool === t ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
            >
              <Icon name={ic} size={13} /> {lbl}
            </button>
          ))}
        </div>

        <button onClick={locateMe} title="Presunúť mapu na moju GPS polohu"
          className="flex items-center justify-center gap-1 rounded-lg border border-line bg-surface/95 px-2 py-1.5 text-xs text-muted backdrop-blur hover:text-fg">
          📍 Moja poloha
        </button>

        <button
          onClick={() => setMarketBrowse((v) => { const nv = !v; if (!nv) setPinSel(null); return nv; })}
          title="Zobraziť trhové inzeráty vo výreze mapy (klik na pin = detail)"
          className={"flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs backdrop-blur " + (marketBrowse ? "border-brand bg-brand/10 text-fg" : "border-line bg-surface/95 text-muted hover:text-fg")}>
          🏷️ Trh vo výreze{marketBrowse ? ` (${browsePins.length})` : ""}
        </button>

        <div className="flex gap-1.5">
          <button
            onClick={() => setColorMode((m) => (m === "bpej" ? "none" : "bpej"))}
            title="Zafarbiť parcely podľa skupiny kvality pôdy (BPEJ 1–9)"
            className={"flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs backdrop-blur " + (colorMode === "bpej" ? "border-brand bg-brand/10 text-fg" : "border-line bg-surface/95 text-muted hover:text-fg")}>
            🌿 Bonita
          </button>
          <button
            onClick={exportPng}
            title="Export vektorového pohľadu (parcely + popisy + výber) do PNG. Ortofoto podklad nie je súčasťou (CORS)."
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-surface/95 px-2 py-1.5 text-xs text-muted backdrop-blur hover:text-fg">
            📷 PNG
          </button>
        </div>

        <button
          onClick={() => { const nv = !esknBaseOn; setEsknBaseOn(nv); setEsknMode(nv); if (!nv) setEsknHit(null); pushEvent(nv ? "ESKN kataster zapnutý — default podklad + klik = identify." : "ESKN kataster vypnutý."); }}
          title="ESKN národný kataster (ÚGKK) ako podklad na celom SR + klik = live identify ľubovoľnej parcely"
          className={"flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs backdrop-blur " + (esknBaseOn ? "border-brand bg-brand/10 text-fg" : "border-line bg-surface/95 text-muted hover:text-fg")}>
          🇸🇰 ESKN kataster{esknBaseOn ? " · zapnutý" : ""}
        </button>

        <button
          onClick={() => { const nv = !upSrOn; setUpSrOn(nv); pushEvent(nv ? "Krajský ÚP (celá SR) zapnutý — dlaždice/WMS podľa výrezu." : "Krajský ÚP vypnutý."); }}
          title="Krajský územný plán (VÚC) — autoritatívny georeferencovaný overlay podľa výrezu. Pokryté: Žilinský (okres Čadca), Trnavský, Bratislavský, Banskobystrický. TSK/NSK/PSK/KSK pribudnú."
          className={"flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs backdrop-blur " + (upSrOn ? "border-brand bg-brand/10 text-fg" : "border-line bg-surface/95 text-muted hover:text-fg")}>
          🗺 ÚP kraj (SR){upSrOn ? " · zapnutý" : ""}
        </button>

        {colorMode === "bpej" ? (
          <div className="rounded-lg border border-line bg-surface/95 p-2 text-[10px] backdrop-blur">
            <div className="mb-1 font-medium text-fg">Bonita pôdy (skupina)</div>
            <div className="flex items-end gap-0.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                <div key={g} className="flex flex-1 flex-col items-center gap-0.5">
                  <span className="h-3 w-full rounded-sm" style={{ background: BPEJ_SKUPINA_COLORS[g] }} />
                  <span className="text-muted">{g}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-muted"><span>najkvalitnejšia</span><span>najmenej</span></div>
          </div>
        ) : null}

        {marks.length > 0 ? (
          <div className="rounded-lg border border-line bg-surface/95 p-2 text-xs backdrop-blur">
            <div className="mb-1 font-medium text-fg">★ Uložené ({marks.length})</div>
            <div className="flex flex-wrap gap-1">
              {marks.map((mk) => (
                <button key={mk.id} onClick={() => goToParcel(mk.id)} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-fg" title="Zobraziť parcelu">{mk.no}</button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-line bg-surface/95 p-2 text-xs backdrop-blur">
          <input
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder="Filter: nevysporiadané / orná / skupina 9 / nad 5000…"
            className="w-full rounded border border-line bg-paper px-2 py-1 text-xs text-fg outline-none focus:border-brand"
          />
          {filterSet ? <div className="mt-1 text-[10px] text-muted">🔎 zvýraznených <b className="text-fg">{filterSet.size}</b> parciel</div> : null}
        </div>

        {/* Režim mapy: celé k.ú. vs príležitosti */}
        {opportunities.length > 0 ? (
          <div className="flex overflow-hidden rounded-lg border border-line bg-surface/95 text-xs backdrop-blur">
            <button onClick={() => setMode("full")} className={"flex-1 px-2 py-1.5 " + (mode === "full" ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg")}>Celé k.ú.</button>
            <button onClick={() => setMode("opps")} className={"flex-1 px-2 py-1.5 " + (mode === "opps" ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg")}>Príležitosti ({opportunities.length})</button>
          </div>
        ) : null}

        {/* Layer Catalog */}
        <div className="rounded-lg border border-line bg-surface/95 backdrop-blur">
          <button onClick={() => setCatalogOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-fg">
            <span className="flex items-center gap-1.5"><Icon name="layers" size={13} /> Vrstvy</span>
            <span className="text-muted">{catalogOpen ? "▾" : "▸"}</span>
          </button>
          {catalogOpen ? (
            <div className="max-h-[46vh] space-y-3 overflow-y-auto border-t border-line px-3 py-2 text-xs">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Katastrálne vrstvy (VGI)</div>
                <div className="space-y-1.5">
                  <LayerRow label="Výber" checked disabled hint="navrchu" />
                  <LayerRow label="Parcelné čísla" checked={showLabels} onToggle={() => setShowLabels((v) => !v)} />
                  <LayerRow label="Miestne názvy" checked={showTexts} onToggle={() => setShowTexts((v) => !v)} />
                  {bpejZones.length > 0 ? <LayerRow label={`BPEJ / bonita (${bpejZones.length})`} checked={bpejOn} onToggle={() => setBpejOn((v) => !v)} hint="skupina 1 zelená → 9 červená" /> : null}
                  {upZones.length > 0 ? <LayerRow label={`ÚP zóny (${upZones.length})`} checked={upZonesOn} onToggle={() => setUpZonesOn((v) => !v)} hint="zelená=rozvoj · žltá=stabil. · červená=limit" /> : null}
                  <label className="mt-1 flex cursor-pointer items-center gap-1.5 px-1 text-[11px] text-muted hover:text-fg">
                    <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importUpZonesFile(f); e.currentTarget.value = ""; }} />
                    <span>{upImportBusy ? "Importujem ÚP…" : "⬆ Import ÚP zón (GeoJSON)"}</span>
                  </label>
                  {upImportMsg ? <div className="px-1 text-[10px] text-muted">{upImportMsg}</div> : null}
                  <div className="space-y-1.5">
                    <LayerRow label="C-KN parcely" checked={showCKN} onToggle={() => setShowCKN((v) => !v)} hint="register C · čierne" swatch="#1c1c1a" />
                    <LayerRow label="E-KN parcely" checked={showEKN} onToggle={() => setShowEKN((v) => !v)} hint="register E · zelené" swatch="#2f7d32" />
                    {showParcels ? <input type="range" min={0.2} max={1} step={0.1} value={parcelOpacity} onChange={(e) => setParcelOpacity(Number(e.target.value))} className="mt-0.5 w-full accent-brand" /> : null}
                  </div>
                </div>
              </div>
              {datasetId ? (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Územné plány / podklady (ÚP)</div>
                  {canEdit ? (
                    <label className="mb-1.5 block cursor-pointer rounded border border-dashed border-line px-2 py-1 text-center text-[11px] text-muted hover:text-fg">
                      {uploading ? "Nahrávam…" : "+ Nahrať raster (PNG/JPG)"}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleRasterUpload(f); e.currentTarget.value = ""; }} />
                    </label>
                  ) : null}
                  <div className="space-y-1.5">
                    {rasters.length === 0 ? (
                      <div className="text-[10px] text-muted">Žiadne podklady pre toto k.ú.</div>
                    ) : rasters.map((r) => (
                      <div key={r.id}>
                        <LayerRow
                          label={r.name}
                          checked={!!rasterOn[r.id]}
                          onToggle={() => setRasterOn((m) => ({ ...m, [r.id]: !m[r.id] }))}
                          hint={r.transform_json ? undefined : "negeoref."}
                        />
                        {rasterOn[r.id] && r.transform_json ? (
                          <input type="range" min={0.1} max={1} step={0.1} value={r.opacity}
                            onChange={(e) => { const op = Number(e.target.value); setRasters((rs) => rs.map((x) => x.id === r.id ? { ...x, opacity: op } : x)); void updateRaster({ data: { id: r.id, opacity: op, role } }); }}
                            className="mt-1 w-full accent-brand" />
                        ) : null}
                        {r.transform_json ? (
                          <button onClick={() => setSwipe(swipe?.id === r.id ? null : { id: r.id, x: Math.round(size.w / 2) })} className="mt-0.5 block text-[10px] text-fg underline hover:opacity-70">
                            {swipe?.id === r.id ? "Vypnúť swipe" : "Swipe (historický ↔ dnes)"}
                          </button>
                        ) : null}
                        {canEdit ? (
                          <div className="mt-0.5 flex gap-2 text-[10px]">
                            <button onClick={() => { setGeorefId(r.id); setGcps(r.points_json ? (JSON.parse(r.points_json) as GCP[]) : []); setPendingPx(null); setCatalogOpen(false); }} className="text-fg underline hover:opacity-70">
                              {r.transform_json ? "Upraviť georef" : "Georeferencovať"}
                            </button>
                            <button onClick={async () => { await deleteRaster({ data: { id: r.id, role } }); setRasterOn((m) => { const n = { ...m }; delete n[r.id]; return n; }); if (georefId === r.id) setGeorefId(null); await reloadRasters(); }} style={{ color: "#9c4a40" }} className="underline hover:opacity-70">
                              Zmazať
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <a href="https://mapy.tuzvo.sk/hofm/" target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[10px] text-green underline hover:opacity-70">Historická ortofoto SR (TU Zvolen) ↗</a>
                  <div className="mt-0.5 text-[9px] leading-snug text-muted">Licencovaný podklad — otvor v ich prehliadači, alebo nahraj vlastný historický raster, georeferencuj a použi Swipe.</div>
                </div>
              ) : null}
              {datasetId ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Územný plán — dokumenty</span>
                    {upChanges.length > 0 ? <span className="rounded px-1 text-[9px] font-medium" style={{ background: "#c9a45c33", color: "#8a6d2f" }}>{upChanges.length} zmien</span> : null}
                  </div>
                  {upDocs.length === 0 ? (
                    <div className="text-[10px] text-muted">Žiadne ÚP dokumenty.{canEdit ? " Načítaj z číselníka alebo URL nižšie." : ""}</div>
                  ) : (
                    <div className="max-h-40 space-y-0.5 overflow-y-auto">
                      {upDocs.map((d) => (
                        <a key={d.id} href={d.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-start gap-1 text-[11px] text-fg hover:underline">
                          <span className="text-[10px] text-muted">{d.kind === "vykres" ? "🗺" : d.kind === "text" ? "📄" : "•"}</span>
                          <span className="min-w-0 flex-1 truncate">{d.title ?? "dokument"}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {upChanges.length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-muted">História zmien ÚP ({upChanges.length})</summary>
                      <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                        {upChanges.map((c) => (
                          <div key={c.id} className="flex items-center gap-1 text-[10px]">
                            <span className="rounded px-1 text-[9px]" style={{ background: c.change === "removed" ? "#9c4a4022" : c.change === "changed" ? "#c9a45c22" : "#5b7a5822", color: c.change === "removed" ? "#9c4a40" : c.change === "changed" ? "#8a6d2f" : "#3f5a3c" }}>{c.change === "new" ? "nový" : c.change === "changed" ? "zmena" : "odstr."}</span>
                            <span className="min-w-0 flex-1 truncate text-muted">{c.title ?? ""}</span>
                            <span className="text-[9px] text-muted/70">{(c.detected_at ?? "").slice(0, 10)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {canEdit ? (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex gap-1">
                        <button onClick={() => void doImportUpDocs(true)} disabled={upDocBusy}
                          className="flex-1 rounded border border-line px-2 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 disabled:opacity-50">
                          {upDocBusy ? "…" : "↻ Auto z číselníka"}
                        </button>
                        <button onClick={() => void syncUpRegistry()} disabled={upDocBusy} title="Stiahnuť číselník obcí z denného Mac monitora"
                          className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-surface-2 disabled:opacity-50">
                          ⇩ číselník (Mac)
                        </button>
                      </div>
                      <input value={upDocUrl} onChange={(e) => setUpDocUrl(e.target.value)} placeholder="alebo URL stránky obce s ÚP…"
                        className="w-full rounded border border-line bg-surface px-2 py-1 text-[11px] text-fg outline-none focus:border-green" />
                      <button onClick={() => void doImportUpDocs(false)} disabled={upDocBusy || !upDocUrl.trim()}
                        className="w-full rounded border border-line px-2 py-1 text-[11px] text-fg hover:bg-surface-2 disabled:opacity-50">
                        ⬇ Načítať z URL (uloží do číselníka)
                      </button>
                      {upDocMsg ? <div className="text-[10px] text-muted">{upDocMsg}</div> : null}
                    </div>
                  ) : null}
                  {/* Regulatívy per zóna (číselník → identify + development kalkulačka; kód „*" = default obce) */}
                  <div className="mt-2 border-t border-line/50 pt-1.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Regulatívy zón</div>
                    {upReg.length === 0 ? (
                      <div className="text-[10px] text-muted">Žiadne.{canEdit ? " Pridaj nižšie (kód * = default obce)." : ""}</div>
                    ) : (
                      <div className="space-y-0.5">
                        {upReg.map((r) => (
                          <div key={r.id} className="flex items-center gap-1 text-[10px]">
                            <span className="rounded bg-surface-2 px-1 font-medium text-fg">{r.zone_code}</span>
                            <span className="min-w-0 flex-1 truncate text-muted">{r.funkcia ?? ""}{r.izp != null ? ` · IZP ${r.izp}` : ""}{r.kz != null ? ` · KZ ${r.kz}` : ""}{r.ipp != null ? ` · IPP ${r.ipp}` : ""}{r.max_vyska != null ? ` · ${r.max_vyska} m` : ""}</span>
                            {canEdit ? <button onClick={() => void delReg(r.id)} style={{ color: "#9c4a40" }} className="text-[10px] hover:opacity-70">✕</button> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {canEdit ? (
                      <div className="mt-1 grid grid-cols-4 gap-1">
                        <input value={regForm.zone} onChange={(e) => setRegForm({ ...regForm, zone: e.target.value })} placeholder="kód / *" className="col-span-1 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-fg outline-none focus:border-green" />
                        <input value={regForm.funkcia} onChange={(e) => setRegForm({ ...regForm, funkcia: e.target.value })} placeholder="funkcia (napr. IBV)" className="col-span-3 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-fg outline-none focus:border-green" />
                        <input value={regForm.izp} onChange={(e) => setRegForm({ ...regForm, izp: e.target.value })} placeholder="IZP" className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-fg outline-none focus:border-green" />
                        <input value={regForm.kz} onChange={(e) => setRegForm({ ...regForm, kz: e.target.value })} placeholder="KZ" className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-fg outline-none focus:border-green" />
                        <input value={regForm.ipp} onChange={(e) => setRegForm({ ...regForm, ipp: e.target.value })} placeholder="IPP" className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-fg outline-none focus:border-green" />
                        <input value={regForm.vyska} onChange={(e) => setRegForm({ ...regForm, vyska: e.target.value })} placeholder="výška m" className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-fg outline-none focus:border-green" />
                        <button onClick={() => void saveReg()} disabled={regBusy || !regForm.zone.trim()} className="col-span-4 rounded border border-line px-2 py-0.5 text-[10px] font-medium text-fg hover:bg-surface-2 disabled:opacity-50">＋ Uložiť regulatív</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Úradné vrstvy — ESKN + limity</div>
                <div className="space-y-1.5">
                  {LIMIT_LAYERS.map((l) => (
                    <div key={l.id}>
                      <LayerRow label={l.name} checked={!!limOn[l.id]} hint={l.attribution}
                        onToggle={() => { setLimOn((s) => ({ ...s, [l.id]: !s[l.id] })); pushEvent(`Limitná vrstva „${l.name}" ${!limOn[l.id] ? "zapnutá" : "vypnutá"}.`); }} />
                      {limOn[l.id] ? <input type="range" min={0.2} max={1} step={0.1} value={limOp[l.id] ?? 0.6} onChange={(e) => setLimOp((s) => ({ ...s, [l.id]: Number(e.target.value) }))} className="mt-1 w-full accent-brand" /> : null}
                    </div>
                  ))}
                  <div className="text-[9px] leading-snug text-muted">Zdroj: ŠGÚDŠ (geohazardy), NLC (lesy/vodné toky). Orientačné — over na úrade.</div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Podklady &amp; WMS</div>
                <div className="space-y-2">
                  {allWms.filter((w) => !["ortofoto", "zbgis", "dmr"].includes(w.id)).map((w) => (
                    <div key={w.id}>
                      <LayerRow
                        label={w.name}
                        checked={!!wmsOn[w.id]}
                        onToggle={() => { setWmsOn((s) => ({ ...s, [w.id]: !s[w.id] })); pushEvent(`WMS „${w.name}" ${!wmsOn[w.id] ? "zapnutá" : "vypnutá"}.`); }}
                        hint={w.reliable ? undefined : "best-effort"}
                      />
                      {wmsOn[w.id] ? <input type="range" min={0.2} max={1} step={0.1} value={wmsOp[w.id] ?? 1} onChange={(e) => setWmsOp((s) => ({ ...s, [w.id]: Number(e.target.value) }))} className="mt-1 w-full accent-brand" /> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-muted">WMS pridáš formulárom pod mapou. Nedostupná vrstva sa zobrazí prázdno.</div>
              </div>
              <div className="text-[10px] text-muted">Poradie: WMS → parcely → názvy → výber (navrchu).</div>
            </div>
          ) : null}
        </div>

        {tool === "measure" ? (
          <div className="rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-xs text-fg backdrop-blur">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={snap} onChange={() => setSnap((v) => !v)} className="accent-brand" /> Snapping na vrcholy
            </label>
            <div className="mt-1 text-muted">
              {measure.length < 2 ? "Klikaj body…" : `Dĺžka: ${measureTotal.toFixed(1)} m`}
              {measure.length > 0 ? <button onClick={() => setMeasure([])} className="ml-2 underline hover:text-fg">reset</button> : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Georeferencovanie ÚP rastra (kontrolné body) */}
      {georefId && georefRaster && rasterData[georefId] && georefRaster.width && georefRaster.height ? (
        <div className="absolute right-3 top-16 z-30 w-[320px] rounded-xl border border-line bg-surface/97 p-3 text-xs backdrop-blur">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-fg">Georeferencovanie</span>
            <button onClick={() => { setGeorefId(null); setPendingPx(null); }} className="text-muted hover:text-fg">✕</button>
          </div>
          <div className="mb-2 truncate text-[11px] text-muted" title={georefRaster.name}>{georefRaster.name}</div>
          <div className="relative overflow-hidden rounded border border-line" style={{ lineHeight: 0 }}>
            <img
              src={rasterData[georefId]}
              alt={georefRaster.name}
              draggable={false}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const px = ((e.clientX - rect.left) / rect.width) * georefRaster.width!;
                const py = ((e.clientY - rect.top) / rect.height) * georefRaster.height!;
                setPendingPx({ px, py });
                pushEvent(`Raster bod zvolený — teraz klikni na mapu na to isté miesto.`);
              }}
              className="w-full cursor-crosshair select-none"
              style={{ display: "block" }}
            />
            {/* značky umiestnených bodov */}
            {gcps.map((g, i) => (
              <span key={i} className="pointer-events-none absolute -ml-1.5 -mt-1.5 flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold text-cream"
                style={{ left: `${(g.px / georefRaster.width!) * 100}%`, top: `${(g.py / georefRaster.height!) * 100}%`, background: "#5b7a58" }}>{i + 1}</span>
            ))}
            {pendingPx ? (
              <span className="pointer-events-none absolute -ml-1.5 -mt-1.5 h-3 w-3 animate-pulse rounded-full border-2 border-cream"
                style={{ left: `${(pendingPx.px / georefRaster.width!) * 100}%`, top: `${(pendingPx.py / georefRaster.height!) * 100}%`, background: "#9a7b3e" }} />
            ) : null}
          </div>
          <div className="mt-2 rounded-md px-2 py-1.5 text-[11px]" style={{ background: pendingPx ? "#9a7b3e22" : "#5b7a5822", color: "#4a4a4a" }}>
            {pendingPx
              ? "② Klikni na MAPU na zodpovedajúce miesto."
              : gcps.length < 3
                ? `① Klikni bod na rastri (potrebné ešte ${3 - gcps.length}).`
                : "① Klikni ďalší bod na rastri, alebo ulož."}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted">{gcps.length} kontrolných bodov</span>
            <div className="flex gap-2">
              {gcps.length > 0 ? <button onClick={() => { setGcps((g) => g.slice(0, -1)); setPendingPx(null); }} className="text-muted underline hover:text-fg">späť</button> : null}
              <button onClick={() => void saveGeorefNow()} disabled={gcps.length < 3}
                className="rounded bg-ink px-3 py-1 font-medium text-cream disabled:opacity-40">Uložiť</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Územnoplánovacia informácia — formulár po kliku nástrojom ÚP */}
      {upForm ? (
        <div className="absolute left-1/2 top-16 z-30 w-[320px] -translate-x-1/2 rounded-xl border border-line bg-surface/97 p-3 text-xs backdrop-blur">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-fg">ÚP info — nový bod</span>
            <button onClick={() => setUpForm(null)} className="text-muted hover:text-fg">✕</button>
          </div>
          <div className="mb-2 text-[11px] text-muted">
            Parcela: <b className="text-fg">{upForm.parcel_no ?? "—"}</b> · {upForm.lat.toFixed(5)}, {upForm.lng.toFixed(5)}
          </div>
          <input value={upForm.fa} onChange={(e) => setUpForm({ ...upForm, fa: e.target.value })} placeholder="Funkčná plocha (napr. B — bývanie, IBV)"
            className="mb-1.5 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-fg outline-none focus:border-ink" />
          <input value={upForm.reg} onChange={(e) => setUpForm({ ...upForm, reg: e.target.value })} placeholder="Regulatív (zastavanosť, podlažnosť…)"
            className="mb-1.5 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-fg outline-none focus:border-ink" />
          <textarea value={upForm.note} onChange={(e) => setUpForm({ ...upForm, note: e.target.value })} placeholder="Poznámka" rows={2}
            className="mb-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-fg outline-none focus:border-ink" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setUpForm(null)} className="text-muted underline hover:text-fg">zrušiť</button>
            <button onClick={() => void saveUpInfo()} className="rounded bg-ink px-3 py-1 font-medium text-cream">Uložiť</button>
          </div>
          <div className="mt-2 text-[10px] text-muted">Bez právneho výkladu — pracovný záznam k funkčnej ploche z ÚP.</div>
        </div>
      ) : null}

      {/* ÚP info nástroj — pomôcka */}
      {tool === "upinfo" && !upForm ? (
        <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-[11px] text-muted backdrop-blur">
          Klikni do zóny na (georeferencovanom) ÚP rastri — otvorí sa formulár.
        </div>
      ) : null}

      {/* Zoom / fit (vpravo hore) */}
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-line bg-surface/95 backdrop-blur">
        <button onClick={() => zoomBy(1)} className="px-2.5 py-1.5 text-fg hover:bg-surface-2">＋</button>
        <button onClick={() => zoomBy(-1)} className="border-t border-line px-2.5 py-1.5 text-fg hover:bg-surface-2">－</button>
        <button onClick={fitAll} title="Priblíž na všetko" className="border-t border-line px-2.5 py-1.5 text-fg hover:bg-surface-2">⤢</button>
        {selection.length > 0 ? (
          <button onClick={zoomToSelection} title="Priblíž na výber" className="border-t border-line px-2.5 py-1.5 text-brand hover:bg-surface-2">◎</button>
        ) : null}
      </div>

      {/* Legenda — zbaliteľná (default zbalená), aby nekolidovala s panelom Vrstvy */}
      <div className="absolute bottom-11 left-3 max-w-[230px] rounded-lg border border-line bg-surface/95 text-[11px] backdrop-blur">
        <button onClick={() => setLegendOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 font-medium text-fg">
          <span className="flex items-center gap-1.5"><Icon name="layers" size={12} /> Legenda</span>
          <span className="text-muted">{legendOpen ? "▾" : "▸"}</span>
        </button>
        {legendOpen ? (
          <div className="flex flex-col gap-1 border-t border-line px-3 py-2">
            <div className="mb-0.5 font-medium text-fg">Register parciel</div>
            <div className="flex items-center gap-1.5 text-muted"><span className="h-2 w-3 rounded-sm" style={{ background: "#1c1c1a" }} /> C-KN (register C)</div>
            <div className="flex items-center gap-1.5 text-muted"><span className="h-2 w-3 rounded-sm" style={{ background: "#2f7d32" }} /> E-KN (register E)</div>
            <div className="mt-1.5 mb-0.5 font-medium text-fg">Kvalita geometrie</div>
            {(Object.keys(QUALITY_META) as (keyof typeof QUALITY_META)[]).map((k) => (
              <div key={k} className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-3 rounded-sm" style={{ background: QUALITY_META[k].color + "55", border: `1px solid ${QUALITY_META[k].color}` }} />
                {QUALITY_META[k].label}
              </div>
            ))}
            {enabledWms.map((w) => (
              <div key={w.id} className="mt-1 max-w-[200px] text-[10px] text-muted">{w.attribution ?? w.name}</div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Selection panel alebo Identify panel (vpravo dole) */}
      {selection.length > 1 ? (
        <div className="absolute bottom-11 right-3 w-72 rounded-xl border border-line bg-surface/95 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-fg">Výber · {selection.length} parciel</div>
            <button onClick={clearSel} className="text-xs text-muted underline hover:text-fg">vyčistiť</button>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted">Súhrnná výmera</span>
            <span className="tabular-nums text-fg">{m2(totalArea)}</span>
          </div>
          <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs">
            {selectedParcels.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-fg">č. {p.parcel_no}</span>
                <span className="flex items-center gap-2 text-muted">
                  <span className="tabular-nums">{m2(p.area_m2)}</span>
                  <button onClick={() => toggleSel(p.id)} className="hover:text-fg">✕</button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button onClick={zoomToSelection} className="flex-1 rounded-md border border-line px-2 py-1.5 text-xs text-fg hover:bg-surface-2">Zoom</button>
            <button onClick={exportSelectionCsv} className="flex-1 rounded-md bg-ink px-2 py-1.5 text-xs font-medium text-cream hover:opacity-90">Súpis (CSV)</button>
          </div>
          <a href="/reporty" className="mt-1.5 block text-center text-[10px] text-muted underline hover:text-fg">Report Center (evidenčný list, pack) →</a>
        </div>
      ) : identified ? (
        <div className="absolute right-14 top-16 bottom-14 z-30 w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-surface/95 p-4 backdrop-blur max-md:inset-x-2 max-md:right-2 max-md:top-auto max-md:bottom-2 max-md:max-h-[58vh] max-md:w-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted">Parcela {identified.kn_type}</div>
              <div className="text-lg font-semibold tabular-nums text-fg">č. {identified.parcel_no}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleMark(identified)} title="Uložiť parcelu do záložiek" className="text-base leading-none text-fg hover:opacity-70">
                {marks.some((m) => m.id === identified.id) ? "★" : "☆"}
              </button>
              <button
                onClick={() => { if (typeof navigator !== "undefined" && navigator.clipboard) void navigator.clipboard.writeText(`${location.origin}/mapa?ds=${datasetId ?? ""}&p=${encodeURIComponent(identified.id)}`); }}
                title="Kopírovať zdieľateľný odkaz na parcelu" className="text-sm leading-none text-muted hover:text-fg">🔗</button>
              <button onClick={() => setIdentified(null)} className="text-muted hover:text-fg">✕</button>
            </div>
          </div>
          <button onClick={() => findNeighbors(identified)} title="Zvýrazniť susedné parcely (sceľovanie)"
            className="mt-2 w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg hover:border-ink">
            🔗 Susedné parcely{neighborSet ? ` (${neighborSet.size})` : ""}
          </button>

          {/* ESKN (ÚGKK naživo) + AVM — zjednotené do jedného panela pre našu parcelu */}
          {esknHit && (esknHit.found || (esknHit.avm && esknHit.avm.estimate_eur != null)) ? (
            <div className="mt-2 space-y-1 rounded-md border border-brand/40 bg-brand/5 p-2 text-xs">
              {esknHit.found ? (
                <div className="text-muted">🇸🇰 ESKN: parc. {esknHit.parcel_no} · {esknHit.area_m2 ?? "?"} m²{esknHit.druh_pozemku ? ` · ${esknHit.druh_pozemku}` : ""}{esknHit.umiestnenie ? ` · ${esknHit.umiestnenie}` : ""}</div>
              ) : null}
              {esknHit.avm && esknHit.avm.estimate_eur != null ? (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">💶 AVM</span>{" "}
                  <b className="text-fg">{esknHit.avm.estimate_eur.toLocaleString("sk-SK")} €</b>
                  <span className="text-muted"> · {esknHit.avm.low_eur?.toLocaleString("sk-SK")}–{esknHit.avm.high_eur?.toLocaleString("sk-SK")} € · {esknHit.avm.ppm2} €/m² · {esknHit.avm.klass} · {esknHit.avm.confidence}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <dl className="mt-3 space-y-1.5 text-sm">
            <Row k="Výmera" v={m2(identified.area_m2)} />
            <Row k="Druh" v={identified.use_type ?? "—"} />
            <Row k="LV" v={identified.lv_no != null ? String(identified.lv_no) : "—"} />
            {identified.celok != null ? (
              <Row k="Evidenčný list" v={
                <span>
                  {datasetId ? (
                    <Link to="/el/$datasetId/$celok" params={{ datasetId, celok: String(identified.celok) }} className="text-green hover:underline">
                      celok {identified.celok} (užívateľ) →
                    </Link>
                  ) : <span>celok {identified.celok}</span>}
                  <LegalRef id="evidencny_list" />
                </span>
              } />
            ) : null}
            {identified.settled != null ? (
              <Row k="Vysporiadanosť" v={
                <span>
                  {identified.settled === 1
                    ? <span style={{ color: "#5b7a58" }}>vysporiadaná (C-KN)</span>
                    : <span style={{ color: "#9a7b3e" }}>nevysporiadaná{identified.ekn_ref ? ` — E-KN ${identified.ekn_ref}` : ""}</span>}
                  <LegalRef id={identified.settled === 1 ? "register_c" : "register_e"} />
                </span>
              } />
            ) : null}
            {identified.bpej ? (
              <Row k="BPEJ" v={
                <span className="flex items-center gap-1.5">
                  {identified.bpej_skupina ? <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: bpejSkupinaColor(identified.bpej_skupina, identified.bpej) }} /> : null}
                  <span className="font-mono">{identified.bpej}</span>
                  {identified.bpej_skupina ? <span className="text-muted">· skupina {identified.bpej_skupina}/9</span> : null}
                  <LegalRef id="bpej" />
                </span>
              } />
            ) : null}
            {(() => {
              const s = identified.bpej_skupina ?? null;
              const rate = identified.odnatie_eur ?? (s ? BPEJ_SADZBA_TRVALE[s] : null);
              if (rate == null) return null;
              const eur = (n: number) => n.toLocaleString("sk-SK", { maximumFractionDigits: n < 100 ? 2 : 0 });
              const trv = identified.area_m2 * rate;
              const doc = identified.area_m2 * (rate / 100);
              return (
                <>
                  <Row k="Odňatie – trvalé" v={<span title={`${rate} €/m² × ${m2(identified.area_m2)}`}>{eur(trv)} €<LegalRef id="odvody" /></span>} />
                  <Row k="Odňatie – dočasné" v={<span className="text-muted">{eur(doc)} € / rok</span>} />
                </>
              );
            })()}
            <Row k="Geometria" v={<span style={{ color: QUALITY_META[identified.geometry_quality].color }}>{QUALITY_META[identified.geometry_quality].label}</span>} />
          </dl>
          <div className="mt-3 border-t border-line pt-2 text-xs">
            <div className="mb-1 font-medium text-fg">LV a vlastníci</div>
            {identified.lv_no == null ? (
              <div className="text-muted"><span style={{ color: "#6b6f86" }}>needs_review</span> — parcela nie je napojená na LV.</div>
            ) : idOwners == null ? (
              <div className="text-muted">Načítavam LV {identified.lv_no}…</div>
            ) : idOwners.access === "full" ? (
              <div>
                <div className="mb-1 text-muted">LV {identified.lv_no} · {idOwners.count} vlastníkov</div>
                <ul className="space-y-0.5">
                  {idOwners.owners.slice(0, 6).map((o) => (
                    <li key={o.id} className="flex justify-between gap-2">
                      <span className="text-fg">{o.name}</span>
                      <span className="tabular-nums text-muted">{o.share || "—"}</span>
                    </li>
                  ))}
                  {idOwners.owners.length > 6 ? <li className="text-muted">+{idOwners.owners.length - 6} ďalších</li> : null}
                </ul>
              </div>
            ) : idOwners.access === "summary" ? (
              <div className="text-muted">LV {identified.lv_no} · <b className="text-fg">{idOwners.count}</b> vlastníkov (summary — rola nevidí mená).</div>
            ) : (
              <div className="text-muted">LV {identified.lv_no} · {idOwners.count} vlastníkov — <span style={{ color: "#9a7b3e" }}>chránené</span> (rola).</div>
            )}
          </div>
          {/* Inzeráty v okolí (trhové ceny) — skladacie */}
          {nearListings.length ? (
            <details className="mt-3 rounded-md border border-line bg-surface-2/30 p-2 text-xs">
              <summary className="cursor-pointer font-semibold text-fg">🏷️ Inzeráty v okolí ({nearListings.length})</summary>
              <div className="mt-1 max-h-52 space-y-0.5 overflow-y-auto">
                {nearListings.slice(0, 30).map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-line/40 py-0.5">
                    <a href={l.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 truncate text-fg hover:underline">{l.title ?? "inzerát"}</a>
                    <span className="whitespace-nowrap text-muted">{l.price_eur ? Math.round(l.price_eur / 1000) + " tis." : "—"}{l.ppm2 ? ` · ${Math.round(l.ppm2)} €/m²` : ""}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-muted">Poloha ~stred obce (bazos). Zelené piny na mape = pod trhom / zníženie.</div>
            </details>
          ) : null}

          {/* Development potenciál — ÚP rekapitulácia + kalkulačka + skóre */}
          <div className="mt-3">
            <button onClick={() => setShowDev((v) => !v)} className="w-full rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2">
              {showDev ? "▴ Skryť development potenciál" : "▾ Development potenciál (ÚP · HPP · byty · GDV)"}
            </button>
            {showDev ? (
              <div className="mt-2 max-h-96 overflow-y-auto">
                <DevelopmentPanel
                  areaM2={identified.area_m2}
                  useType={identified.use_type}
                  placement={fullLv?.parcelsC.find((p) => p.parcel_no === identified?.parcel_no)?.placement ?? null}
                  zone={effZone}
                  opts={medians?.byt ? { ...DEV_DEFAULTS, predajEurM2: medians.byt } : DEV_DEFAULTS}
                />
              </div>
            ) : null}
          </div>

          {/* Dostupnosť (OSM) — doprava + občianska vybavenosť */}
          {identified.centroid_lat != null && identified.centroid_lng != null ? (
            <div className="mt-3">
              {!access ? (
                <button
                  onClick={() => { if (identified.centroid_lat == null || identified.centroid_lng == null) return; setAccessBusy(true); getParcelAccessibility({ data: { lat: identified.centroid_lat, lng: identified.centroid_lng } }).then((r) => setAccess(r)).catch(() => {}).finally(() => setAccessBusy(false)); }}
                  disabled={accessBusy}
                  className="w-full rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
                >
                  {accessBusy ? "Zisťujem dostupnosť (OSM)…" : "▾ Dostupnosť (doprava · škola · obchod · diaľnica)"}
                </button>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <AccessibilityPanel data={access} />
                </div>
              )}
            </div>
          ) : null}

          {/* Limity výstavby — úradné registre (ŠGÚDŠ geohazardy, NLC lesy/vodné toky) — skladacie */}
          {identified.centroid_lat != null && identified.centroid_lng != null && limits ? (
            <details open className="mt-3 rounded-md border border-line bg-surface-2/20 p-2">
              <summary className="cursor-pointer text-sm font-semibold text-fg">Limity výstavby{limits.items.filter((i) => i.hit).length ? ` · ${limits.items.filter((i) => i.hit).length} zásah` : " · bez zásahu"}</summary>
              <div className="mt-1"><LimitsPanel data={limits} /></div>
            </details>
          ) : null}

          {/* Inžinierske siete — správcovia + vyjadrenie (podľa polohy parcely) */}
          {identified.centroid_lat != null && identified.centroid_lng != null ? (
            <div className="mt-3"><SietiPanel lat={identified.centroid_lat} lng={identified.centroid_lng} /></div>
          ) : null}

          {/* PDF dossier parcely — jedno-klik podklad na klienta/kolegu */}
          {identified.parcel_no && datasetId ? (
            <Link to="/report/$datasetId/$parcelNo" params={{ datasetId, parcelNo: identified.parcel_no }}
              className="mt-3 flex items-center justify-center gap-1 rounded-md border border-ink bg-ink px-3 py-2 text-sm font-medium text-cream hover:opacity-90">
              📄 PDF dossier parcely →
            </Link>
          ) : null}

          {/* Rozbaliteľné celé LV — majetková podstata (C+E), stavby, vlastníci, hodnota */}
          {identified.lv_no != null ? (
            <div className="mt-3">
              {!fullLv ? (
                <button
                  onClick={() => { if (!datasetId || identified.lv_no == null) return; setFullBusy(true); getLvVypis({ data: { datasetId, lvNo: identified.lv_no, role } }).then((r) => setFullLv(r)).catch(() => {}).finally(() => setFullBusy(false)); }}
                  disabled={fullBusy}
                  className="w-full rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
                >
                  {fullBusy ? "Načítavam celé LV…" : "▾ Zobraziť celé LV (parcely C+E, stavby, vlastníci, hodnota)"}
                </button>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-line bg-surface-2/30 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-fg">Úplné LV č. {identified.lv_no}</div>
                    <button onClick={() => setFullLv(null)} className="text-muted hover:text-fg">skryť ▴</button>
                  </div>

                  <FullLvBlock title={`Parcely registra „C" (${fullLv.parcelsC.length})`}>
                    {fullLv.parcelsC.map((p, i) => (
                      <div key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
                        <span className="font-mono text-fg">{p.parcel_no}</span>
                        <span className="text-muted">{m2(p.area_m2)} · {p.drp_text ?? "—"}{p.skupina != null ? ` · BPEJ ${p.skupina}/9` : ""}{p.odnatie_trvale != null ? ` · odňatie ${eurShort(p.odnatie_trvale)} €` : ""}</span>
                      </div>
                    ))}
                  </FullLvBlock>

                  {fullLv.parcelsE.length ? (
                    <FullLvBlock title={`Parcely registra „E" (${fullLv.parcelsE.length})`}>
                      {fullLv.parcelsE.map((p, i) => (
                        <div key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
                          <span className="font-mono text-fg">{p.parcel_no}</span>
                          <span className="text-muted">{m2(p.area_m2)} · {p.drp_text ?? "—"}</span>
                        </div>
                      ))}
                    </FullLvBlock>
                  ) : null}

                  {fullLv.buildings.length ? (
                    <FullLvBlock title={`Stavby (${fullLv.buildings.length})`}>
                      {fullLv.buildings.map((b, i) => <div key={i} className="text-muted">{b.descr}{b.on_parcel ? ` · na parcele ${b.on_parcel}` : ""}</div>)}
                    </FullLvBlock>
                  ) : null}

                  {fullLv.evidencne.length ? (
                    <FullLvBlock title="Evidenčný list / užívateľ">
                      {fullLv.evidencne.map((e, i) => (
                        <div key={i} className="text-muted">celok {e.celok} · {fullLv.access === "full" ? (e.uzivatel ?? "—") : "(chránené)"}</div>
                      ))}
                    </FullLvBlock>
                  ) : null}

                  <FullLvBlock title={`Vlastníci (${fullLv.count})`}>
                    {fullLv.access === "full" ? (
                      fullLv.owners.map((o, i) => {
                        const mm = (o.share || "").match(/(\d+)\s*\/\s*(\d+)/);
                        const fr = mm ? Number(mm[1]) / Number(mm[2]) : 0;
                        const addr = [o.addr_obec && o.addr_obec !== "č." ? o.addr_obec : "", o.addr_cislo ? `č. ${o.addr_cislo}` : "", o.addr_psc ?? ""].filter(Boolean).join(", ");
                        const sub = [o.birth_date ? `nar. ${o.birth_date}` : "", addr, o.ico ? `IČO ${o.ico}` : ""].filter(Boolean).join(" · ");
                        return (
                          <div key={i} className="border-b border-line/40 py-0.5">
                            <div className="flex justify-between gap-2">
                              <span className="text-fg">{o.title ? `${o.title} ` : ""}{o.name}{o.born_name && !o.name.startsWith(o.born_name) ? ` (rod. ${o.born_name})` : ""}</span>
                              <span className="whitespace-nowrap text-muted">{o.share || "—"}{fr ? ` · ${m2(Math.round(fullLv.totalAreaC * fr))}` : ""}</span>
                            </div>
                            {sub ? <div className="text-[10px] text-muted">{sub}</div> : null}
                          </div>
                        );
                      })
                    ) : <div className="text-muted">{fullLv.count} vlastníkov — mená rola nevidí.</div>}
                  </FullLvBlock>

                  {fullLv.access === "full" && fullLv.tarchy.length ? (
                    <FullLvBlock title={`Ťarchy (${fullLv.tarchy.length})`}>
                      {fullLv.tarchy.map((t, i) => <div key={i} className="text-muted">{t}</div>)}
                    </FullLvBlock>
                  ) : null}

                  {/* Odhad hodnoty */}
                  {(() => {
                    const mv = fullLv.parcelsC.reduce((a, p) => a + marketValueEur(p.drp_text, p.placement, p.area_m2).total, 0);
                    return (
                      <div className="rounded border border-line bg-paper/40 p-2">
                        <div className="mb-1 font-medium text-fg">Odhad hodnoty (orientačný)</div>
                        <div className="flex justify-between"><span className="text-muted">Celková výmera C</span><span className="text-fg">{m2(fullLv.totalAreaC)}</span></div>
                        {fullLv.odnatie.count > 0 ? <div className="flex justify-between"><span className="text-muted">Odňatie pôdy (trvalé)</span><span className="text-fg">{eurShort(fullLv.odnatie.trvale)} €</span></div> : null}
                        <div className="flex justify-between"><span className="text-muted">Trhový odhad (pravidlá)</span><span className="text-fg">~ {eurShort(mv)} €</span></div>
                        {medians?.pozemok ? (
                          <div className="flex justify-between"><span className="text-muted">Z inzercie lokality</span><span className="font-medium text-fg">~ {eurShort(fullLv.totalAreaC * medians.pozemok)} € <span className="text-[10px] text-muted">({eurShort(medians.pozemok)} €/m²)</span></span></div>
                        ) : null}
                        <div className="mt-1 text-[10px] text-muted">{medians?.pozemok ? "Z inzercie = medián €/m² lokality zo scrapu × výmera. " : ""}Hrubý screening, nie znalecký posudok.</div>
                      </div>
                    );
                  })()}

                  <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: datasetId ?? "", lvNo: String(identified.lv_no) }} search={{ typ: "vypis" as const }} className="block rounded-md border border-line px-3 py-1.5 text-center font-medium text-green hover:bg-surface-2">
                    Otvoriť úplný výpis z LV →
                  </Link>
                </div>
              )}
            </div>
          ) : null}

          {identified.centroid_lat != null && identified.centroid_lng != null ? (
            <a
              href={`https://zbgis.skgeodesy.sk/mkzbgis/sk/kataster?bm=zbgis&z=18&c=${identified.centroid_lng},${identified.centroid_lat}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-2"
            >
              Otvoriť v ZBGIS ↗
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Map Session Workbench (spodný pás + audit log) */}
      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-ink/92 text-cream backdrop-blur">
        {logOpen ? (
          <div className="max-h-40 overflow-y-auto border-b border-white/10 px-3 py-2 text-[11px]">
            {events.length === 0 ? (
              <div className="text-cream/50">Zatiaľ žiadne udalosti relácie.</div>
            ) : (
              events.map((ev, i) => (
                <div key={i} className="flex gap-2 py-0.5">
                  <span className="text-cream/40 tabular-nums">{ev.time}</span>
                  <span className="text-cream/90">{ev.msg}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
          <span className="rounded px-1.5 py-0.5" style={{ background: "#5b7a5833", color: "#cfe0c4" }}>engine: LocalCanvas</span>
          <span className="text-cream/70">{datasetName ?? "—"}</span>
          <span className="text-cream/50">·</span>
          <span className="text-cream/70">zoom {view ? view.zoom.toFixed(1) : "—"}</span>
          <span className="text-cream/50">·</span>
          <span className="text-cream/70">výber {selection.length}</span>
          <span className="ml-auto rounded px-1.5 py-0.5" style={{ background: "#33333322", color: "#e9dcbf" }}>read-only · owner-safe</span>
          <button onClick={() => setLogOpen((o) => !o)} className="rounded border border-white/15 px-2 py-0.5 text-cream/80 hover:bg-white/10">
            {logOpen ? "skryť log" : `log (${events.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function LayerRow({ label, checked, onToggle, disabled, hint, swatch }: { label: string; checked: boolean; onToggle?: () => void; disabled?: boolean; hint?: string; swatch?: string }) {
  return (
    <label className={"flex items-center justify-between gap-2 " + (disabled ? "opacity-60" : "cursor-pointer")}>
      <span className="flex items-center gap-2 text-fg">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} className="accent-brand" />
        {swatch ? <span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: swatch }} /> : null}
        {label}
      </span>
      {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
    </label>
  );
}

function eurShort(n: number): string { return n.toLocaleString("sk-SK", { maximumFractionDigits: n < 100 ? 1 : 0 }); }
function FullLvBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">{title}</div>
      <div>{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-fg">{v}</dd>
    </div>
  );
}
