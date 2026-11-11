import { useEffect, useMemo, useRef, useState } from "react";
import { mapFeature, type MapFeature } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";

// Kópia z mapy do výpisu LV (zadanie vlastníka 2026-11-11): ortofoto ZBGIS + katastrálna mapa ESKN
// (register C, pri parcelách E aj mapa určeného operátu) so zvýraznenými parcelami LV, mierkou a
// severkou. Obrázky sú <img> (tlačia sa aj bez „tlače pozadia"). onReady → výpis až potom spustí tlač.
const W = 900, H = 520, R = 6378137;
const toMerc = (lng: number, lat: number) => ({ x: (lng * Math.PI / 180) * R, y: Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R });

export function LvMapSnapshot({ datasetId, lvNo, hasE, onReady }: { datasetId: string; lvNo: number; hasE: boolean; onReady?: () => void }) {
  const { token } = useAuth();
  const [f, setF] = useState<MapFeature | null>(null);
  const [failed, setFailed] = useState(false);
  const done = useRef(0);
  const readyFired = useRef(false);
  const fire = () => { if (!readyFired.current) { readyFired.current = true; onReady?.(); } };

  useEffect(() => {
    let alive = true;
    setF(null); setFailed(false); done.current = 0; readyFired.current = false;
    mapFeature({ data: { token: token ?? undefined, datasetId, kind: "LV", lvNo } })
      .then((r) => { if (!alive) return; if (r.ok && r.rings?.length) setF(r); else { setFailed(true); fire(); } })
      .catch(() => { if (alive) { setFailed(true); fire(); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, lvNo, token]);

  const geo = useMemo(() => {
    if (!f?.rings?.length) return null;
    const pts = f.rings.flat().map(([lng, lat]) => toMerc(lng, lat));
    let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
    let y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max((x1 - x0) * 1.35, 220), h = Math.max((y1 - y0) * 1.35, 130);
    if (w / h > W / H) h = w * H / W; else w = h * W / H;     // pomer strán obrázka
    x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
    const bbox = `${x0},${y0},${x1},${y1}`;
    const lat = (2 * Math.atan(Math.exp(cy / R)) - Math.PI / 2);
    const mPerPx = (w / W) * Math.cos(lat);                     // skutočné metre na pixel (Mercator)
    const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((m) => m / mPerPx >= 90) ?? 5000;
    const proj = (lng: number, lat2: number) => { const p = toMerc(lng, lat2); return { x: ((p.x - x0) / w) * W, y: ((y1 - p.y) / h) * H }; };
    const paths = f.rings.map((ring) => ring.map(([lng, la], i) => { const p = proj(lng, la); return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(" ") + " Z");
    const orto = `https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get?${new URLSearchParams({ service: "WMS", version: "1.3.0", request: "GetMap", layers: "1", styles: "", crs: "EPSG:3857", format: "image/jpeg", width: String(W), height: String(H), bbox })}`;
    const kn = `https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer/export?${new URLSearchParams({ bbox, bboxSR: "3857", imageSR: "3857", size: `${W},${H}`, format: "png32", transparent: "true", layers: "show:1,4,5,7,10,14", dpi: "96", f: "image" })}`;
    const uo = `https://kataster.skgeodesy.sk/eskn/rest/services/VRM/uo/MapServer/export?${new URLSearchParams({ bbox, bboxSR: "3857", imageSR: "3857", size: `${W},${H}`, format: "png32", transparent: "true", layers: "show:0,2", dpi: "96", f: "image" })}`;
    return { paths, orto, kn, uo, scalePx: nice / mPerPx, scaleM: nice };
  }, [f]);

  const imgs = geo ? [geo.orto, geo.kn, ...(hasE ? [geo.uo] : [])] : [];
  const onImg = () => { done.current += 1; if (done.current >= imgs.length) fire(); };

  if (failed) return <p className="text-xs text-muted">Kópia z mapy: obrys parciel tohto LV nie je k dispozícii.</p>;
  if (!geo) return <p className="text-xs text-muted">Pripravujem kópiu z mapy…</p>;
  return (
    <figure className="break-inside-avoid">
      <div className="relative w-full overflow-hidden rounded border border-line bg-surface-2" style={{ aspectRatio: `${W} / ${H}` }}>
        {imgs.map((u, i) => (
          <img key={i} src={u} alt="" onLoad={onImg} onError={onImg} className="absolute inset-0 h-full w-full" style={{ opacity: i === 0 ? 0.85 : 1 }} />
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          {geo.paths.map((d, i) => <g key={i}><path d={d} fill="#e0561f" fillOpacity="0.18" stroke="#fffdf8" strokeWidth="5" strokeOpacity="0.8" /><path d={d} fill="none" stroke="#e0561f" strokeWidth="2.6" /></g>)}
          <g transform={`translate(${W - 46} 22)`}><path d="M12 0 L22 30 L12 24 L2 30 Z" fill="#222" stroke="#fff" strokeWidth="1.5" /><text x="12" y="44" textAnchor="middle" fontSize="14" fontWeight="700" fill="#222" stroke="#fff" strokeWidth="3" paintOrder="stroke">S</text></g>
          <g transform={`translate(18 ${H - 26})`}>
            <rect x="0" y="0" width={geo.scalePx} height="7" fill="#fff" stroke="#222" />
            <rect x="0" y="0" width={geo.scalePx / 2} height="7" fill="#222" />
            <text x={geo.scalePx + 8} y="8" fontSize="13" fill="#222" stroke="#fff" strokeWidth="3" paintOrder="stroke">{geo.scaleM >= 1000 ? `${geo.scaleM / 1000} km` : `${geo.scaleM} m`}</text>
          </g>
        </svg>
      </div>
      <figcaption className="mt-1 text-[10px] text-muted">
        Informatívna kópia z mapy — parcely LV č. {lvNo} zvýraznené. Podklad: © ÚGKK SR — ZBGIS ortofoto, ESKN katastrálna mapa{hasE ? " a mapa určeného operátu (register E)" : ""}. Nie je to úradná kópia z katastrálnej mapy.
      </figcaption>
    </figure>
  );
}
