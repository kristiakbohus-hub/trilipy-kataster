// LIST NEHNUTEĽNOSTI — vykreslenie (interná aj klientska verzia). Dáta pripraví route /nehnutelnost (interná,
// živé) alebo /n/$token (klientska, snapshot bez mien a internej práce). Komponent nič nenačítava zo servera —
// interné widgety (kupci, komentáre, dokumenty, kontakt) dostane cez `internal`. Zásady: chýbajúci údaj je
// NEZNÁMY stav; každá sekcia uvádza zdroj; formulácie podľa phrases.ts (Property-360 §4).
import { useMemo, useState, type ReactNode } from "react";
import { FACT_GROUP_LABEL, FACT_SCHEMA, type FactField } from "../lib/facts-schema";
import { nf, eur, m2, dist, prettyZone, date, Sec, Muted, Sub, Grid, Table } from "./ps-ui";
import { financeOf, type FinInputs, type FinResult } from "../lib/finance";
import { explain, lightsSentence } from "../lib/property-explain";
import { CostsBody, FinancingBody, FinInputsPanel, InsuranceBody, InvestBody, PredictionBody, finSourcesText } from "./property-finance";
import { checklist, completeness, connectionLength, fact, mainKey, offices, parseFact, riskyHit, sellPropensity, semafor, shapeOf, suitability, zoneOf, type Light, type SheetData } from "../lib/property-eval";

export type SheetMode = "internal" | "client";
const LEGAL_LABEL: Record<string, string> = {
  zalozne_pravo: "Záložné právo", vecne_bremeno: "Vecné bremeno", predkupne: "Predkupné právo", najom: "Nájom", exekucia: "Exekúcia",
  dedicstvo: "Dedičstvo", kupa: "Kúpna zmluva", darovanie: "Darovacia zmluva", rozhodnutie: "Rozhodnutie", drazba: "Dražba", ine: "Iné",
};
export function groupLegal(items: string[]): { label: string; n: number; span: string | null }[] {
  const m = new Map<string, { n: number; years: number[] }>();
  for (const it of items) {
    const raw = it.trim();
    const ym = raw.match(/\b(1[89]\d{2}|20\d{2})\b/);
    const t0 = raw.replace(/\s*\b(1[89]\d{2}|20\d{2})\b\s*/, " ").trim();
    const type = t0.replace(/^([a-z_]+)/, (x) => LEGAL_LABEL[x] ?? x) || "Iné";
    const g = m.get(type) ?? { n: 0, years: [] };
    g.n += 1; if (ym) g.years.push(Number(ym[1]));
    m.set(type, g);
  }
  return [...m].map(([label, g]) => {
    const ys = g.years.sort((a, b) => a - b);
    return { label, n: g.n, span: ys.length === 0 ? null : ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}` };
  }).sort((a, b) => (a.label === "Iné" ? 1 : b.label === "Iné" ? -1 : 0) || b.n - a.n);
}

// ——— predpočítané údaje (property_facts) — popisy zo schém Mac modulov ———
const AMEN_SK: Record<string, string> = { skola: "škola", ms: "materská škola", lekar: "lekár", lekaren: "lekáreň", super: "supermarket", potrav: "potraviny",
  posta: "pošta", banka: "banka", atm: "bankomat", sport: "športovisko", ihrisko: "ihrisko", gastro: "reštaurácia", nabij: "nabíjačka", hasic: "hasiči",
  policia: "polícia", bus: "autobus", vlak: "vlak", bazen: "plaváreň", nemoc: "nemocnica", lyze: "lyžovanie" };
const human = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
function fmtVal(v: unknown, f?: FactField): ReactNode {
  if (v == null || v === "") return "—";
  const unit = f?.unit && f.unit !== "MM-DD" ? `\u00a0${f.unit}` : "";
  if (typeof v === "boolean") return v ? "áno" : "nie";
  if (typeof v === "number") {
    if (Number.isInteger(v) && /\brok|year|\bLV\b|list vlastníctva|súpisn|číslo|kód/i.test(f?.label ?? "")) return `${v}${unit}`;
    if (f?.unit === "m" && Math.abs(v) >= 1000) return `${nf(v / 1000, 1)}\u00a0km`;
    return `${nf(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0)}${unit}`;
  }
  if (typeof v === "string" && /^\d{2}-\d{2}$/.test(v)) return `${Number(v.slice(3))}. ${Number(v.slice(0, 2))}.`;
  if (typeof v === "string") return `${v}${unit && !/[a-zA-Z€%°]$/.test(v) ? unit : ""}`;
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    if (v.every((x) => x == null || typeof x !== "object")) return v.map((x) => AMEN_SK[String(x)] ?? String(x)).join(", ");
    const keys = [...new Set(v.flatMap((x) => (x && typeof x === "object" ? Object.keys(x as object) : [])))].slice(0, 8);
    return (
      <table className="mt-1 w-full text-[11px]">
        <thead><tr className="text-left text-muted">{keys.map((k) => <th key={k} className="pr-2 font-normal">{human(k)}</th>)}</tr></thead>
        <tbody>{v.slice(0, 15).map((x, i) => <tr key={i} className="border-t border-line/30">{keys.map((k) => <td key={k} className="pr-2">{fmtVal((x as Record<string, unknown>)?.[k])}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null).map(([k, x]) => `${human(k)}: ${typeof x === "object" ? JSON.stringify(x) : String(x)}`).join(" · ");
  return String(v);
}
export function FactsBlock({ grp, data, skip = [], only, depth = 0 }: { grp: string; data: Record<string, unknown> | null; skip?: string[]; only?: string[]; depth?: number }) {
  if (!data) return null;
  const schema = FACT_SCHEMA[grp] ?? {};
  const entries = (only ? only.filter((k) => k in data).map((k) => [k, data[k]] as [string, unknown]) : Object.entries(data))
    .filter(([k, v]) => !skip.includes(k) && !["lat", "lon", "lng"].includes(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length));
  if (!entries.length) return null;
  const simple = entries.filter(([, v]) => typeof v !== "object" || (Array.isArray(v) && v.every((x) => typeof x !== "object")));
  const complex = entries.filter((e) => !simple.includes(e));
  return (
    <div className="space-y-1">
      <Grid rows={simple.map(([k, v]) => [<span key={k} title={schema[k]?.note}>{schema[k]?.label ?? human(k)}</span>, fmtVal(v, schema[k])] as [ReactNode, ReactNode])} />
      {complex.map(([k, v]) => (
        v && typeof v === "object" && !Array.isArray(v) && depth < 2 ? (
          <div key={k} className="pl-2"><div className="pt-1 text-[11px] font-medium text-muted" title={schema[k]?.note}>{schema[k]?.label ?? human(k)}</div><FactsBlock grp={grp} data={v as Record<string, unknown>} depth={depth + 1} /></div>
        ) : <div key={k} className="text-xs"><span className="text-muted">{schema[k]?.label ?? human(k)}:</span> {fmtVal(v, schema[k])}</div>
      ))}
    </div>
  );
}

// skupiny kľúčov OSM modulu (schemas/osm.json) — siete vs. doprava a vybavenosť
const OSM_NET = ["el_op", "el_op_kv", "vn", "vn_kv", "vvn", "vvn_kv", "trafo", "plyn", "plyn_op", "plyn_dn", "ropa", "lampa"];
const OSM_ZONES = ["cint", "cint_op", "zel", "zel_op", "farma", "cov", "skladka", "bioplyn"];
const OSM_TIME = ["t_za", "t_ca", "t_ba", "t_ova", "t_kat", "zjazd", "cesta1", "hr_cz", "hr_pl", "mesto", "mesto_n"];
const OSM_ROAD = ["cesta", "cesta_tr", "cesta_pov", "cesta_lit", "cesta_chod", "spev"];
const OSM_AMEN = ["skola", "ms", "lekar", "lekaren", "nemoc", "potrav", "super", "posta", "banka", "atm", "bus", "vlak", "sport", "ihrisko", "bazen", "gastro", "lyze", "nabij", "hasic", "policia", "pesi"];

// ——— semafor ———
const LIGHT_STYLE: Record<Light["state"], { bg: string; fg: string; dot: string; word: string }> = {
  ok: { bg: "rgba(63,90,60,.08)", fg: "#3f5a3c", dot: "#4f7a4a", word: "v poriadku" },
  warn: { bg: "rgba(180,130,40,.10)", fg: "#8a6418", dot: "#c29434", word: "pozor" },
  bad: { bg: "rgba(156,74,64,.10)", fg: "#9c4a40", dot: "#b5523f", word: "riziko" },
  unknown: { bg: "rgba(120,120,120,.08)", fg: "#666", dot: "#9a9a9a", word: "neznáme" },
};
function Lights({ lights }: { lights: Light[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {lights.map((l) => {
        const s = LIGHT_STYLE[l.state];
        return (
          <div key={l.key} className="rounded-md px-2.5 py-1.5" style={{ background: s.bg }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: s.fg }}>
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} />
              {l.label} <span className="font-normal">· {s.word}</span>
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-fg/80">{l.text}</div>
          </div>
        );
      })}
    </div>
  );
}

// ——— náčrt celku z obrysov parciel (bez externých dlaždíc, funguje aj v tlači) ———
function ringsOf(g: string | null): [number, number][][] {
  if (!g) return [];
  try {
    const j = JSON.parse(g) as { type: string; coordinates: unknown };
    if (j.type === "Polygon") return [(j.coordinates as [number, number][][])[0]];
    if (j.type === "MultiPolygon") return (j.coordinates as [number, number][][][]).map((p) => p[0]);
  } catch { /* poškodená geometria */ }
  return [];
}
export function ParcelSketch({ d, labels = "all" }: { d: SheetData; labels?: "all" | "main" }) {
  const ps = d.core.parcels.filter((p) => p.geometry_json).slice(0, 120);
  const all = ps.flatMap((p) => ringsOf(p.geometry_json).flat());
  if (all.length < 3) return <Muted>Obrys parciel nie je k dispozícii — poloha len podľa stredu parcely.</Muted>;
  const lat0 = all.reduce((s, c) => s + c[1], 0) / all.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110540;
  const xs = all.map((c) => c[0] * kx), ys = all.map((c) => c[1] * ky);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 640, H = 360, pad = 24;
  const sc = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1), (H - 2 * pad) / Math.max(maxY - minY, 1));
  const P = (c: [number, number]) => `${(pad + (c[0] * kx - minX) * sc).toFixed(1)},${(H - pad - (c[1] * ky - minY) * sc).toFixed(1)}`;
  const barM = [5, 10, 20, 50, 100, 200, 500, 1000].find((b) => b * sc > 60) ?? 1000;
  const isMain = (no: string, reg: string) => no === d.core.main.parcelNo && reg === d.core.main.register;
  // letecký snímok ÚGKK (WMS, EPSG:4326 = lineárne v dĺžke/šírke → sedí na náčrt v rovnakom rozsahu)
  const lngL = -pad / (sc * kx) + minX / kx, lngR = (W - pad) / (sc * kx) + minX / kx;
  const latT = (H - pad) / (sc * ky) + minY / ky, latB = -pad / (sc * ky) + minY / ky;
  const orto = `https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=1&STYLES=&SRS=EPSG:4326&BBOX=${lngL.toFixed(6)},${latB.toFixed(6)},${lngR.toFixed(6)},${latT.toFixed(6)}&WIDTH=${W * 2}&HEIGHT=${H * 2}&FORMAT=image/jpeg`;
  return (
    <figure className="space-y-1">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-md border border-line bg-surface-2" role="img" aria-label="Náčrt parciel celku na leteckom snímku">
      <image href={orto} x="0" y="0" width={W} height={H} preserveAspectRatio="none" opacity="0.92" />
      {ps.map((p) => ringsOf(p.geometry_json).map((r, i) => (
        <polygon key={`${p.register}${p.parcel_no}-${i}`} points={r.map(P).join(" ")}
          fill={isMain(p.parcel_no, p.register) ? "rgba(255,255,255,.26)" : p.register === "E" ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.12)"}
          stroke="#fff" strokeWidth={isMain(p.parcel_no, p.register) ? 3 : 1.1} strokeDasharray={isMain(p.parcel_no, p.register) ? undefined : "4 2"}
          style={{ filter: isMain(p.parcel_no, p.register) ? "drop-shadow(0 0 1.5px rgba(0,0,0,.9))" : undefined }} />
      )))}
      {ps.length <= 30 ? ps.filter((p) => labels === "all" || isMain(p.parcel_no, p.register)).map((p) => {
        const r = ringsOf(p.geometry_json)[0]; if (!r) return null;
        const cx = r.reduce((s, c) => s + c[0], 0) / r.length, cy = r.reduce((s, c) => s + c[1], 0) / r.length;
        const [x, y] = P([cx, cy]).split(",");
        return <text key={`t${p.register}${p.parcel_no}`} x={x} y={y} fontSize="11" textAnchor="middle" fill="#fff" stroke="#222" strokeWidth="0.35" fontWeight="600">{p.register === "E" ? "E " : ""}{p.parcel_no}</text>;
      }) : null}
      <g transform={`translate(${W - pad - barM * sc},${H - 10})`}>
        <line x1="0" y1="0" x2={barM * sc} y2="0" stroke="#333" strokeWidth="2" />
        <text x={(barM * sc) / 2} y="-4" fontSize="10" textAnchor="middle" fill="#333">{barM} m</text>
      </g>
      <g transform={`translate(${pad},${pad + 4})`}><text fontSize="12" fill="#fff" stroke="#333" strokeWidth="0.4" textAnchor="middle">S</text><line x1="0" y1="4" x2="0" y2="18" stroke="#fff" /></g>
    </svg>
    <figcaption className="text-[10px] text-muted">Letecký snímok: Ortofotomozaika SR © ÚGKK SR (ZBGIS). Obrysy parciel z katastrálnej mapy.</figcaption>
    </figure>
  );
}

// ——— III. vojenské mapovanie (1869–1887), ÚGKK WMS v EPSG:3857, výrez ±650 m so stredom parcely ———
function HistoricMap({ lat, lng }: { lat: number; lng: number }) {
  const R = 20037508.34;
  const mx = (lng * R) / 180, my = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (R / 180);
  const h = 1400;
  const src = `https://zbgisws.skgeodesy.sk/hm_III_vm/service.svc/get?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=1&STYLES=&CRS=EPSG:3857&BBOX=${(mx - h).toFixed(1)},${(my - h).toFixed(1)},${(mx + h).toFixed(1)},${(my + h).toFixed(1)}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg`;
  return (
    <figure className="space-y-1">
      <div className="ps-hist relative mx-auto w-full max-w-sm overflow-hidden rounded-md border border-line bg-surface-2">
        <img src={src} alt="Historická mapa okolia (III. vojenské mapovanie)" className="block h-auto w-full" loading="lazy" />
        <span aria-hidden className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: "#c0392b" }} />
      </div>
      <figcaption className="text-center text-[10px] text-muted">Okolie pred ~150 rokmi — III. vojenské mapovanie (1869–1887), © ÚGKK SR, CC BY 4.0. Krúžok = stred parcely.</figcaption>
    </figure>
  );
}

// ——— zámery EIA/SEA v obci (Enviroportál) ———
function EiaBlock({ data }: { data: Record<string, unknown> | null }) {
  const ps = Array.isArray(data?.projekty) ? (data?.projekty as { n?: string; stav?: string; typ?: string; d?: string; u?: string }[]) : [];
  if (!data) return null;
  if (!ps.length) return <Muted>V obci nie je od roku {String(data.od ?? "2018")} zaznamenaný zámer EIA/SEA.</Muted>;
  return <Table head={["Dátum", "Zámer", "Typ", "Stav"]} rows={ps.slice(0, 12).map((p) => [date(p.d), p.u ? <a key="u" href={p.u} target="_blank" rel="noopener noreferrer" className="text-brand underline">{(p.n ?? "zámer").slice(0, 70)}</a> : p.n ?? "—", p.typ ?? "—", p.stav ?? "—"])} />;
}

// ——— klíma podľa výšky parcely (pásma z Mac modulu) ———
function elevOf(t: Record<string, unknown> | null): number | null {
  if (!t) return null;
  if (typeof t.v_avg === "number") return t.v_avg;
  for (const [k, v] of Object.entries(t)) if (typeof v === "number" && /^(elev|vysk|nadm)[a-z_]*(mean|priem|avg)|^(elev|vyska|nadmorska_vyska)$/.test(k)) return v;
  return null;
}
function BandsBlock({ grp, data, elev, skip = [] }: { grp: string; data: Record<string, unknown>; elev: number | null; skip?: string[] }) {
  const bands = data.bands as Record<string, Record<string, unknown>> | undefined;
  let pick: [string, Record<string, unknown>] | null = null;
  if (bands && Object.keys(bands).length) {
    const ks = Object.keys(bands).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const target = elev ?? ks[Math.floor(ks.length / 2)];
    const best = ks.reduce((b, k) => (Math.abs(k - target) < Math.abs(b - target) ? k : b), ks[0]);
    pick = [String(best), bands[String(best)]];
  }
  const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "bands" && !skip.includes(k)));
  return (
    <div className="space-y-2">
      {pick ? <><Sub>Pre nadmorskú výšku ~{pick[0]} m{elev != null ? ` (parcela ${Math.round(elev)} m)` : ""}</Sub><FactsBlock grp={grp} data={pick[1]} /></> : null}
      <FactsBlock grp={grp} data={rest} />
    </div>
  );
}
function KlimaBlock({ data, elev }: { data: Record<string, unknown>; elev: number | null }) {
  if (data.ref && data.bands) return <BandsBlock grp="klima" data={data} elev={elev} skip={["ref", "ref_t_m", "ref_lat", "ref_lon", "lapse_c_per_100m", "elev_range", "elev_median"]} />;
  const bands = (data.bands ?? data.pasma) as Record<string, Record<string, unknown>> | undefined;
  const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "bands" && k !== "pasma"));
  let pick: [string, Record<string, unknown>] | null = null;
  if (bands && Object.keys(bands).length) {
    const ks = Object.keys(bands).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const target = elev ?? Number(data.ref_elev ?? ks[Math.floor(ks.length / 2)]);
    const best = ks.reduce((b, k) => (Math.abs(k - target) < Math.abs(b - target) ? k : b), ks[0]);
    pick = [String(best), bands[String(best)]];
  }
  return (
    <div className="space-y-2">
      {pick ? <><Sub>Pre nadmorskú výšku ~{pick[0]} m{elev != null ? ` (parcela ${Math.round(elev)} m)` : ""}</Sub><FactsBlock grp="klima" data={pick[1]} /></> : null}
      <FactsBlock grp="klima" data={rest} skip={["ref_elev"]} />
    </div>
  );
}

// ——— horizont z terénu + dráha slnka 21. 12. / 21. 3. / 21. 6. (vlastný výpočet polohy slnka) ———
function sunPath(lat: number, declDeg: number): [number, number][] {
  const r = Math.PI / 180, f = lat * r, dl = declDeg * r, out: [number, number][] = [];
  for (let h = -180; h <= 180; h += 2) {
    const H = h * r;
    const alt = Math.asin(Math.sin(f) * Math.sin(dl) + Math.cos(f) * Math.cos(dl) * Math.cos(H));
    if (alt < -0.02) continue;
    const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(dl) * Math.cos(f)) / r + 180 + 360) % 360;
    out.push([az, alt / r]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
function HorizonChart({ hor, lat }: { hor: unknown; lat: number | null }) {
  if (!Array.isArray(hor) || hor.length < 8 || lat == null) return null;
  const n = hor.length, step = 360 / n;
  const H = hor.map((v) => (typeof v === "number" ? v / 2 : 0));          // 0,5° jednotky → stupne
  const W = 640, Ht = 220, x0 = 60, x1 = 300, top = 70;                      // azimut 60° (VSV) … 300° (ZSZ)
  const X = (az: number) => 30 + ((az - x0) / (x1 - x0)) * (W - 60);
  const Y = (alt: number) => Ht - 24 - (Math.max(alt, 0) / top) * (Ht - 40);
  const horPts = H.map((a, i) => [i * step, a] as [number, number]).filter(([az]) => az >= x0 && az <= x1);
  const paths: [string, number, string][] = [["21. 6.", 23.44, "#c29434"], ["21. 3.", 0, "#7a8a5a"], ["21. 12.", -23.44, "#5a6ea0"]];
  return (
    <svg viewBox={`0 0 ${W} ${Ht}`} className="h-auto w-full rounded-md border border-line bg-surface-2" role="img" aria-label="Horizont a dráha slnka">
      {[0, 15, 30, 45, 60].map((a) => <g key={a}><line x1={30} x2={W - 30} y1={Y(a)} y2={Y(a)} stroke="#ddd" /><text x={4} y={Y(a) + 3} fontSize="9" fill="#777">{a}°</text></g>)}
      {[[90, "V"], [135, "JV"], [180, "J"], [225, "JZ"], [270, "Z"]].map(([az, l]) => <text key={String(l)} x={X(Number(az))} y={Ht - 8} fontSize="10" textAnchor="middle" fill="#555">{l}</text>)}
      {paths.map(([label, decl, col]) => {
        const pts = sunPath(lat, decl).filter(([az]) => az >= x0 && az <= x1);
        if (pts.length < 2) return null;
        const mid = pts[Math.floor(pts.length / 2)];
        return <g key={label}><polyline points={pts.map(([az, al]) => `${X(az).toFixed(1)},${Y(al).toFixed(1)}`).join(" ")} fill="none" stroke={col} strokeWidth="1.6" />
          <text x={X(mid[0])} y={Y(mid[1]) - 4} fontSize="9" textAnchor="middle" fill={col}>{label}</text></g>;
      })}
      <polygon points={[`${X(x0)},${Y(0)}`, ...horPts.map(([az, al]) => `${X(az).toFixed(1)},${Y(al).toFixed(1)}`), `${X(x1)},${Y(0)}`].join(" ")} fill="rgba(85,96,79,.35)" stroke="#55604f" />
      <text x={W - 32} y={14} fontSize="9" textAnchor="end" fill="#555">sivá = terén (horizont), čiary = dráha slnka</text>
    </svg>
  );
}

// ——— úradné registre (geológia, voda, príroda, les, ovzdušie, internet…) zoskupené podľa oblasti ———
function ExtBlock({ items }: { items: NonNullable<SheetData["ext"]> }) {
  const cats = [...new Set(items.map((e) => e.category))];
  const errs = items.filter((e) => e.status === "error").length;
  return (
    <div className="space-y-3">
      {cats.map((cat) => {
        const rows = items.filter((e) => e.category === cat && e.status !== "error");
        if (!rows.length) return null;
        return (
          <div key={cat}>
            <Sub>{cat}</Sub>
            <Table head={["Údaj", "Výsledok", "Zdroj"]} rows={rows.map((e) => [
              <span key="l">{e.label}{e.detail ? <span className="block text-[11px] text-muted">{e.detail}</span> : null}</span>,
              <span key="v" style={{ color: e.status === "hit" && e.risk ? "#9c4a40" : undefined, fontWeight: e.status === "hit" && e.risk ? 600 : undefined }}>
                {e.value ?? (e.status === "none" ? "bez prieniku v dostupnom pokrytí" : "—")}{e.url ? <> · <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">dokument</a></> : null}
              </span>, e.attribution])} />
          </div>
        );
      })}
      {errs ? <Muted>{errs} z {items.length} registrov práve neodpovedalo — stav pri nich je neznámy.</Muted> : null}
    </div>
  );
}

// ——— hodnotenie: vhodnosť pre typ využitia (+ interne pravdepodobnosť predaja) ———
function Bar({ n }: { n: number }) {
  const col = n >= 65 ? "#4f7a4a" : n >= 45 ? "#c29434" : "#b5523f";
  return <span className="inline-block h-1.5 w-20 overflow-hidden rounded bg-line/60 align-middle"><span className="block h-full" style={{ width: `${n}%`, background: col }} /></span>;
}
function Scores({ d, isClient }: { d: SheetData; isClient: boolean }) {
  const s = suitability(d);
  const p = isClient ? null : sellPropensity(d);
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      {s.map((x) => (
        <div key={x.key} className="rounded-md border border-line/70 px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2"><b>{x.label}</b><span className="flex items-center gap-1.5 tabular-nums"><Bar n={x.score} /> {x.score}</span></div>
          <div className="mt-0.5 leading-snug text-muted">{[...x.plus.map((t) => `+ ${t}`), ...x.minus.map((t) => `− ${t}`)].slice(0, 6).join(" · ") || "málo údajov na hodnotenie"}</div>
        </div>
      ))}
      {p ? (
        <div className="rounded-md border border-line/70 px-2.5 py-1.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-2"><b>Pravdepodobnosť, že vlastníci predajú (interné, poradie na oslovenie)</b><span className="flex items-center gap-1.5 tabular-nums"><Bar n={p.score} /> {p.score}</span></div>
          <div className="mt-0.5 text-muted">{p.factors.join(" · ") || "žiadny výrazný signál"}</div>
        </div>
      ) : null}
      <p className="text-[10px] text-muted sm:col-span-2">Skóre je orientačné poradie z údajov v tomto liste (0–100); chýbajúci údaj nepridáva ani neuberá body.</p>
    </div>
  );
}

// ——— TLAČ / PDF v značke TRI LIPY (brandbook: charcoal #333 na bielej, Josefin Sans verzálky s prestrkom, Montserrat) ———
const LIGHT_WORD: Record<Light["state"], string> = { ok: "v poriadku", warn: "pozor", bad: "riziko", unknown: "neznáme" };
const LIGHT_DOT: Record<Light["state"], string> = { ok: "#5b7a58", warn: "#b08a3e", bad: "#9c4a40", unknown: "#b5b5b5" };
const short = (t: string, n: number) => { if (t.length <= n) return t; const cut = t.slice(0, n - 1); const sp = cut.lastIndexOf(" "); return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:(·-]+$/, "")} …`; };
const dateLong = (iso: string) => new Date(iso).toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" });
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");

function docRef(d: SheetData): string {
  const c = d.core;
  const ref = c.main.parcelNo ?? (c.main.lvNo != null ? `LV${c.main.lvNo}` : "");
  return `TL-${c.dataset?.ku_code ?? "000000"}-${String(ref).replace(/[^0-9A-Za-z]+/g, "-")}-${d.generatedAt.slice(0, 10).replace(/-/g, "")}`;
}

/** Kľúčové zistenia pre zhrnutie — len z údajov listu, bez tvrdení nad rámec dôkazu (phrases.ts). */
function keyFindings(d: SheetData, fin: FinResult | null): string[] {
  const c = d.core; const mk = mainKey(c); const out: string[] = [];
  const est = c.compStats?.estimateEur ?? d.avm?.estimate_eur ?? null;
  if (c.compStats?.estimateEur) out.push(`Orientačná hodnota ${eur(c.compStats.estimateEur)} podľa ${c.compStats.n} porovnateľných predajov zo zmlúv v okrese${c.compStats.medPpm2 ? ` (medián ${nf(c.compStats.medPpm2)} €/m²)` : ""}.`);
  else if (est) out.push(`Orientačná hodnota ${eur(est)} (automatický odhad z ponúk a predajov v okrese).`);
  const z = zoneOf(d); out.push(z.name ? `Územný plán: ${prettyZone(z.name)}.` : "Zónu územného plánu pre parcelu nemáme — overiť na obci.");
  const pr = mk ? fact(c, "pristup", mk) : null;
  if (pr?.trieda) out.push(`Prístup: ${String(pr.trieda)}${pr.front_m ? `, front ${nf(Number(pr.front_m))} m` : ""}.`);
  const t = mk ? fact(c, "teren", mk) : null, sl = mk ? fact(c, "slnko", mk) : null;
  if (t) out.push(`Terén: priemerný sklon ${nf(Number(t.sklon_avg ?? 0), 1)} %, orientácia ${String(t.orient ?? "—")}, ${String(t.poloha ?? "").toLowerCase() || "poloha neurčená"}${sl?.dec_slnko != null ? `; 21. 12. priame slnko ${nf(Number(sl.dec_slnko), 1)} h` : ""}.`);
  const hits = [...(d.limits?.items ?? []).filter((h) => h.hit).map((h) => h.label), ...(d.ext ?? []).filter(riskyHit).map((e) => `${e.label}${e.value ? ` (${short(e.value, 40)})` : ""}`)];
  out.push(hits.length ? `Zásahy v úradných registroch: ${hits.slice(0, 5).join("; ")}${hits.length > 5 ? " …" : ""}.` : "V sledovaných registroch limitov a rizík bez prieniku v dostupnom pokrytí.");
  const ob = fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`); const osm = mk ? fact(c, "osm", mk) : null;
  const net = [ob?.vodovod_verejny_pct != null ? `vodovod ${nf(Number(ob.vodovod_verejny_pct))} % domov obce` : null, ob?.kanal_pripojka_pct != null ? `kanalizácia ${nf(Number(ob.kanal_pripojka_pct))} %` : null,
    ob?.plyn_obec != null ? (ob.plyn_obec ? "plyn v obci" : "obec bez plynu") : null, typeof osm?.trafo === "number" ? `trafostanica ${dist(osm.trafo as number)}` : null].filter(Boolean);
  if (net.length) out.push(`Siete: ${net.join(", ")}.`);
  const tar = c.legal.reduce((x, l) => x + l.tarchyCount, 0), own = c.owners.perLv.reduce((x, l) => x + l.count, 0);
  out.push(`Vlastníctvo: ${own} ${own === 1 ? "vlastník" : own < 5 ? "vlastníci" : "vlastníkov"} na ${c.lvs.length} LV; ${tar ? `${tar}× ťarcha alebo poznámka` : "ťarcha v našom zázname nie je zapísaná (overiť na výpise)"}.`);
  const fm = fin?.mortgage;
  if (fm) out.push(`Financovanie: pri úvere ${Math.round(fin!.inputs.ltv * 100)} % splátka ~${eur(fm.payment)} mesačne (${nf(fm.rate, 2)} %, ${fin!.inputs.fix} r. fixácia), vlastné zdroje ~${eur(fm.ownFunds.total)}, potrebný čistý príjem domácnosti ~${eur(fm.income.netMonthly)}${fm.blockers.length ? `; ${fm.blockers.length}× prekážka financovania` : ""}.`);
  const pz = fin?.prediction;
  if (pz) out.push(`Hodnota o 5 rokov (základný scenár): ~${eur(pz.scenarios[1].values[2])}, rozpätie ${eur(pz.scenarios[0].values[2])} – ${eur(pz.scenarios[2].values[2])}.`);
  return out;
}

function PrintCover({ d, lights, isClient, fin }: { d: SheetData; lights: Light[]; isClient: boolean; fin: FinResult | null }) {
  const c = d.core;
  const total = c.parcels.reduce((x, p) => x + (p.area_m2 ?? 0), 0);
  const est = c.compStats?.estimateEur ?? d.avm?.estimate_eur ?? null;
  const z = zoneOf(d);
  const kpis: [string, string][] = [
    ["Výmera", m2(total)], fin?.mortgage ? ["Hypotéka mesačne", `${eur(fin.mortgage.payment)}`] : ["Parcely", String(c.parcels.length)],
    ["List vlastníctva", c.lvs.length ? `${c.lvs.slice(0, 3).join(", ")}${c.lvs.length > 3 ? " …" : ""}` : "—"],
    ["Územný plán", z.name ? short(prettyZone(z.name.replace(/ — ÚP z výkresu, orientačné$/, " (výkres)")) ?? "", 30) : "bez zóny"],
    ["Orientačná hodnota", est ? eur(est) : "—"], ["Katastrálne územie", (c.dataset?.ku_name ?? "—").replace(/^k\.ú\.\s*/i, "")],
  ];
  return (
    <section className="ps-cover">
      <div className="ps-cover-head">
        <img src="/tl-logo.png" alt="TRI LIPY" className="ps-cover-logo" />
        <div className="ps-cover-doc">
          <div className="ps-eyebrow">List nehnuteľnosti</div>
          <div>{isClient ? "Pre klienta" : "Interná verzia"}</div>
          <div>{dateLong(d.generatedAt)}</div>
        </div>
      </div>
      <div className="ps-cover-titles">
        <div className="ps-eyebrow">{(c.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "k. ú. ")}{c.dataset?.okres ? ` · okres ${c.dataset.okres}` : ""}</div>
        <h1 className="ps-cover-title">{c.title}</h1>
        {c.celokNote ? <p className="ps-cover-note">{c.celokNote}</p> : null}
      </div>
      <div className="ps-cover-map"><ParcelSketch d={d} labels="main" /></div>
      <div className="ps-kpis">{kpis.map(([k, v]) => <div key={k} className="ps-kpi"><div className="ps-kpi-v">{v}</div><div className="ps-kpi-k">{k}</div></div>)}</div>
      <div className="ps-cover-lights">
        {lights.map((l) => (
          <div key={l.key} className="ps-light">
            <div className="ps-light-h"><span className="ps-dot" style={{ background: LIGHT_DOT[l.state] }} />{l.label}<span className="ps-light-w">{LIGHT_WORD[l.state]}</span></div>
            <div className="ps-light-t">{short(l.text, 90)}</div>
          </div>
        ))}
      </div>
      <div className="ps-cover-foot">
        <div>{d.client ? <>Pripravené pre <b>{d.client}</b></> : <>TRI LIPY · kataster a pozemky</>}</div>
        <div>Dokument {docRef(d)} · údaje katastra k {date(c.dataset?.updated_at)}</div>
      </div>
    </section>
  );
}

function PrintSummary({ d, lights, isClient, toc, fin }: { d: SheetData; lights: Light[]; isClient: boolean; toc: [string, string][]; fin: FinResult | null }) {
  const checks = checklist(d).slice(0, 7);
  const suit = suitability(d);
  return (
    <section className="ps-summary">
      <h2 className="ps-h2"><span className="ps-num">00</span><span>Zhrnutie</span></h2>
      <div className="ps-sum-cols">
        <div>
          <h3 className="ps-sub">Kľúčové zistenia</h3>
          <ul className="ps-findings">{keyFindings(d, fin).map((t, i) => <li key={i}>{t}</li>)}</ul>
          <h3 className="ps-sub">Vhodnosť podľa využitia</h3>
          <div className="ps-suit">{suit.map((x) => (
            <div key={x.key} className="ps-suit-row"><span>{x.label}</span><span className="ps-bar"><span style={{ width: `${x.score}%` }} /></span><span className="ps-suit-n">{x.score}</span></div>
          ))}</div>
        </div>
        <div>
          <h3 className="ps-sub">Semafor</h3>
          <p className="ps-sum-lead">{lightsSentence(d)}</p>
          <div className="ps-sum-lights">{lights.map((l) => (
            <div key={l.key} className="ps-sum-light"><span className="ps-dot" style={{ background: LIGHT_DOT[l.state] }} /><b>{l.label}</b> — {LIGHT_WORD[l.state]}<div>{l.text}</div></div>
          ))}</div>
        </div>
      </div>
      <h3 className="ps-sub">Čo overiť pred kúpou — výber</h3>
      <ol className="ps-checks">{checks.map((x, i) => <li key={i}><b>{x.text}</b><span> — {x.why}</span></li>)}</ol>
      <h3 className="ps-sub">Obsah dokumentu</h3>
      <ol className="ps-toc">{toc.map(([n, t]) => <li key={n}><span className="ps-num">{n}</span>{t}</li>)}</ol>
    </section>
  );
}

function printCss(title: string): string {
  return `
@page { size: A4; margin: 19mm 16mm 18mm 16mm;
  @top-left { content: "TRI LIPY  ·  LIST NEHNUTEĽNOSTI"; font: 600 6.6pt "Josefin Sans", sans-serif; letter-spacing: .24em; color: #8a8a8a; vertical-align: bottom; padding-bottom: 3mm; }
  @top-right { content: "${esc(title)}"; font: 500 6.8pt "Montserrat", sans-serif; color: #8a8a8a; vertical-align: bottom; padding-bottom: 3mm; }
  @bottom-left { content: "Orientačný podklad — nie znalecký posudok ani právne stanovisko"; font: 400 6.2pt "Montserrat", sans-serif; color: #a0a0a0; vertical-align: top; padding-top: 3mm; }
  @bottom-right { content: "Strana " counter(page) " / " counter(pages); font: 500 6.8pt "Montserrat", sans-serif; color: #6f6f6f; vertical-align: top; padding-top: 3mm; }
}
@page :first { margin: 0; @top-left { content: none } @top-right { content: none } @bottom-left { content: none } @bottom-right { content: none } }
.ps-cover, .ps-summary { display: none; }
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print, .ps-screen-only, nav, aside, header.app, footer { display: none !important; }
  .property-sheet { max-width: none !important; margin: 0 !important; padding: 0 !important; color: #333 !important; font-family: "Montserrat", ui-sans-serif, sans-serif !important; font-size: 8.4pt !important; line-height: 1.5 !important; }
  .property-sheet > * + * { margin-top: 0 !important; }
  .property-sheet *:not(svg):not(svg *) { font-size: inherit; }
  .property-sheet a { color: inherit !important; text-decoration: none !important; }
  /* titulná strana */
  .ps-cover { display: flex !important; flex-direction: column; box-sizing: border-box; width: 210mm; height: 296.5mm; padding: 17mm 18mm 14mm; break-after: page; overflow: hidden; }
  .ps-cover-head { display: flex; justify-content: space-between; align-items: flex-start; }
  .ps-cover-logo { width: 34mm; height: auto; }
  .ps-cover-doc { text-align: right; font-size: 7.6pt !important; color: #6f6f6f; line-height: 1.6; }
  .ps-eyebrow { font-family: "Josefin Sans", sans-serif; text-transform: uppercase; letter-spacing: .28em; font-size: 7.4pt !important; color: #8a8a8a; font-weight: 600; }
  .ps-cover-doc .ps-eyebrow { color: #333; margin-bottom: 1mm; }
  .ps-cover-titles { margin-top: 15mm; padding-top: 6mm; border-top: .7pt solid #333; }
  .ps-cover-title { font-family: "Josefin Sans", sans-serif !important; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; font-size: 25pt !important; line-height: 1.12; margin: 3mm 0 0; color: #2b2b2b; text-wrap: balance; }
  .ps-cover-note { margin-top: 2.5mm; color: #6f6f6f; font-size: 8pt !important; max-width: 150mm; }
  .ps-cover-map { margin-top: 7mm; }
  .ps-cover-map svg { border: none !important; border-radius: 0 !important; width: 100%; height: auto; }
  .ps-cover-map figcaption { font-size: 6.2pt !important; color: #9a9a9a; margin-top: 1.2mm; }
  .ps-kpis { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 7mm; border-top: .5pt solid #d6d6d6; }
  .ps-kpi { padding: 3.2mm 3mm 3.2mm 0; border-bottom: .5pt solid #d6d6d6; }
  .ps-kpi:nth-child(3n+2), .ps-kpi:nth-child(3n) { padding-left: 4mm; border-left: .5pt solid #d6d6d6; }
  .ps-kpi-v { font-family: "Josefin Sans", sans-serif; font-weight: 600; font-size: 13pt !important; letter-spacing: .02em; color: #2b2b2b; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .ps-kpi-k { font-family: "Josefin Sans", sans-serif; text-transform: uppercase; letter-spacing: .2em; font-size: 6.2pt !important; color: #8a8a8a; margin-top: .8mm; }
  .ps-cover-lights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm 5mm; margin-top: 7mm; }
  .ps-light-h { font-family: "Josefin Sans", sans-serif; text-transform: uppercase; letter-spacing: .14em; font-size: 7pt !important; font-weight: 600; color: #333; display: flex; align-items: center; gap: 1.6mm; }
  .ps-light-w { margin-left: auto; font-weight: 400; color: #8a8a8a; letter-spacing: .1em; }
  .ps-light-t { font-size: 6.9pt !important; color: #5a5a5a; margin-top: .8mm; line-height: 1.35; }
  .ps-dot { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 50%; flex: none; }
  .ps-cover-foot { margin-top: auto; padding-top: 4mm; border-top: .5pt solid #d6d6d6; display: flex; justify-content: space-between; font-size: 6.8pt !important; color: #7a7a7a; }
  /* zhrnutie */
  .ps-summary { display: block !important; break-after: page; }
  .ps-sum-cols { display: grid; grid-template-columns: 1.25fr 1fr; gap: 8mm; }
  .ps-findings { margin: 0; padding: 0; list-style: none; } .ps-findings li { margin: 0 0 1.5mm; padding-left: 4mm; position: relative; }
  .ps-findings li::before { content: ""; position: absolute; left: 0; top: 1.55mm; width: 1.3mm; height: 1.3mm; background: #333; }
  .ps-hist { max-width: 92mm !important; border: none !important; }
  .ps-suit-row { display: grid; grid-template-columns: 38mm 1fr 8mm; align-items: center; gap: 2mm; padding: .9mm 0; border-bottom: .3pt solid #e6e6e6; }
  .ps-bar { height: 1.6mm; background: #ececec; display: block; } .ps-bar > span { display: block; height: 100%; background: #333; }
  .ps-suit-n { text-align: right; font-variant-numeric: tabular-nums; }
  .ps-sum-light { padding: 1.4mm 0 1.6mm; border-bottom: .3pt solid #e6e6e6; } .ps-sum-light div { color: #5a5a5a; margin-left: 3.8mm; }
  .ps-sum-light .ps-dot { margin-right: 1.6mm; vertical-align: middle; }
  .ps-checks { margin: 0; padding: 0; list-style: none; counter-reset: chk; } .ps-checks li { margin-bottom: 1.4mm; padding-left: 7mm; position: relative; counter-increment: chk; }
  .ps-checks li::before { content: counter(chk, decimal-leading-zero); position: absolute; left: 0; top: 0; font-family: "Josefin Sans", sans-serif; font-weight: 300; color: #a0a0a0; }
  .ps-checks span { color: #6a6a6a; }
  .ps-checks b { font-weight: 600; }
  .ps-toc { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 10mm; } .ps-toc li { padding: .7mm 0; border-bottom: .3pt dotted #d0d0d0; break-inside: avoid; }
  .ps-toc .ps-num { display: inline-block; width: 8mm; }
  .ps-disclaimer { margin-top: 6mm; font-size: 6.6pt !important; color: #8a8a8a; max-width: 160mm; }
  /* kapitoly */
  .ps-sec { border-top: none !important; padding-top: 0 !important; margin-top: 8mm !important; break-inside: auto; }
  .ps-summary + * .ps-sec:first-child { margin-top: 0 !important; }
  .ps-h2 { font-family: "Josefin Sans", sans-serif !important; text-transform: uppercase; letter-spacing: .15em; font-weight: 600; font-size: 11.5pt !important; color: #2b2b2b !important; display: flex !important; align-items: baseline; gap: 3mm !important;
    border-bottom: .7pt solid #333; padding-bottom: 2mm; margin: 0 0 3.5mm !important; break-after: avoid; }
  .ps-num { font-weight: 300 !important; color: #a0a0a0 !important; letter-spacing: .06em; font-variant-numeric: tabular-nums; }
  .ps-body > * + * { margin-top: 3mm !important; }
  .ps-sub { font-family: "Josefin Sans", sans-serif !important; text-transform: uppercase; letter-spacing: .2em; font-size: 6.8pt !important; font-weight: 600; color: #6f6f6f !important; margin: 4.5mm 0 1.6mm !important; break-after: avoid; }
  .ps-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; column-gap: 8mm !important; }
  .ps-grid > div { border-bottom: .3pt solid #e3e3e3 !important; padding: 1mm 0 !important; break-inside: avoid; }
  .ps-grid dt { color: #7a7a7a !important; } .ps-grid dd { color: #2b2b2b; font-weight: 500; }
  .ps-tablewrap { overflow: visible !important; }
  .ps-table { border-collapse: collapse; width: 100%; font-size: 7.4pt !important; }
  .ps-table thead { display: table-header-group; }
  .ps-table thead tr { border-bottom: .7pt solid #333 !important; }
  .ps-table th { font-family: "Josefin Sans", sans-serif; text-transform: uppercase; letter-spacing: .12em; font-size: 6.1pt !important; font-weight: 600; color: #7a7a7a !important; padding: 1.2mm 2.2mm 1.2mm 0 !important; text-align: left; }
  .ps-table td { padding: 1.1mm 2.2mm 1.1mm 0 !important; border-bottom: .3pt solid #e6e6e6; vertical-align: top; }
  .ps-table tbody tr { border-bottom: none !important; break-inside: avoid; }
  .ps-muted { color: #7a7a7a !important; font-size: 7.6pt !important; }
  .ps-source { break-before: avoid-page; font-size: 6.3pt !important; color: #a0a0a0 !important; font-style: italic; margin-top: 2.5mm !important; }
  .property-sheet svg { max-width: 100%; }
  .property-sheet figure { break-inside: avoid; }
  .property-sheet .rounded-md, .property-sheet .rounded-lg { border-radius: 0 !important; }
  /* vysvetlenia pre laika, dátum údajov, nápovedy */
  .ps-explain { background: #f6f6f4 !important; border: none !important; border-left: 1.2pt solid #333 !important; padding: 2.2mm 3.2mm !important; break-inside: avoid; }
  .ps-explain-h { font-family: "Josefin Sans", sans-serif; letter-spacing: .2em !important; font-size: 6.4pt !important; color: #333 !important; margin-bottom: 1mm !important; }
  .ps-explain p { font-size: 8pt !important; line-height: 1.5 !important; color: #3a3a3a !important; margin: 0 0 .8mm !important; }
  .ps-asof { font-family: "Montserrat", sans-serif !important; text-transform: none !important; letter-spacing: 0 !important; font-size: 6.4pt !important; font-weight: 400 !important; color: #9a9a9a !important; }
  .ps-asof.ps-stale { color: #9c4a40 !important; }
  .ps-hint { font-size: 6.6pt !important; color: #8a8a8a !important; font-weight: 400 !important; }
  .ps-matrix span { font-size: 6.8pt !important; }
  .ps-sum-lead { color: #5a5a5a; margin: 0 0 1.5mm; }
}`;
}

// ——— hlavný komponent ———
export function PropertySheet({ d, mode, internal, onFinInputs }: { d: SheetData; mode: SheetMode; internal?: { actions?: ReactNode; buyers?: ReactNode; work?: ReactNode }; onFinInputs?: (p: Partial<FinInputs>) => void }) {
  const c = d.core;
  const [finIn, setFinIn] = useState<Partial<FinInputs>>(d.finInputs ?? {});
  const fin = useMemo(() => { try { return financeOf(d, d.fin ?? null, finIn); } catch { return null; } }, [d, finIn]);
  const ex = (id: string) => explain(id, d, fin);
  const setFin = (p: Partial<FinInputs>) => setFinIn((o) => { const n = { ...o, ...p }; onFinInputs?.(n); return n; });
  const kat = c.dataset?.updated_at ?? null;
  const fm = (g: string) => c.factMeta[g]?.asOf ?? null;
  const AS: Record<string, [string | null, number]> = {
    prehlad: [kat, 180], skladba: [kat, 180], vlastnictvo: [kat, 180], pravo: [kat, 180], pristup: [fm("pristup") ?? kat, 365], up: [fm("up") ?? kat, 365],
    limity: [d.generatedAt, 45], teren: [fm("teren"), 3650], klima: [fm("klima"), 3650], siete: [fm("osm"), 400], doprava: [fm("osm"), 400],
    hodnota: [kat, 180], predikcia: [d.generatedAt, 45], trh: [c.market.rent?.day ?? d.generatedAt, 21], financovanie: [d.fin?.banksAsOf ?? d.fin?.asOf ?? null, 7],
    naklady: [fin?.params.asOf ?? null, 365], poistenie: [d.generatedAt, 45], investicia: [d.generatedAt, 45], obec: [fm("obec"), 400],
  };
  const asof = (id: string) => (AS[id] ? { asOf: AS[id][0], staleDays: AS[id][1] } : {});
  const mk = mainKey(c);
  const kuKey = `ku:${c.dataset?.ku_code ?? ""}`;
  const lights = semafor(d);
  const checks = checklist(d);
  const comp = completeness(d);
  const z = zoneOf(d);
  const teren = mk ? fact(c, "teren", mk) : null;
  const elev = elevOf(teren);
  const isClient = mode === "client";
  const mainParcel = c.parcels.find((p) => p.parcel_no === c.main.parcelNo && p.register === c.main.register) ?? c.parcels[0];
  const totalArea = c.parcels.reduce((s, p) => s + (p.area_m2 ?? 0), 0);
  const flatsByLv = Object.entries(c.facts.byty ?? {}).filter(([k]) => k.startsWith("flat:"));
  const nav: [string, string][] = [["prehlad", "Prehľad"], ["skladba", "Skladba"], ["vlastnictvo", "Vlastníctvo"], ["pravo", "Právny stav"], ["pristup", "Prístup"],
    ["up", "ÚP"], ["limity", "Limity"], ["teren", "Terén a slnko"], ["klima", "Klíma"], ["siete", "Siete"], ["doprava", "Doprava"], ["hodnota", "Hodnota"], ["predikcia", "Predikcia"],
    ["trh", "Trh"], ["financovanie", "Hypotéka"], ["naklady", "Náklady a dane"], ["poistenie", "Poistenie a riziká"], ["investicia", "Výnos a vyjednávanie"], ["obec", "Obec"], ...(isClient ? [] : [["praca", "Práca"] as [string, string]]), ["overit", "Čo overiť"], ["zdroje", "Zdroje"]];

  const navIds = nav.map(([id]) => id);
  const num = (id: string) => String(navIds.indexOf(id) + 1).padStart(2, "0");
  const toc = nav.map(([id, label]) => [num(id), ({ prehlad: "Prehľad", skladba: "Skladba nehnuteľnosti", vlastnictvo: "Vlastníctvo", pravo: "Právny stav", pristup: "Prístup a susedia",
    up: "Územný plán a zastavateľnosť", limity: "Limity a riziká", teren: "Terén a slnko", klima: "Klíma a stavebné normy", siete: "Siete a energie", doprava: "Doprava a vybavenosť",
    hodnota: "Hodnota", predikcia: "Predikcia hodnoty", trh: "Trh a dopyt", financovanie: "Financovanie a hypotéka", naklady: "Náklady kúpy, vlastníctva a dane", poistenie: "Poistenie a riziká", investicia: "Výnos a vyjednávanie", obec: "Obec a ľudia", praca: "Signály a práca (interné)", overit: "Čo overiť pred kúpou", zdroje: "Zdroje a úplnosť" } as Record<string, string>)[id] ?? label] as [string, string]);

  return (
    <div className="property-sheet mx-auto max-w-4xl space-y-5 text-fg">
      <style>{printCss(c.title)}</style>
      <PrintCover d={d} lights={lights} isClient={isClient} fin={fin} />
      <PrintSummary d={d} lights={lights} isClient={isClient} toc={toc} fin={fin} />

      <header className="ps-screen-only space-y-2 border-b-2 pb-3" style={{ borderColor: "#333" }}>
        <div className="flex items-center gap-3"><img src="/tl-logo.png" alt="TRI LIPY" className="h-9 w-auto" /><div className="text-[10px] uppercase tracking-[0.22em] text-muted">list nehnuteľnosti{isClient ? "" : " · interná verzia"}</div></div>
        <h1 className="text-2xl font-semibold leading-tight">{c.title}</h1>
        <div className="text-sm text-muted">{c.subtitle}</div>
        {c.celokNote ? <div className="text-xs text-muted">{c.celokNote}</div> : null}
        {internal?.actions ? <div className="no-print pt-1">{internal.actions}</div> : null}
      </header>

      <div className="ps-screen-only space-y-5"><Lights lights={lights} /><Scores d={d} isClient={isClient} /></div>

      <nav className="no-print flex flex-wrap gap-1.5 text-xs">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded border border-line px-2 py-0.5 text-muted hover:border-ink hover:text-fg">{label}</a>)}
      </nav>

      <Sec id="prehlad" n={num("prehlad")} explain={ex("prehlad")} {...asof("prehlad")} title="Prehľad" source={<>Kataster ÚGKK SR (stav k {date(c.dataset?.updated_at)}); obrysy z katastrálnej mapy (VGI).</>}>
        <div className="ps-screen-only"><ParcelSketch d={d} /></div>
        {c.main.lat != null && c.main.lng != null ? <HistoricMap lat={c.main.lat} lng={c.main.lng} /> : null}
        <Grid rows={[
          ["Katastrálne územie", c.dataset?.ku_name ?? "—"], ["Okres", c.dataset?.okres ?? "—"],
          ["Počet parciel", String(c.parcels.length)], ["Výmera spolu", m2(totalArea)],
          ["Stavby", c.buildings.length ? String(c.buildings.length) : "—"], ["List(y) vlastníctva", c.lvs.join(", ") || "—"],
          ["Súradnice (WGS84)", c.main.lat != null && c.main.lng != null ? `${c.main.lat.toFixed(5)}, ${c.main.lng.toFixed(5)}` : "—"],
          ["Miestny názov", String(fact(c, "mapa", mk ?? "")?.miestny_nazov ?? "—")],
        ]} />
        {offices(d).length ? (<><Sub>Príslušné úrady</Sub><Grid rows={offices(d)} /></>) : null}
        {!isClient && c.main.lat != null ? <a className="no-print text-xs text-brand underline" href={`/mapa?ll=${c.main.lat},${c.main.lng}`}>Otvoriť na mape →</a> : null}
      </Sec>

      <Sec id="skladba" n={num("skladba")} explain={ex("skladba")} {...asof("skladba")} title="Skladba nehnuteľnosti" source="SPI a VGI (ÚGKK SR); zóna ÚP z našich územnoplánovacích podkladov.">
        <Table head={["Parcela", "Výmera", "Druh pozemku", "Umiestnenie", "LV", "Úloha v celku", "Zóna ÚP"]}
          rows={c.parcels.slice(0, 60).map((p) => [`${p.register === "E" ? "E " : ""}${p.parcel_no}`, m2(p.area_m2), p.use_type ?? "—", p.placement ?? "—", p.lv_no ?? "—", p.role, prettyZone(p.zone) ?? "—"])} />
        {c.parcels.length > 60 ? <Muted>… a ďalších {c.parcels.length - 60} parciel.</Muted> : null}
        {(() => {
          const rows = c.parcels.filter((p) => p.register === "C" && p.geometry_json).slice(0, 10).map((p) => [p, shapeOf(p.geometry_json)] as const).filter(([, sh]) => sh);
          return rows.length ? (<><Sub>Tvar a rozmery (z obrysu v mape)</Sub>
            <Table head={["Parcela", "Dĺžka × šírka", "Priem. šírka", "Tvar", "Os (°)", "Plocha po odstupe 2 m", "Dom 10 × 12 m"]}
              rows={rows.map(([p, sh]) => [p.parcel_no, `${sh!.dlzka} × ${sh!.sirka} m`, `${sh!.priemSirka} m`, sh!.tvar, String(sh!.osAz), m2(sh!.obalkaM2), sh!.domOk === true ? "zmestí sa" : sh!.domOk === false ? "nezmestí sa" : "hraničné"])} />
            <Muted>Orientačné z obrysu: odstup 2 m od hraníc podľa vyhl. 532/2002 § 6; ochranné pásma a regulatív ÚP môžu plochu ďalej zmenšiť. Os 0° = sever–juh, 90° = východ–západ.</Muted></>) : null;
        })()}
        {c.buildings.length ? (<><Sub>Stavby</Sub><Table head={["Stavba", "Súpisné č.", "Na parcele", "LV"]} rows={c.buildings.map((b) => [b.descr, b.sc ?? "—", b.on_parcel ?? "—", b.lv_no])} /></>) : null}
        {Object.entries(c.facts.stavby ?? {}).filter(([k]) => k.startsWith("building:")).slice(0, 10).map(([k, raw]) => [k, parseFact(raw)] as const).map(([k, v]) => (
          <div key={k}><Sub>Stavba {k.replace("building:", "").replace("sc:", "s.č. ").replace("p:", "na parcele ")}</Sub><FactsBlock grp="stavby" data={v} /></div>
        ))}
        {flatsByLv.length ? (<><Sub>Byt / nebytový priestor</Sub>{flatsByLv.slice(0, 3).map(([k, raw]) => <FactsBlock key={k} grp="byty" data={parseFact(raw)} />)}</>) : null}
        {c.kind !== "byt" && c.flats.length ? (<><Sub>Byty a nebytové priestory v dome ({c.flats.length})</Sub>
          <Table head={["Vchod", "Číslo", "Podlažie", "Druh", "Výmera", ""]} rows={c.flats.slice(0, 120).map((f) => [f.vchod ?? "—", f.cislo ?? "—", f.poschodie ?? "—", f.druh ?? "—", m2(f.vymera_m2),
            isClient ? "" : <a key="l" href={`/nehnutelnost?ds=${encodeURIComponent(c.dataset?.id ?? "")}&byt=${encodeURIComponent(f.ref)}`} className="text-brand underline">list bytu</a>])} />
          {c.flats.length > 120 ? <Muted>… a ďalších {c.flats.length - 120}.</Muted> : null}</>) : null}
        {mk && fact(c, "mapa", mk) ? (<><Sub>Z katastrálnej mapy</Sub><FactsBlock grp="mapa" data={fact(c, "mapa", mk)} /></>) : null}
        {mk && fact(c, "bpej", mk) ? (<><Sub>Pôda (BPEJ)</Sub><FactsBlock grp="bpej" data={fact(c, "bpej", mk)} /></>)
          : mainParcel?.bpej ? <Grid rows={[["BPEJ", mainParcel.bpej], ["Skupina kvality", mainParcel.bpej_skupina != null ? String(mainParcel.bpej_skupina) : "—"], ["Odvod za vyňatie (odhad)", mainParcel.odnatie_eur != null ? eur(mainParcel.odnatie_eur) : "—"]]} /> : null}
      </Sec>

      <Sec id="vlastnictvo" n={num("vlastnictvo")} explain={ex("vlastnictvo")} {...asof("vlastnictvo")} title="Vlastníctvo" source={<>Časť B LV (ÚGKK SR); nadobudnutia z titulov; finančné údaje firiem z RÚZ.{isClient ? " Mená vlastníkov sa v tejto verzii neuvádzajú." : ""}</>}>
        {c.owners.perLv.map((l) => {
          const agg = fact(c, "vlastnici", `lv:${l.lvNo}`);
          return (
            <div key={l.lvNo} className="space-y-1">
              <Sub>LV {l.lvNo} — {l.count} {l.count === 1 ? "vlastník" : l.count < 5 ? "vlastníci" : "vlastníkov"} ({l.persons} FO · {l.companies} PO)</Sub>
              {!isClient && l.owners.length ? (
                <ul className="text-xs">{l.owners.slice(0, 40).map((o, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5"><span>{o.name}{o.is_company ? <span className="ml-1 text-[10px] uppercase text-muted">firma</span> : null}</span><span className="tabular-nums text-muted">{o.share ?? ""}</span></li>
                ))}</ul>
              ) : !isClient && c.owners.access !== "full" ? <Muted>Mená vidí len rola s plným prístupom.</Muted> : null}
              <FactsBlock grp="vlastnici" data={agg} />
            </div>
          );
        })}
        {c.acquisitions.length ? (<><Sub>Ako a kedy nadobudli</Sub>
          <Table head={["LV", "Spôsob", "Zápisov", "Rok (od – do)"]} rows={c.acquisitions.map((a) => [a.lvNo, ({ inheritance: "dedičstvo", sale: "kúpa", gift: "darovanie", execution: "exekúcia / dražba" } as Record<string, string>)[a.kind] ?? a.kind, a.n, a.firstYear === a.lastYear ? a.firstYear ?? "—" : `${a.firstYear ?? "?"} – ${a.lastYear ?? "?"}`])} /></>) : null}
        {c.legalYears.length ? <Grid rows={c.legalYears.flatMap((y) => [
          [`LV ${y.lvNo} — posledná kúpa`, y.sale_max ? String(y.sale_max) : "—"] as [string, string], [`LV ${y.lvNo} — posledné dedičstvo`, y.inh_max ? String(y.inh_max) : "—"] as [string, string]])} /> : null}
        {!isClient && c.firms.length ? (<><Sub>Firmy-vlastníci — finančná sila</Sub>
          <Table head={["Firma", "Rok", "Tržby", "Majetok", "Vlastné imanie", "Výsledok", "Insolvencia"]} rows={c.firms.map((f) => [f.name ?? f.ico, f.year ?? "—", eur(f.revenue), eur(f.assets), eur(f.equity), eur(f.profit),
            f.insolvency == null ? "neoverené" : f.insolvency.konkurz + f.insolvency.restrukturalizacia + f.insolvency.likvidacia === 0 ? "bez konania"
              : <a key="r" href={`https://replik.justice.sk/ru-verejnost-web/pages/searchKonanie.xhtml?query=${f.ico}`} target="_blank" rel="noopener noreferrer" style={{ color: "#9c4a40" }} className="underline">{[f.insolvency.konkurz ? `konkurz ${f.insolvency.konkurz}` : null, f.insolvency.restrukturalizacia ? `reštrukturalizácia ${f.insolvency.restrukturalizacia}` : null, f.insolvency.likvidacia ? `likvidácia ${f.insolvency.likvidacia}` : null].filter(Boolean).join(", ")}</a>])} />
          <Muted>Insolvencia: insolvenčný register REPLIK (Ministerstvo spravodlivosti SR), len podľa IČO firmy.</Muted></>) : null}
      </Sec>

      <Sec id="pravo" n={num("pravo")} explain={ex("pravo")} {...asof("pravo")} title="Právny stav" source="Časť B a C LV, poznámky a plomby (SPI); dražby z verejných registrov dražieb; stavby bez zápisu porovnaním ZBGIS a katastra.">
        {c.legal.map((l) => (
          <div key={l.lvNo} className="space-y-1">
            <Sub>LV {l.lvNo}</Sub>
            {!l.hasData ? <Muted>O tomto LV nemáme záznam časti B/C. <b>Nie je to potvrdenie, že je bez tiarch</b> — stav je neznámy, over ho na úradnom výpise.</Muted> : (
              <>
                {l.tarchyCount === 0 ? <Muted>V našom zázname nie je zapísaná ťarcha. Pred prevodom over na úradnom výpise — záznam nemusí byť aktuálny.</Muted>
                  : <div className="text-sm font-medium" style={{ color: "#9c4a40" }}>{l.tarchyCount}× zapísaná ťarcha alebo poznámka</div>}
                {l.tarchy.length ? <ul className="text-xs">{groupLegal(l.tarchy).map((g, i) => <li key={i} className="flex justify-between border-b border-line/40 py-0.5"><span>{g.label}{g.span ? <span className="text-muted"> · {g.span}</span> : null}</span>{g.n > 1 ? <span className="text-muted">×{g.n}</span> : null}</li>)}</ul> : null}
                {l.titles.length ? <div className="text-xs text-muted">Tituly nadobudnutia: {groupLegal(l.titles).slice(0, 6).map((g) => `${g.label}${g.span ? ` (${g.span})` : ""}${g.n > 1 ? ` ×${g.n}` : ""}`).join(" · ")}</div>
                  : l.titlesCount ? <Muted>{l.titlesCount} titulov nadobudnutia.</Muted> : null}
              </>
            )}
          </div>
        ))}
        {c.flags.length ? (<><Sub>Problémy zapísané na LV</Sub><Table head={["LV", "Druh", "Rok", "Parcela"]} rows={c.flags.map((f) => [f.lvNo, f.label, f.year ?? "—", f.parcelNo ?? "—"])} /></>) : <Muted>Exekúcia, súdne konanie, konkurz, dražba ani ochrana v našom zázname nie sú.</Muted>}
        {c.auctions.length ? (<><Sub>Dražby</Sub><Table head={["Termín", "Predmet", "Najnižšie podanie", "Odhad", "Zhoda", ""]} rows={c.auctions.map((a) => [date(a.auction_date), a.property_type ?? "—", eur(a.price_min_eur), eur(a.price_estimate_eur), a.match, a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">oznámenie</a> : ""])} /></>) : null}
        {c.unregistered.length ? (<><Sub>Budovy bez zápisu v katastri</Sub><Table head={["Parcela", "Zastavaná plocha", "Počet budov", "Využitie"]} rows={c.unregistered.map((u) => [u.parcel_no, m2(u.building_m2), u.n_budov ?? "—", u.vyuzitie ?? u.kategoria ?? "—"])} /></>) : null}
        {c.parcels.some((p) => p.register === "C" && p.settled === 0) ? <Muted>Pod parcelou je pozemok registra E (iní vlastníci podľa pôvodného stavu) — vysporiadanie: {c.parcels.filter((p) => p.ekn_ref).map((p) => `${p.parcel_no} → E ${p.ekn_ref}`).join(", ")}.</Muted> : null}
      </Sec>

      <Sec id="pristup" n={num("pristup")} explain={ex("pristup")} {...asof("pristup")} title="Prístup a susedia" source="Spôsob využívania pozemkov (SPI) a spoločné hranice z katastrálnej mapy; cesty z OpenStreetMap a SSC.">
        {mk && fact(c, "pristup", mk) ? <FactsBlock grp="pristup" data={fact(c, "pristup", mk)} /> : <Muted>Prístup z verejnej cesty zatiaľ nie je spočítaný — overiť na mape a v teréne.</Muted>}
        {d.limits?.road ? <Grid rows={[["Najbližšia cesta (SSC)", `${d.limits.road.trieda}${d.limits.road.cislo ? ` ${d.limits.road.cislo}` : ""} · ${dist(d.limits.road.distM)}`]]} /> : null}
        {mk && fact(c, "susedia", mk) ? (<><Sub>Susedné parcely</Sub><FactsBlock grp="susedia" data={fact(c, "susedia", mk)} /></>) : null}
      </Sec>

      <Sec id="up" n={num("up")} explain={ex("up")} {...asof("up")} title="Územný plán a zastavateľnosť" source="Územný plán obce (vektor/WMS alebo výkres georeferencovaný v appke); regulatívy podľa ÚP alebo odvodené; dokumenty ÚP obce.">
        <Grid rows={[["Funkčná zóna", prettyZone(z.name) ?? "nemáme zónu ÚP pre parcelu"]]} />
        {mk && fact(c, "up", mk) ? (<><Sub>Zóna z výkresu ÚP (georeferencovaný výkres, orientačné)</Sub><FactsBlock grp="up" data={fact(c, "up", mk)} /></>) : null}
        {fact(c, "up", kuKey) ? <FactsBlock grp="up" data={Object.fromEntries(Object.entries(fact(c, "up", kuKey) ?? {}).filter(([k]) => ["zdroj", "dokumenty", "metoda", "presnost_m", "poznamka"].includes(k)))} /> : null}
        {d.dev ? (
          <Grid rows={[
            [d.dev.proxy ? "Regulatív (odvodený, nie z ÚP)" : "Regulatív (z ÚP)", `${d.dev.regName ?? "—"} (IZP ${d.dev.izp ?? "—"} · KZ ${d.dev.kz ?? "—"} · IPP ${d.dev.ipp ?? "—"})`],
            ["Zastavateľná plocha (IZP)", m2(d.dev.izpArea)], ["Hrubá podlažná plocha", m2(d.dev.hpp)], ["Čistá predajná plocha", m2(d.dev.cpp)],
            ["Odhad počtu bytov", d.dev.byty != null ? String(d.dev.byty) : "—"], ["Hodnota po výstavbe (GDV, orientačne)", eur(d.dev.gdv)],
          ]} />
        ) : null}
        {d.dev?.proxy ? <Muted>Zónu z územného plánu pre túto parcelu nemáme; regulatív je odvodený z druhu pozemku a umiestnenia — orientačný odhad, nie výrok ÚP.</Muted> : null}
        {d.upDocs.length ? (<><Sub>Dokumenty ÚP obce</Sub><ul className="list-disc pl-5 text-xs">{d.upDocs.slice(0, 12).map((x) => <li key={String(x.id)}><a href={x.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-brand underline">{x.title ?? "dokument"}</a></li>)}</ul></>) : null}
        {fact(c, "eia", kuKey) ? (<><Sub>Zámery EIA a plány SEA v obci (Enviroportál)</Sub><EiaBlock data={fact(c, "eia", kuKey)} /></>) : null}
        {c.obec.upChanges.length || c.obec.changes.length ? (<><Sub>Zmeny a oznámenia obce</Sub>
          <ul className="text-xs">{[...c.obec.upChanges.map((x) => ({ ...x, relevance: "up" })), ...c.obec.changes].slice(0, 8).map((x, i) => (
            <li key={i} className="border-b border-line/40 py-0.5">{date(x.detected_at)} · {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{x.title ?? "oznámenie"}</a> : x.title ?? "oznámenie"}{x.change ? <span className="text-muted"> · {x.change}</span> : null}</li>
          ))}</ul></>) : null}
      </Sec>

      <Sec id="limity" n={num("limity")} explain={ex("limity")} {...asof("limity")} title="Limity a riziká" source={<>Úradné registre: {[...new Set([...(d.limits?.items ?? []).map((h) => h.attribution), ...(d.ext ?? []).map((e) => e.attribution)])].join(", ") || "—"}. Bez prieniku = v použitej vrstve a dostupnom pokrytí sa nič nenašlo.</>}>
        {d.limits?.items.length ? (
          <Table head={["Register", "Výsledok"]} rows={d.limits.items.map((h) => [
            <span key="l">{h.label}{h.names?.length ? <span className="text-muted"> · {h.names.slice(0, 2).join(", ")}</span> : null}</span>,
            <span key="r" style={{ color: h.error ? "#888" : h.hit ? "#9c4a40" : "#3f5a3c" }}>{h.error ? "nedostupné" : h.hit ? `zásah${h.count > 1 ? ` (${h.count}×)` : ""}` : "bez prieniku"}</span>])} />
        ) : <Muted>Registre limitov sa nepodarilo načítať.</Muted>}
        {d.limits?.landPrice ? <Grid rows={[["Úradná cena poľnohospodárskej pôdy", `${nf(d.limits.landPrice.eurM2, 2)} €/m² (${d.limits.landPrice.attribution})`]]} /> : null}
        {d.ext?.length ? <ExtBlock items={d.ext} /> : null}
      </Sec>

      <Sec id="teren" n={num("teren")} explain={ex("teren")} {...asof("teren")} title="Terén a slnko" source="Digitálny model reliéfu DMR 5.0 (ÚGKK SR, CC BY 4.0); poloha slnka (výpočet NOAA) s horizontom z terénu.">
        {teren ? <FactsBlock grp="teren" data={teren} /> : <Muted>Terén pre parcelu zatiaľ nie je spočítaný.</Muted>}
        {mk && fact(c, "slnko", mk) ? (<><Sub>Slnko</Sub>
          <HorizonChart hor={fact(c, "slnko", mk)?.hor} lat={c.main.lat} />
          <FactsBlock grp="slnko" data={fact(c, "slnko", mk)} skip={["hor"]} /></>) : null}
      </Sec>

      <Sec id="klima" n={num("klima")} explain={ex("klima")} {...asof("klima")} title="Klíma a stavebné normy" source={<>{c.factMeta.klima?.source ?? "NASA POWER, PVGIS (EÚ JRC)"}; normy STN EN (národné prílohy).</>}>
        {fact(c, "klima", kuKey) ? <KlimaBlock data={fact(c, "klima", kuKey) as Record<string, unknown>} elev={elev} /> : <Muted>Klimatické údaje pre lokalitu zatiaľ nie sú spočítané.</Muted>}
        {fact(c, "normy", kuKey) ? (<><Sub>Stavebné normy lokality</Sub><BandsBlock grp="normy" data={fact(c, "normy", kuKey) as Record<string, unknown>} elev={elev} skip={["elev_range"]} /></>) : null}
      </Sec>

      <Sec id="siete" n={num("siete")} explain={ex("siete")} {...asof("siete")} title="Siete a energie" source="OpenStreetMap (© prispievatelia OSM), údaje o obci (vodovody, kanalizácie, plyn); presné trasy sietí potvrdí len vyjadrenie správcu.">
        {mk && fact(c, "osm", mk) ? (<>
          <FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_NET} />
          <Sub>Ochranné pásma a okolie</Sub>
          <FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_ZONES} />
        </>) : <Muted>Siete z OpenStreetMap pre parcelu zatiaľ nie sú spočítané.</Muted>}
        {fact(c, "obec", kuKey) ? <FactsBlock grp="obec" data={Object.fromEntries(Object.entries(fact(c, "obec", kuKey) ?? {}).filter(([k]) => /vod|kanal|cov|plyn|distrib|elektr|stocn|voda/i.test(k)))} /> : null}
        {connectionLength(d) != null ? <Grid rows={[["Orientačná dĺžka prípojok (od cesty, kde siete spravidla vedú)", `~${connectionLength(d)} m`]]} /> : null}
        <Muted>Existenciu a polohu sietí potvrdí správca vo „vyjadrení k existencii sietí" (elektrina, plyn, voda, telekomunikácie); cenu prípojok určí projekt a cenník správcu.</Muted>
      </Sec>

      <Sec id="doprava" n={num("doprava")} explain={ex("doprava")} {...asof("doprava")} title="Doprava a vybavenosť" source="OpenStreetMap; časy jazdy odhadom po cestnej sieti.">
        {d.access ? (
          <div className="grid grid-cols-2 gap-x-6 text-xs sm:grid-cols-3">
            {[...Object.entries(d.access.transport), ...Object.entries(d.access.amenities), ...Object.entries(d.access.infra)].filter(([, v]) => v).slice(0, 18).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line/40 py-0.5"><span className="text-muted">{k}</span><span className="tabular-nums">{dist(v?.dist)}</span></div>
            ))}
          </div>
        ) : null}
        {mk && fact(c, "osm", mk) ? (<>
          <Sub>Čas autom</Sub><FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_TIME} />
          <Sub>Prístupová cesta</Sub><FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_ROAD} />
          <Sub>Vybavenosť (vzdušnou čiarou)</Sub><FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_AMEN} />
        </>) : null}
        {!d.access && !(mk && fact(c, "osm", mk)) ? <Muted>Dostupnosť sa nepodarilo načítať.</Muted> : null}
        {c.main.lat != null && c.main.lng != null ? (
          <p className="text-xs text-muted">Hodnotenie škôl v okolí: <a href={`https://skoly.ineko.sk/prehlad?typ_id=ZS&max_vzdialenost=10&center_x=${c.main.lng}&center_y=${c.main.lat}`} target="_blank" rel="noopener noreferrer" className="text-brand underline">INEKO (ZŠ do 10 km)</a>
            {" · "}Hluk z dopravy: <a href="https://www.hlukovamapa.sk/" target="_blank" rel="noopener noreferrer" className="text-brand underline">strategické hlukové mapy</a> (len obrázky, preto len odkaz)</p>
        ) : null}
      </Sec>

      <Sec id="hodnota" n={num("hodnota")} explain={ex("hodnota")} {...asof("hodnota")} title="Hodnota" source="Ceny zo zmlúv zapísaných v katastri (SPI, od 2019); automatický odhad z ponúk a predajov v okrese; ponuky z verejnej inzercie. Orientačné — nie znalecký posudok.">
        <Grid rows={[
          ["Odhad podľa skutočných predajov v okolí", c.compStats?.estimateEur ? `${eur(c.compStats.estimateEur)}${c.compStats.basisM2 && c.compStats.medPpm2 ? ` (${nf(c.compStats.medPpm2)} €/m² × ${nf(c.compStats.basisM2)} m²)` : ""}` : "—"],
          ["Rozpätie €/m² (25.–75. percentil)", c.compStats?.p25 != null && c.compStats?.p75 != null ? `${nf(c.compStats.p25)}–${nf(c.compStats.p75)} €/m²` : "—"],
          ["Automatický odhad (AVM)", d.avm?.estimate_eur != null ? `${eur(d.avm.estimate_eur)} (${eur(d.avm.low_eur)}–${eur(d.avm.high_eur)}) · spoľahlivosť ${d.avm.confidence}` : "—"],
          ["Medián ponúk pozemkov v okrese", d.medPoz ? `${nf(d.medPoz)} €/m²` : "—"],
          ["Úradná cena pôdy (VÚPOP)", d.limits?.landPrice ? `${nf(d.limits.landPrice.eurM2, 2)} €/m²` : "—"],
          ["Dostupnosť (odhad ÷ ročná hrubá mzda v okrese)", (() => { const w = Number(fact(c, "obec", kuKey)?.mzda_okres_eur ?? 0); const e = c.compStats?.estimateEur ?? d.avm?.estimate_eur ?? null; return w > 0 && e ? `${nf(e / (w * 12), 1)} ročných miezd (mzda ${nf(w)} €/mes.)` : "—"; })()],
        ]} />
        {c.comparables.length ? (<><Sub>Porovnateľné predaje zo zmlúv ({c.compStats?.kind})</Sub>
          <Table head={["Dátum zmluvy", "K.ú.", "Položky", "Výmera", "Cena v zmluve", "€/m²", "Vzdialenosť"]}
            rows={c.comparables.map((x) => [date(x.cas), x.ku ?? "—", (x.items ?? "").slice(0, 40), m2(x.land_m2 ?? x.flat_m2), eur(x.cen), x.ppm2 ? nf(x.ppm2) : "—", dist(x.distM)])} /></>)
          : <Muted>V okrese sme nenašli dosť porovnateľných zmlúv.</Muted>}
        {c.market.trend.length ? (<><Sub>Vývoj cien zo zmlúv v okrese ({c.compStats?.kind ?? "rovnaký druh"})</Sub>
          <Table head={["Rok", "Zmlúv", "Medián €/m²", "Medián ceny"]} rows={c.market.trend.map((t) => [t.year, t.n, t.medPpm2 != null ? nf(t.medPpm2) : "—", eur(t.medCen)])} /></>) : null}
        {c.market.kuSales.length ? <Grid rows={[["Predaje rovnakého druhu v tomto k.ú. (zmluvy za rok)", c.market.kuSales.slice(-5).map((k) => `${k.year}: ${k.n}`).join(" · ")]]} /> : null}
        {c.prices.length ? (<><Sub>Zmluvy s cenou na tomto LV</Sub>
          <Table head={["Dátum", "LV", "Druh", "Položky", "Cena v zmluve", "€/m²"]} rows={c.prices.map((p) => [date(p.cas), p.lvNo, p.kind, (p.items ?? "").slice(0, 40), eur(p.cen), p.ppm2 ? nf(p.ppm2) : "—"])} /></>) : null}
      </Sec>

      <Sec id="predikcia" n={num("predikcia")} explain={ex("predikcia")} {...asof("predikcia")} title="Predikcia hodnoty" source={<>Trend cien zo zmlúv v katastri (okres), mzdy v okrese (ŠÚ SR), index cien bývania a inflácia (ECB/Eurostat){fin?.market?.hpi ? ` — ${fin.market.hpi.period}` : ""}. Modelový výpočet, nie prísľub ceny.</>}>
        {fin ? <PredictionBody fin={fin} trend={c.market.trend} /> : <Muted>Na predikciu chýbajú údaje.</Muted>}
      </Sec>

      <Sec id="trh" n={num("trh")} explain={ex("trh")} {...asof("trh")} title="Trh a dopyt" source="Verejná inzercia (denný zber), satelitné snímky Copernicus (nová zástavba), Centrálny register zmlúv.">
        {c.listings.length ? (<><Sub>Pravdepodobne táto nehnuteľnosť v inzercii (priradené podľa výmery a polohy — overiť)</Sub>
          <Table head={["Inzerát", "Cena", "€/m²", "Od", "Naposledy", "Vývoj ceny", "Istota"]} rows={c.listings.map((l) => [
            l.url ? <a key="u" href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{(l.title ?? "inzerát").slice(0, 40)}</a> : l.title ?? "inzerát",
            eur(l.price_eur), l.ppm2 ? nf(l.ppm2) : "—", date(l.first_seen), l.removed ? "stiahnutý" : date(l.last_seen),
            l.history.length > 1 ? `${eur(l.history[0].price_eur)} → ${eur(l.history[l.history.length - 1].price_eur)}` : "—", l.confidence ?? "—"])} /></>) : null}
        {c.nearby.length ? (<><Sub>Ponuky rovnakého typu v okolí</Sub>
          <Table head={["Inzerát", "Vzdialenosť", "Výmera", "Cena", "€/m²", "Naposledy"]} rows={c.nearby.map((l) => [
            l.url ? <a key="u" href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{(l.title ?? "inzerát").slice(0, 44)}</a> : l.title ?? "inzerát",
            dist(l.distM), m2(l.area_m2), eur(l.price_eur), l.ppm2 ? nf(l.ppm2) : "—", date(l.last_seen)])} /></>) : <Muted>V okolí nie sú aktívne ponuky rovnakého typu.</Muted>}
        <Grid rows={[
          ["Nová zástavba v k.ú. (satelit)", c.construction.ku?.new_ha != null ? `${nf(c.construction.ku.new_ha, 1)} ha za ${c.construction.ku.period ?? "2018–2024"}` : "—"],
          ["Ohniská novej zástavby do 1 km", c.construction.near.n ? `${c.construction.near.n} (${m2(c.construction.near.area_m2)})` : "—"],
          ["Zmluvy štátu o pozemkoch v k.ú. (CRZ)", c.stateContracts.n ? String(c.stateContracts.n) : "—"],
          ["Bežná doba predaja v okrese (medián, posledný rok)", c.market.domDays?.median != null ? `${c.market.domDays.median} dní (${c.market.domDays.n} inzerátov)` : "—"],
          ["Nájom vs. predaj v okrese", c.market.rent ? `${c.market.rent.rentM2 != null ? `${nf(c.market.rent.rentM2, 1)} €/m²/mes.` : "—"} · ${c.market.rent.saleM2 != null ? `${nf(c.market.rent.saleM2)} €/m²` : "—"}${c.market.rent.yieldPct != null ? ` · hrubý výnos ~${nf(c.market.rent.yieldPct, 1)} % ročne` : ""}` : "—"],
          ["Konkurencia: voľné stavebné pozemky v k.ú. (naše scenáre)", c.market.freePlots.landsearch + c.market.freePlots.up ? `${c.market.freePlots.landsearch} príležitostí · ${c.market.freePlots.up} pôda na bývanie` : "—"],
        ]} />
        {c.market.buildingMix.length ? (<><Sub>Zástavba v k.ú. (stavby v katastri)</Sub><div className="text-xs text-muted">{c.market.buildingMix.map((b) => `${b.druh} ${nf(b.n)}`).join(" · ")}</div></>) : null}
        {!isClient && internal?.buyers ? (<><Sub>Kto by mohol kúpiť</Sub>{internal.buyers}</>) : null}
      </Sec>

      <Sec id="financovanie" n={num("financovanie")} explain={ex("financovanie")} {...asof("financovanie")} title="Financovanie a hypotéka" source={fin ? finSourcesText(fin) : "—"}>
        {fin ? <><FinInputsPanel fin={fin} set={setFin} /><FinancingBody fin={fin} isClient={isClient} /></> : <Muted>Výpočet financovania sa nepodaril.</Muted>}
      </Sec>

      <Sec id="naklady" n={num("naklady")} explain={ex("naklady")} {...asof("naklady")} title="Náklady kúpy, vlastníctva a dane" source="Zákon 145/1995 (vklad), zákon 582/2004 a VZN obce (daň z nehnuteľností, odpad), zákon 595/2003 (daň z príjmov), zákon 222/2004 (DPH); cenníky služieb a správcov sietí — orientačne.">
        {fin ? <CostsBody fin={fin} /> : <Muted>—</Muted>}
      </Sec>

      <Sec id="poistenie" n={num("poistenie")} explain={ex("poistenie")} {...asof("poistenie")} title="Poistenie a riziká" source="Riziká z úradných registrov v tomto liste (záplavy, zosuvy, radón, seizmicita STN EN 1998, kriminalita MV SR, hasiči OSM); náklady obnovy stavby a sadzby poistného — modelový odhad.">
        {fin ? <InsuranceBody fin={fin} /> : <Muted>—</Muted>}
      </Sec>

      <Sec id="investicia" n={num("investicia")} explain={ex("investicia")} {...asof("investicia")} title="Výnos a vyjednávanie" source="Nájmy a ponuky z verejnej inzercie (denný zber), náklady z tohto listu, regulatív ÚP a náklady výstavby; dane zjednodušene. Nie investičné poradenstvo.">
        {fin ? <InvestBody fin={fin} /> : <Muted>—</Muted>}
      </Sec>

      <Sec id="obec" n={num("obec")} explain={ex("obec")} {...asof("obec")} title="Obec a ľudia" source={<>{c.factMeta.obec?.source ?? "Štatistický úrad SR, ÚPSVR, MV SR"}.</>}>
        {fact(c, "obec", kuKey) ? <FactsBlock grp="obec" data={fact(c, "obec", kuKey)} /> : <Muted>Údaje o obci zatiaľ nie sú načítané.</Muted>}
      </Sec>

      {!isClient ? (
        <Sec id="praca" n={num("praca")} explain={ex("praca")} {...asof("praca")} title="Signály a práca (interné)" source="Scenáre appky (vysporiadanie, príležitosti, zdedené byty, pôda na bývanie, zadania), evidencia obchodov a kontaktov.">
          <ul className="text-xs">
            {c.signals.settlement.map((s, i) => <li key={`s${i}`} className="border-b border-line/40 py-0.5"><b>Vysporiadanie</b> — {s.classification === "MATCH" ? "kandidát" : "na preskúmanie"} · parcela {s.parcel_no}{s.buyout_eur ? ` · odkup ~${eur(s.buyout_eur)}` : ""}</li>)}
            {c.signals.landsearch.map((s, i) => <li key={`l${i}`} className="border-b border-line/40 py-0.5"><b>Príležitosť</b> — {s.purpose ?? "?"} · {s.verdict ?? "?"}{s.quality != null ? ` · skóre ${Math.round(s.quality)}` : ""}</li>)}
            {c.signals.za.map((s, i) => <li key={`z${i}`} className="border-b border-line/40 py-0.5"><b>Zdedený byt</b> — {s.classification ?? "?"}{s.reason ? ` · ${s.reason}` : ""}</li>)}
            {c.signals.up.map((s, i) => <li key={`u${i}`} className="border-b border-line/40 py-0.5"><b>Pôda na bývanie</b> — zóna {s.zone ?? "?"} · {s.classification ?? "?"}{s.naklad_vynatie_eur ? ` · vyňatie ~${eur(s.naklad_vynatie_eur)}` : ""}</li>)}
            {c.signals.briefs.map((s, i) => <li key={`b${i}`} className="border-b border-line/40 py-0.5"><b>Zadanie #{s.brief_id}</b> — {s.verdict}{s.quality != null ? ` · ${Math.round(s.quality)}` : ""}</li>)}
            {c.signals.deal ? <li className="border-b border-line/40 py-0.5"><b>Obchod v pipeline</b> — stav {c.signals.deal.status}</li> : null}
            {c.signals.cases.map((s) => <li key={`c${s.id}`} className="border-b border-line/40 py-0.5"><b>Prípad #{s.id}</b> — {s.title} · {s.status}</li>)}
          </ul>
          {!c.signals.settlement.length && !c.signals.landsearch.length && !c.signals.za.length && !c.signals.up.length && !c.signals.briefs.length && !c.signals.deal && !c.signals.cases.length ? <Muted>Žiadny scenár ani obchod k tejto nehnuteľnosti.</Muted> : null}
          <Grid rows={[["Záznamy kontaktu", c.work.contacts ? `${c.work.contacts}× (naposledy ${date(c.work.lastContact)})` : "—"], ["Najbližší krok", date(c.work.nextAt)], ["Komentáre", c.work.comments ? String(c.work.comments) : "—"], ["Dokumenty", c.work.documents ? String(c.work.documents) : "—"]]} />
          {internal?.work}
        </Sec>
      ) : null}

      <Sec id="overit" n={num("overit")} explain={ex("overit")} {...asof("overit")} title="Čo overiť pred kúpou" source="Zostavené automaticky zo zistení v tomto liste — nie je to právne poradenstvo.">
        <ol className="list-decimal space-y-1 pl-5 text-sm">{checks.map((x, i) => <li key={i}>{x.text}<span className="text-xs text-muted"> — {x.why}</span></li>)}</ol>
      </Sec>

      <Sec id="zdroje" n={num("zdroje")} explain={ex("zdroje")} {...asof("zdroje")} title="Zdroje a úplnosť">
        <Grid rows={[
          ["Úplnosť listu", `${comp.have} z ${comp.total} oblastí s údajmi`],
          ["Chýba", comp.missing.join(", ") || "—"],
          ["Kataster (snapshot)", date(c.dataset?.updated_at)],
          ...Object.entries(c.factMeta).map(([g, m]) => [FACT_GROUP_LABEL[g] ?? g, `${m.source ?? "—"}${m.asOf ? ` · ${date(m.asOf)}` : ""}`] as [string, string]),
          ["Vygenerované", new Date(d.generatedAt).toLocaleString("sk-SK")],
        ]} />
        <p className="text-[10px] leading-snug text-muted">
          List je orientačný podklad z verejných a katastrálnych dát — nie znalecký posudok, právny ani geodetický záver.
          Údaje „odvodené" sú výpočty appky; „nevieme" znamená, že zdroj chýba, nie že je všetko v poriadku.{isClient ? " Mená vlastníkov sa v tejto verzii neuvádzajú." : ""}
        </p>
      </Sec>
    </div>
  );
}
