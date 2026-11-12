// LIST NEHNUTEĽNOSTI — vykreslenie (interná aj klientska verzia). Dáta pripraví route /nehnutelnost (interná,
// živé) alebo /n/$token (klientska, snapshot bez mien a internej práce). Komponent nič nenačítava zo servera —
// interné widgety (kupci, komentáre, dokumenty, kontakt) dostane cez `internal`. Zásady: chýbajúci údaj je
// NEZNÁMY stav; každá sekcia uvádza zdroj; formulácie podľa phrases.ts (Property-360 §4).
import type { ReactNode } from "react";
import { FACT_GROUP_LABEL, FACT_SCHEMA, type FactField } from "../lib/facts-schema";
import { checklist, completeness, connectionLength, fact, mainKey, offices, parseFact, sellPropensity, semafor, shapeOf, suitability, zoneOf, type Light, type SheetData } from "../lib/property-eval";

export type SheetMode = "internal" | "client";
const nf = (n: number, d = 0) => n.toLocaleString("sk-SK", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const eur = (n: number | null | undefined) => (n == null ? "—" : `${nf(Math.round(n))} €`);
const m2 = (n: number | null | undefined) => (n == null ? "—" : `${nf(Math.round(n))} m²`);
const dist = (m: number | null | undefined) => (m == null ? "—" : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${nf(m / 1000, 1)} km`);
const date = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join(". ") : "—");

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

// ——— stavebné bloky ———
function Sec({ id, title, source, children }: { id: string; title: string; source?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="break-inside-avoid-page scroll-mt-16 border-t border-line pt-4">
      <h2 className="mb-2 text-base font-semibold text-fg">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
      {source ? <div className="mt-2 text-[10px] leading-snug text-muted">Zdroj: {source}</div> : null}
    </section>
  );
}
function Muted({ children }: { children: ReactNode }) { return <p className="text-xs text-muted">{children}</p>; }
function Sub({ children }: { children: ReactNode }) { return <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</h3>; }
function Grid({ rows }: { rows: [ReactNode, ReactNode][] }) {
  const r = rows.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (!r.length) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {r.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-line/40 py-0.5">
          <dt className="text-muted">{k}</dt><dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-line text-left text-muted">{head.map((h, i) => <th key={i} className="py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/40 align-top">{r.map((c, j) => <td key={j} className="py-1 pr-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ——— predpočítané údaje (property_facts) — popisy zo schém Mac modulov ———
const human = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
function fmtVal(v: unknown, f?: FactField): ReactNode {
  if (v == null || v === "") return "—";
  const unit = f?.unit ? ` ${f.unit}` : "";
  if (typeof v === "boolean") return v ? "áno" : "nie";
  if (typeof v === "number") return `${nf(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0)}${unit}`;
  if (typeof v === "string") return `${v}${unit && !/[a-zA-Z€%°]$/.test(v) ? unit : ""}`;
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    if (v.every((x) => x == null || typeof x !== "object")) return v.map((x) => String(x)).join(", ");
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
    .filter(([k, v]) => !skip.includes(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length));
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
export function ParcelSketch({ d }: { d: SheetData }) {
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
          fill={isMain(p.parcel_no, p.register) ? "rgba(255,190,90,.22)" : p.register === "E" ? "rgba(120,150,230,.18)" : "rgba(255,255,255,.12)"}
          stroke={isMain(p.parcel_no, p.register) ? "#ffb347" : "#fff"} strokeWidth={isMain(p.parcel_no, p.register) ? 2.5 : 1.2} />
      )))}
      {ps.length <= 30 ? ps.map((p) => {
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
  const h = 650;
  const src = `https://zbgisws.skgeodesy.sk/hm_III_vm/service.svc/get?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=1&STYLES=&CRS=EPSG:3857&BBOX=${(mx - h).toFixed(1)},${(my - h).toFixed(1)},${(mx + h).toFixed(1)},${(my + h).toFixed(1)}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg`;
  return (
    <figure className="space-y-1">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-md border border-line bg-surface-2">
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

// ——— hlavný komponent ———
export function PropertySheet({ d, mode, internal }: { d: SheetData; mode: SheetMode; internal?: { actions?: ReactNode; buyers?: ReactNode; work?: ReactNode } }) {
  const c = d.core;
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
    ["up", "ÚP"], ["limity", "Limity"], ["teren", "Terén a slnko"], ["klima", "Klíma"], ["siete", "Siete"], ["doprava", "Doprava"], ["hodnota", "Hodnota"],
    ["trh", "Trh"], ["obec", "Obec"], ...(isClient ? [] : [["praca", "Práca"] as [string, string]]), ["overit", "Čo overiť"], ["zdroje", "Zdroje"]];

  return (
    <div className="property-sheet mx-auto max-w-4xl space-y-5 text-fg">
      <style>{`@media print { .no-print { display:none !important } header, nav, aside, footer { display:none !important } .property-sheet { max-width:none } a { color:inherit; text-decoration:none } section { page-break-inside: auto } }`}</style>

      <header className="space-y-2 border-b-2 pb-3" style={{ borderColor: "#333" }}>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted">TRI LIPY · list nehnuteľnosti{isClient ? "" : " · interná verzia"}</div>
        <h1 className="text-2xl font-semibold leading-tight">{c.title}</h1>
        <div className="text-sm text-muted">{c.subtitle}</div>
        {c.celokNote ? <div className="text-xs text-muted">{c.celokNote}</div> : null}
        {internal?.actions ? <div className="no-print pt-1">{internal.actions}</div> : null}
      </header>

      <Lights lights={lights} />
      <Scores d={d} isClient={isClient} />

      <nav className="no-print flex flex-wrap gap-1.5 text-xs">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded border border-line px-2 py-0.5 text-muted hover:border-ink hover:text-fg">{label}</a>)}
      </nav>

      <Sec id="prehlad" title="Prehľad" source={<>Kataster ÚGKK SR (stav k {date(c.dataset?.updated_at)}); obrysy z katastrálnej mapy (VGI).</>}>
        <ParcelSketch d={d} />
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

      <Sec id="skladba" title="Skladba nehnuteľnosti" source="SPI a VGI (ÚGKK SR); zóna ÚP z našich územnoplánovacích podkladov.">
        <Table head={["Parcela", "Výmera", "Druh pozemku", "Umiestnenie", "LV", "Úloha v celku", "Zóna ÚP"]}
          rows={c.parcels.slice(0, 60).map((p) => [`${p.register === "E" ? "E " : ""}${p.parcel_no}`, m2(p.area_m2), p.use_type ?? "—", p.placement ?? "—", p.lv_no ?? "—", p.role, p.zone ?? "—"])} />
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

      <Sec id="vlastnictvo" title="Vlastníctvo" source={<>Časť B LV (ÚGKK SR); nadobudnutia z titulov; finančné údaje firiem z RÚZ.{isClient ? " Mená vlastníkov sa v tejto verzii neuvádzajú." : ""}</>}>
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
          <Table head={["Firma", "Rok", "Tržby", "Majetok", "Vlastné imanie", "Výsledok"]} rows={c.firms.map((f) => [f.name ?? f.ico, f.year ?? "—", eur(f.revenue), eur(f.assets), eur(f.equity), eur(f.profit)])} /></>) : null}
      </Sec>

      <Sec id="pravo" title="Právny stav" source="Časť B a C LV, poznámky a plomby (SPI); dražby z verejných registrov dražieb; stavby bez zápisu porovnaním ZBGIS a katastra.">
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

      <Sec id="pristup" title="Prístup a susedia" source="Spôsob využívania pozemkov (SPI) a spoločné hranice z katastrálnej mapy; cesty z OpenStreetMap a SSC.">
        {mk && fact(c, "pristup", mk) ? <FactsBlock grp="pristup" data={fact(c, "pristup", mk)} /> : <Muted>Prístup z verejnej cesty zatiaľ nie je spočítaný — overiť na mape a v teréne.</Muted>}
        {d.limits?.road ? <Grid rows={[["Najbližšia cesta (SSC)", `${d.limits.road.trieda}${d.limits.road.cislo ? ` ${d.limits.road.cislo}` : ""} · ${dist(d.limits.road.distM)}`]]} /> : null}
        {mk && fact(c, "susedia", mk) ? (<><Sub>Susedné parcely</Sub><FactsBlock grp="susedia" data={fact(c, "susedia", mk)} /></>) : null}
      </Sec>

      <Sec id="up" title="Územný plán a zastavateľnosť" source="Územný plán obce (vektor/WMS alebo výkres georeferencovaný v appke); regulatívy podľa ÚP alebo odvodené; dokumenty ÚP obce.">
        <Grid rows={[["Funkčná zóna", z.name ?? "nemáme zónu ÚP pre parcelu"]]} />
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

      <Sec id="limity" title="Limity a riziká" source={<>Úradné registre: {[...new Set([...(d.limits?.items ?? []).map((h) => h.attribution), ...(d.ext ?? []).map((e) => e.attribution)])].join(", ") || "—"}. Bez prieniku = v použitej vrstve a dostupnom pokrytí sa nič nenašlo.</>}>
        {d.limits?.items.length ? (
          <Table head={["Register", "Výsledok"]} rows={d.limits.items.map((h) => [
            <span key="l">{h.label}{h.names?.length ? <span className="text-muted"> · {h.names.slice(0, 2).join(", ")}</span> : null}</span>,
            <span key="r" style={{ color: h.error ? "#888" : h.hit ? "#9c4a40" : "#3f5a3c" }}>{h.error ? "nedostupné" : h.hit ? `zásah${h.count > 1 ? ` (${h.count}×)` : ""}` : "bez prieniku"}</span>])} />
        ) : <Muted>Registre limitov sa nepodarilo načítať.</Muted>}
        {d.limits?.landPrice ? <Grid rows={[["Úradná cena poľnohospodárskej pôdy", `${nf(d.limits.landPrice.eurM2, 2)} €/m² (${d.limits.landPrice.attribution})`]]} /> : null}
        {d.ext?.length ? <ExtBlock items={d.ext} /> : null}
      </Sec>

      <Sec id="teren" title="Terén a slnko" source="Digitálny model reliéfu DMR 5.0 (ÚGKK SR, CC BY 4.0); poloha slnka (výpočet NOAA) s horizontom z terénu.">
        {teren ? <FactsBlock grp="teren" data={teren} /> : <Muted>Terén pre parcelu zatiaľ nie je spočítaný.</Muted>}
        {mk && fact(c, "slnko", mk) ? (<><Sub>Slnko</Sub>
          <HorizonChart hor={fact(c, "slnko", mk)?.hor} lat={c.main.lat} />
          <FactsBlock grp="slnko" data={fact(c, "slnko", mk)} skip={["hor"]} /></>) : null}
      </Sec>

      <Sec id="klima" title="Klíma a stavebné normy" source={<>{c.factMeta.klima?.source ?? "NASA POWER, PVGIS (EÚ JRC)"}; normy STN EN (národné prílohy).</>}>
        {fact(c, "klima", kuKey) ? <KlimaBlock data={fact(c, "klima", kuKey) as Record<string, unknown>} elev={elev} /> : <Muted>Klimatické údaje pre lokalitu zatiaľ nie sú spočítané.</Muted>}
        {fact(c, "normy", kuKey) ? (<><Sub>Stavebné normy lokality</Sub><BandsBlock grp="normy" data={fact(c, "normy", kuKey) as Record<string, unknown>} elev={elev} skip={["elev_range"]} /></>) : null}
      </Sec>

      <Sec id="siete" title="Siete a energie" source="OpenStreetMap (© prispievatelia OSM), údaje o obci (vodovody, kanalizácie, plyn); presné trasy sietí potvrdí len vyjadrenie správcu.">
        {mk && fact(c, "osm", mk) ? (<>
          <FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_NET} />
          <Sub>Ochranné pásma a okolie</Sub>
          <FactsBlock grp="osm" data={fact(c, "osm", mk)} only={OSM_ZONES} />
        </>) : <Muted>Siete z OpenStreetMap pre parcelu zatiaľ nie sú spočítané.</Muted>}
        {fact(c, "obec", kuKey) ? <FactsBlock grp="obec" data={Object.fromEntries(Object.entries(fact(c, "obec", kuKey) ?? {}).filter(([k]) => /vod|kanal|cov|plyn|distrib|elektr|stocn|voda/i.test(k)))} /> : null}
        {connectionLength(d) != null ? <Grid rows={[["Orientačná dĺžka prípojok (od cesty, kde siete spravidla vedú)", `~${connectionLength(d)} m`]]} /> : null}
        <Muted>Existenciu a polohu sietí potvrdí správca vo „vyjadrení k existencii sietí" (elektrina, plyn, voda, telekomunikácie); cenu prípojok určí projekt a cenník správcu.</Muted>
      </Sec>

      <Sec id="doprava" title="Doprava a vybavenosť" source="OpenStreetMap; časy jazdy odhadom po cestnej sieti.">
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

      <Sec id="hodnota" title="Hodnota" source="Ceny zo zmlúv zapísaných v katastri (SPI, od 2019); automatický odhad z ponúk a predajov v okrese; ponuky z verejnej inzercie. Orientačné — nie znalecký posudok.">
        <Grid rows={[
          ["Odhad podľa skutočných predajov v okolí", c.compStats?.estimateEur ? `${eur(c.compStats.estimateEur)}${c.compStats.basisM2 && c.compStats.medPpm2 ? ` (${nf(c.compStats.medPpm2)} €/m² × ${nf(c.compStats.basisM2)} m²)` : ""}` : "—"],
          ["Rozpätie €/m² (25.–75. percentil)", c.compStats?.p25 != null && c.compStats?.p75 != null ? `${nf(c.compStats.p25)}–${nf(c.compStats.p75)} €/m²` : "—"],
          ["Automatický odhad (AVM)", d.avm?.estimate_eur != null ? `${eur(d.avm.estimate_eur)} (${eur(d.avm.low_eur)}–${eur(d.avm.high_eur)}) · spoľahlivosť ${d.avm.confidence}` : "—"],
          ["Medián ponúk pozemkov v okrese", d.medPoz ? `${nf(d.medPoz)} €/m²` : "—"],
          ["Úradná cena pôdy (VÚPOP)", d.limits?.landPrice ? `${nf(d.limits.landPrice.eurM2, 2)} €/m²` : "—"],
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

      <Sec id="trh" title="Trh a dopyt" source="Verejná inzercia (denný zber), satelitné snímky Copernicus (nová zástavba), Centrálny register zmlúv.">
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

      <Sec id="obec" title="Obec a ľudia" source={<>{c.factMeta.obec?.source ?? "Štatistický úrad SR, ÚPSVR, MV SR"}.</>}>
        {fact(c, "obec", kuKey) ? <FactsBlock grp="obec" data={fact(c, "obec", kuKey)} /> : <Muted>Údaje o obci zatiaľ nie sú načítané.</Muted>}
      </Sec>

      {!isClient ? (
        <Sec id="praca" title="Signály a práca (interné)" source="Scenáre appky (vysporiadanie, príležitosti, zdedené byty, pôda na bývanie, zadania), evidencia obchodov a kontaktov.">
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

      <Sec id="overit" title="Čo overiť pred kúpou" source="Zostavené automaticky zo zistení v tomto liste — nie je to právne poradenstvo.">
        <ol className="list-decimal space-y-1 pl-5 text-sm">{checks.map((x, i) => <li key={i}>{x.text}<span className="text-xs text-muted"> — {x.why}</span></li>)}</ol>
      </Sec>

      <Sec id="zdroje" title="Zdroje a úplnosť">
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
