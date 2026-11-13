// LIST NEHNUTEĽNOSTI — doplnky 2026-11-13: slnko po mesiacoch, profil terénu, časová os, mapa porovnateľných predajov,
// vzdialenosti k vybavenosti, skóre právneho rizika, potenciál rozparcelovania, postup kúpy s lehotami.
// Všetko sa počíta v prehliadači z údajov listu (bez ďalších dopytov); funguje rovnako v internej aj klientskej verzii.
import { fact, mainKey, zoneOf, type SheetData } from "../lib/property-eval";
import type { FinResult } from "../lib/finance";
import { nf, eur, m2, date, dist, Muted, Sub, Grid, Table } from "./ps-ui";

// ——— slnko po mesiacoch (21. deň mesiaca, horizont z terénu) ———
function sunHours(lat: number, decl: number, hor: number[]): { day: number; sun: number } {
  const r = Math.PI / 180, f = lat * r, dl = decl * r; const n = hor.length, step = 360 / n;
  let day = 0, sun = 0;
  for (let h = -180; h < 180; h += 1) {          // krok 1° hodinového uhla = 4 minúty
    const H = h * r;
    const alt = Math.asin(Math.sin(f) * Math.sin(dl) + Math.cos(f) * Math.cos(dl) * Math.cos(H)) / r;
    if (alt <= 0) continue;
    day += 4;
    const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(dl) * Math.cos(f)) / r + 180 + 360) % 360;
    const hz = (hor[Math.round(az / step) % n] ?? 0) / 2;
    if (alt > hz) sun += 4;
  }
  return { day: day / 60, sun: sun / 60 };
}
const DECL = [-20.1, -10.8, 0.0, 11.6, 20.1, 23.44, 20.4, 12.0, 0.4, -10.6, -20.0, -23.44];   // deklinácia 21. dňa mesiaca
const MES = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
export function MonthlySun({ d }: { d: SheetData }) {
  const mk = mainKey(d.core); const s = mk ? fact(d.core, "slnko", mk) : null;
  const hor = Array.isArray(s?.hor) ? (s?.hor as number[]) : null; const lat = d.core.main.lat;
  if (!hor || hor.length < 8 || lat == null) return null;
  const rows = DECL.map((dc) => sunHours(lat, dc, hor));
  const max = Math.max(...rows.map((x) => x.day));
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-12 items-end gap-1" style={{ height: 120 }}>
        {rows.map((x, i) => (
          <div key={i} className="relative flex h-full flex-col justify-end" title={`${MES[i]}: ${nf(x.sun, 1)} h slnka z ${nf(x.day, 1)} h dňa`}>
            <span className="block w-full" style={{ height: `${(x.day / max) * 100}%`, background: "#e6e6e6" }} />
            <span className="absolute bottom-0 block w-full" style={{ height: `${(x.sun / max) * 100}%`, background: "#c29434" }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1 text-center text-[10px] text-muted">{rows.map((x, i) => <span key={i}>{MES[i]}<br /><b className="font-medium text-fg/80">{nf(x.sun, 1)}</b></span>)}</div>
      <Muted>Hodiny priameho slnka v strede pozemku 21. dňa každého mesiaca (žltá) z celkovej dĺžky dňa (sivá) — tieň okolitého terénu je započítaný, budovy a stromy nie.</Muted>
    </div>
  );
}

// ——— výškový profil pozdĺž hlavnej osi ———
export function TerrainProfile({ d }: { d: SheetData }) {
  const mk = mainKey(d.core); const t = mk ? fact(d.core, "teren", mk) : null;
  const p = Array.isArray(t?.profil) ? (t?.profil as number[]) : null; const L = typeof t?.profil_dl === "number" ? (t.profil_dl as number) : null;
  if (!p || p.length < 3 || !L) return null;
  const W = 640, H = 150, x0 = 46, x1 = W - 16, y0 = 14, y1 = H - 24;
  const lo = Math.min(...p), hi = Math.max(...p); const span = Math.max(hi - lo, L * 0.05, 1);   // nezveličovať: aspoň 5 % dĺžky
  const X = (i: number) => x0 + (i / (p.length - 1)) * (x1 - x0), Y = (v: number) => y1 - ((v - lo) / span) * (y1 - y0);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-md border border-line bg-surface-2" role="img" aria-label="Výškový profil pozemku">
        <polygon points={[`${x0},${y1}`, ...p.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`), `${x1},${y1}`].join(" ")} fill="rgba(85,96,79,.28)" stroke="#55604f" strokeWidth="1.6" />
        {p.map((v, i) => <text key={i} x={X(i)} y={Y(v) - 5} fontSize="9.5" textAnchor="middle" fill="#444">{nf(v, 1)} m</text>)}
        <text x={x0} y={H - 8} fontSize="9" fill="#777">0 m</text><text x={x1} y={H - 8} fontSize="9" textAnchor="end" fill="#777">{nf(L)} m</text>
        <text x={(x0 + x1) / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="#777">os pozemku, smer {String(t?.profil_az ?? "—")}° od vyššieho konca · prevýšenie {nf(hi - lo, 1)} m</text>
      </svg>
      <figcaption className="text-[10px] text-muted">Rez terénom pozdĺž dlhšej osi pozemku z DMR 5.0 (ÚGKK SR); výškové meradlo je zväčšené.</figcaption>
    </figure>
  );
}

// ——— časová os ———
export function Timeline({ d, isClient }: { d: SheetData; isClient: boolean }) {
  const c = d.core;
  const ev: { t: string; what: string; kind: string }[] = [];
  const kindSk: Record<string, string> = { inheritance: "dedičstvo", sale: "kúpa", gift: "darovanie", execution: "exekúcia / dražba" };
  for (const a of c.acquisitions) { if (a.firstYear) ev.push({ t: String(a.firstYear), what: `LV ${a.lvNo}: ${kindSk[a.kind] ?? a.kind}${a.n > 1 ? ` (${a.n}× zápis${a.lastYear && a.lastYear !== a.firstYear ? ` do ${a.lastYear}` : ""})` : ""}`, kind: "vlastníctvo" }); }
  for (const p of c.prices) ev.push({ t: p.cas.slice(0, 10), what: `zmluva s cenou ${eur(p.cen)}${p.ppm2 ? ` (${nf(p.ppm2)} €/m²)` : ""} — LV ${p.lvNo}`, kind: "predaj" });
  for (const f of c.flags) if (f.year) ev.push({ t: String(f.year), what: `${f.label} — LV ${f.lvNo}`, kind: "právo" });
  for (const l of c.listings) {
    if (l.first_seen) ev.push({ t: l.first_seen.slice(0, 10), what: `v inzercii za ${eur(l.history[0]?.price_eur ?? l.price_eur)}`, kind: "inzercia" });
    const h = l.history; for (let i = 1; i < h.length; i++) if (h[i].price_eur !== h[i - 1].price_eur && h[i].price_eur) ev.push({ t: h[i].day.slice(0, 10), what: `zmena ceny na ${eur(h[i].price_eur)}`, kind: "inzercia" });
    if (l.removed && l.last_seen) ev.push({ t: l.last_seen.slice(0, 10), what: "inzerát stiahnutý", kind: "inzercia" });
  }
  for (const a of c.auctions) if (a.auction_date) ev.push({ t: a.auction_date.slice(0, 10), what: `dražba${a.price_min_eur ? `, najnižšie podanie ${eur(a.price_min_eur)}` : ""}`, kind: "dražba" });
  for (const x of [...c.obec.upChanges, ...c.obec.changes].slice(0, 6)) if (x.detected_at) ev.push({ t: x.detected_at.slice(0, 10), what: `obec: ${(x.title ?? "oznámenie").slice(0, 80)}`, kind: "obec" });
  const eia = fact(c, "eia", `ku:${c.dataset?.ku_code ?? ""}`);
  for (const p of (Array.isArray(eia?.projekty) ? (eia?.projekty as { n?: string; d?: string }[]) : []).slice(0, 4)) if (p.d) ev.push({ t: p.d.slice(0, 10), what: `zámer v obci: ${(p.n ?? "").slice(0, 80)}`, kind: "obec" });
  if (c.dataset?.updated_at) ev.push({ t: c.dataset.updated_at.slice(0, 10), what: "stav katastra v tomto liste", kind: "list" });
  const sorted = ev.filter((e) => /^\d{4}/.test(e.t)).sort((a, b) => b.t.localeCompare(a.t)).slice(0, 24);
  if (sorted.length < 2) return <Muted>Na časovú os máme málo udalostí.</Muted>;
  return <Table head={["Kedy", "Udalosť", "Oblasť"]} rows={sorted.map((e) => [e.t.length > 4 ? date(e.t) : e.t, e.what, <span key="k" className="text-muted">{e.kind}</span>])} />;
}

// ——— mapa porovnateľných predajov ———
export function CompsMap({ d }: { d: SheetData }) {
  const c = d.core; const lat0 = c.main.lat, lng0 = c.main.lng;
  const pts = c.comparables.map((x, i) => ({ i: i + 1, lat: x.lat ?? null, lng: x.lng ?? null, ppm2: x.ppm2 })).filter((p) => p.lat != null && p.lng != null) as { i: number; lat: number; lng: number; ppm2: number | null }[];
  if (lat0 == null || lng0 == null || pts.length < 2) return null;
  const all = [...pts, { lat: lat0, lng: lng0 }];
  const kx = Math.cos((lat0 * Math.PI) / 180);
  let minLa = Math.min(...all.map((p) => p.lat)), maxLa = Math.max(...all.map((p) => p.lat)), minLo = Math.min(...all.map((p) => p.lng)), maxLo = Math.max(...all.map((p) => p.lng));
  const W = 640, H = 340, pad = 0.12;
  const spanLa = Math.max(maxLa - minLa, 0.004), spanLo = Math.max(maxLo - minLo, 0.004 / kx);
  const sc = Math.min(W / (spanLo * kx), H / spanLa) / (1 + 2 * pad);
  const cLa = (minLa + maxLa) / 2, cLo = (minLo + maxLo) / 2;
  minLo = cLo - W / sc / kx / 2; maxLo = cLo + W / sc / kx / 2; minLa = cLa - H / sc / 2; maxLa = cLa + H / sc / 2;
  const X = (lng: number) => ((lng - minLo) / (maxLo - minLo)) * W, Y = (lat: number) => H - ((lat - minLa) / (maxLa - minLa)) * H;
  const orto = `https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=1&STYLES=&SRS=EPSG:4326&BBOX=${minLo.toFixed(6)},${minLa.toFixed(6)},${maxLo.toFixed(6)},${maxLa.toFixed(6)}&WIDTH=${W * 2}&HEIGHT=${H * 2}&FORMAT=image/jpeg`;
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-md border border-line bg-surface-2" role="img" aria-label="Mapa porovnateľných predajov">
        <image href={orto} x="0" y="0" width={W} height={H} preserveAspectRatio="none" opacity="0.8" />
        {pts.map((p) => <g key={p.i}><circle cx={X(p.lng)} cy={Y(p.lat)} r="9" fill="#fff" stroke="#333" strokeWidth="1.2" /><text x={X(p.lng)} y={Y(p.lat) + 3.5} fontSize="9.5" textAnchor="middle" fill="#222" fontWeight="600">{p.i}</text></g>)}
        <g><rect x={X(lng0) - 7} y={Y(lat0) - 7} width="14" height="14" fill="#9c4a40" stroke="#fff" strokeWidth="1.5" /><text x={X(lng0) + 10} y={Y(lat0) + 4} fontSize="10.5" fill="#fff" stroke="#222" strokeWidth="0.35" fontWeight="600">táto nehnuteľnosť</text></g>
      </svg>
      <figcaption className="text-[10px] text-muted">Čísla = poradie v tabuľke porovnateľných predajov (poloha podľa prvej parcely v zmluve). Letecký snímok © ÚGKK SR.</figcaption>
    </figure>
  );
}

// ——— vzdialenosti k vybavenosti ———
const AMEN: [string, string][] = [["skola", "základná škola"], ["ms", "materská škola"], ["potrav", "potraviny"], ["super", "supermarket"], ["lekar", "lekár"], ["lekaren", "lekáreň"], ["posta", "pošta"], ["bus", "zastávka autobusu"], ["vlak", "železničná stanica"], ["ihrisko", "ihrisko"], ["sport", "športovisko"], ["nemoc", "nemocnica"]];
export function AmenityChart({ d }: { d: SheetData }) {
  const mk = mainKey(d.core); const o = mk ? fact(d.core, "osm", mk) : null;
  if (!o) return null;
  const rows = AMEN.map(([k, l]) => [l, typeof o[k] === "number" ? (o[k] as number) : null] as [string, number | null]).filter(([, v]) => v != null) as [string, number][];
  if (!rows.length) return null;
  const max = Math.max(3000, ...rows.map((r) => Math.min(r[1], 15000)));
  return (
    <div className="space-y-1">{rows.sort((a, b) => a[1] - b[1]).map(([l, v]) => (
      <div key={l} className="grid grid-cols-[9.5rem_1fr_4.5rem] items-center gap-2 text-[11px]">
        <span className="text-muted">{l}</span>
        <span className="relative h-2 rounded-sm bg-line/50"><span className="absolute left-0 top-0 h-2 rounded-sm" style={{ width: `${(Math.min(v, max) / max) * 100}%`, background: v <= 1000 ? "#4f7a4a" : v <= 3000 ? "#9a9a9a" : "#c9a36a" }} /></span>
        <span className="text-right tabular-nums">{dist(v)}</span>
      </div>))}
      <Muted>Vzdušnou čiarou od stredu pozemku (OpenStreetMap). Zelená = pešo do 1 km.</Muted>
    </div>
  );
}

// ——— skóre právneho rizika ———
export function legalRisk(d: SheetData): { score: number; level: string; factors: [string, number][] } {
  const c = d.core; const f: [string, number][] = [];
  const tar = c.legal.reduce((s, l) => s + l.tarchyCount, 0); if (tar) f.push([`${tar}× ťarcha alebo poznámka na LV`, Math.min(25, 6 + tar * 3)]);
  if (c.flags.some((x) => x.kind === "exekucia")) f.push(["exekúcia", 30]);
  if (c.flags.some((x) => x.kind === "sudne_konanie" || x.kind === "spochybnene")) f.push(["súdne konanie / spochybnený zápis", 30]);
  if (c.flags.some((x) => x.kind === "konkurz") || c.auctions.length) f.push(["konkurz alebo dražba", 25]);
  const own = c.owners.perLv.reduce((s, l) => s + l.count, 0); if (own >= 3) f.push([`${own} spoluvlastníkov`, Math.min(20, own * 2)]);
  const inh = Math.max(0, ...c.legalYears.map((y) => y.inh_max ?? 0)); if (inh && new Date().getFullYear() - inh <= 3) f.push(["nedávne dedičstvo (možné dodatočné dedičské konanie)", 6]);
  if (c.parcels.some((p) => p.register === "E")) f.push(["parcely registra E", 10]);
  if (c.parcels.some((p) => p.register === "C" && p.settled === 0)) f.push(["nevysporiadaný pozemok pod stavbou", 15]);
  if (c.unregistered.length) f.push(["stavba bez zápisu v katastri", 15]);
  if (c.legal.some((l) => !l.hasData)) f.push(["časť B/C nemáme pre všetky LV", 10]);
  const mk = mainKey(c); const pr = mk ? fact(c, "pristup", mk) : null; if (/bez|cez/i.test(String(pr?.trieda ?? ""))) f.push(["prístup cez cudzí pozemok alebo bez prístupu", 12]);
  for (const lv of c.lvs) { const v = fact(c, "vlastnici", `lv:${lv}`); if (v && Number(v.pravdepodobne_zosnuli ?? 0) > 0) { f.push(["pravdepodobne zosnulý vlastník", 15]); break; } }
  const score = Math.min(100, f.reduce((s, x) => s + x[1], 0));
  return { score, level: score >= 50 ? "vysoké" : score >= 20 ? "stredné" : "nízke", factors: f };
}
export function LegalRiskBlock({ d }: { d: SheetData }) {
  const r = legalRisk(d);
  return (
    <div className="space-y-1">
      <Grid rows={[["Skóre právneho rizika kúpy (0 = bez nálezu, 100 = vysoké)", <span key="s" style={{ color: r.level === "vysoké" ? "#9c4a40" : r.level === "stredné" ? "#8a6418" : "#3f5a3c", fontWeight: 600 }}>{r.score} — {r.level}</span>]]} />
      {r.factors.length ? <ul className="list-disc pl-5 text-xs text-muted">{r.factors.map(([t, p]) => <li key={t}>{t} (+{p})</li>)}</ul> : <Muted>Z údajov listu sme nenašli právne riziko — rozhoduje aktuálny výpis z LV.</Muted>}
    </div>
  );
}

// ——— potenciál rozparcelovania ———
export function subdivision(d: SheetData, fin: FinResult | null): { plots: number; plotM2: number; partsValue: number; whole: number; costs: number; gain: number; note: string } | null {
  const c = d.core; const z = zoneOf(d);
  const area = c.parcels.filter((p) => p.register === "C").reduce((s, p) => s + (p.area_m2 ?? 0), 0);
  const whole = fin?.basis.value ?? fin?.basis.price ?? null;
  if (!whole || area < 1500 || c.buildings.length || (z.name && !/býv|byva|obyt|zmie|rodinn/i.test(z.name))) return null;
  const plotM2 = 800; const plots = Math.floor((area * 0.85) / plotM2);   // 15 % na prístupovú cestu
  if (plots < 2) return null;
  const ppm2 = d.medPoz ?? (c.compStats?.medPpm2 ?? null); if (!ppm2) return null;
  const partsValue = plots * plotM2 * ppm2 * 0.92;
  const costs = plots * 9000 + 6000;   // na pozemok: prípojky a podiel cesty ~9 000 €, geometrický plán a povolenie cesty ~6 000 €
  return { plots, plotM2, partsValue: Math.round(partsValue), whole: Math.round(whole), costs, gain: Math.round(partsValue - costs - whole),
    note: z.name ? "zóna ÚP umožňuje bývanie" : "zónu ÚP nemáme — rozdelenie len so súhlasom obce" };
}
export function SubdivisionBlock({ d, fin }: { d: SheetData; fin: FinResult | null }) {
  const s = subdivision(d, fin); if (!s) return null;
  return (
    <>
      <Sub>Potenciál zhodnotenia — rozdelenie na stavebné pozemky</Sub>
      <Grid rows={[["Počet pozemkov po ~" + s.plotM2 + " m²", String(s.plots)], ["Hodnota po častiach (medián ponúk pozemkov − 8 %)", eur(s.partsValue)], ["Náklady (cesta, prípojky, geodet, povolenia)", eur(s.costs)],
        ["Hodnota celku dnes", eur(s.whole)], ["Rozdiel", <b key="g" style={{ color: s.gain > 0 ? "#3f5a3c" : "#9c4a40" }}>{s.gain > 0 ? "+" : "−"}{eur(Math.abs(s.gain))}</b>]]} />
      <Muted>Orientačne: {s.note}; potrebné je územné rozhodnutie / povolenie na delenie, prístupová cesta a siete. Výsledok závisí od dopytu a času predaja.</Muted>
    </>
  );
}

// ——— postup kúpy a lehoty ———
export function PurchaseSteps({ d, fin }: { d: SheetData; fin: FinResult | null }) {
  const c = d.core;
  const agg = c.lvs.map((lv) => fact(c, "vlastnici", `lv:${lv}`)).filter(Boolean) as Record<string, unknown>[];
  const has = (k: string) => agg.some((v) => Number(v[k] ?? 0) > 0);
  const owners = c.owners.perLv.reduce((s, l) => s + l.count, 0);
  const steps: [string, string, string][] = [];
  steps.push(["Overenie", "aktuálny výpis z LV a kópia mapy, obhliadka, vyjadrenia (ÚPI obce, siete)", "1–4 týždne"]);
  if (has("obec")) steps.push(["Obec ako predávajúci", "zámer predaja, zverejnenie min. 15 dní, uznesenie zastupiteľstva (prípadne obchodná verejná súťaž)", "1–3 mesiace"]);
  if (has("stat") || has("spf")) steps.push(["Štát / SPF", "osobitný postup: žiadosť, ocenenie znaleckým posudkom, súhlas, ponuka — cena podľa predpisov", "3–12 mesiacov"]);
  if (owners > 1) steps.push(["Spoluvlastníci", `${owners} vlastníkov — podpis všetkých alebo predaj podielu s ponukou ostatným (predkupné právo)`, "podľa dohody"]);
  if (c.legal.reduce((s, l) => s + l.tarchyCount, 0)) steps.push(["Ťarchy", "dohoda s veriteľom o vyplatení a výmaze záložného práva z kúpnej ceny (úschova)", "2–6 týždňov"]);
  if (fin?.mortgage && fin.inputs.ltv > 0) steps.push(["Financovanie", "žiadosť o úver, znalecký posudok, schválenie bankou, úverová a záložná zmluva", "2–5 týždňov"]);
  steps.push(["Zmluvy", "rezervačná alebo zmluva o budúcej zmluve, kúpna zmluva, úschova kúpnej ceny (notár / advokát / banka)", "1–2 týždne"]);
  steps.push(["Vklad do katastra", `návrh na vklad (${fin ? "50 € elektronicky" : "poplatok podľa sadzobníka"}); kataster rozhodne do 30 dní, v zrýchlenom konaní do 15 dní`, "15–30 dní"]);
  steps.push(["Po kúpe", "uvoľnenie peňazí z úschovy, priznanie k dani z nehnuteľností do 31. januára nasledujúceho roka, prepis energií, poistenie", "do 30 dní / 31. 1."]);
  return <Table head={["Krok", "Čo treba urobiť", "Lehota"]} rows={steps.map((s, i) => [<b key="k" className="font-medium">{String(i + 1).padStart(2, "0")} {s[0]}</b>, s[1], s[2]])} />;
}

export function RentalsTable({ d }: { d: SheetData }) {
  const r = d.core.rentals ?? []; if (!r.length) return null;
  return (<><Sub>Ponuky na prenájom v okolí (posledných 180 dní)</Sub>
    <Table head={["Inzerát", "Vzdialenosť", "Výmera", "Nájom", "€/m²"]} rows={r.map((l) => [
      l.url ? <a key="u" href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{(l.title ?? "inzerát").slice(0, 44)}</a> : l.title ?? "inzerát",
      dist(l.distM), m2(l.area_m2), eur(l.price_eur), l.ppm2 ? nf(l.ppm2, 1) : "—"])} /></>);
}

// ——— intenzita dopravy (SSC sčítanie 2022–2023) a orientačný hluk pri pozemku ———
export function trafficNoise(d: SheetData): { road: string; s: number; sMax: number; tPct: number; distM: number; lden: number; level: string } | null {
  const r = d.limits?.road; const f = fact(d.core, "doprava", `ku:${d.core.dataset?.ku_code ?? ""}`);
  if (!r || !f || !r.cislo) return null;
  const cesty = (f.cesty ?? {}) as Record<string, { s_med: number; s_max: number; t_pct: number }>;
  const x = cesty[String(r.cislo)] ?? cesty[String(r.cislo).replace(/^0+/, "")];
  if (!x) return null;
  // zjednodušený odhad Lden: hladina 10 m od cesty z intenzity a podielu ťažkých vozidiel, útlm so vzdialenosťou (líniový zdroj + terén)
  const L10 = 10 * Math.log10(Math.max(50, x.s_med)) + 29 + 10 * Math.log10(1 + 4 * (x.t_pct / 100));
  const lden = Math.round(L10 - 15 * Math.log10(Math.max(r.distM, 10) / 10));
  const level = lden < 45 ? "tiché" : lden < 53 ? "mierny hluk" : lden < 60 ? "hlučnejšie" : lden < 65 ? "hlučné" : "veľmi hlučné";
  return { road: `${r.trieda} ${r.cislo}`, s: x.s_med, sMax: x.s_max, tPct: x.t_pct, distM: Math.round(r.distM), lden, level };
}
export function TrafficNoiseBlock({ d }: { d: SheetData }) {
  const t = trafficNoise(d); if (!t) return null;
  return (
    <>
      <Sub>Doprava a hluk z najbližšej cesty</Sub>
      <Grid rows={[["Cesta", `${t.road} vo vzdialenosti ${dist(t.distM)}`], ["Intenzita (sčítanie 2022–2023)", `${nf(t.s)} vozidiel za 24 h (úseky v okrese do ${nf(t.sMax)})`], ["Podiel ťažkých vozidiel", `${nf(t.tPct, 1)} %`],
        ["Orientačný hluk pri pozemku", <b key="l">~{t.lden} dB (Lden) — {t.level}</b>]]} />
      <Muted>Odhad bez protihlukových stien, budov a terénu medzi cestou a pozemkom. Svetová zdravotnícka organizácia odporúča pre cestnú dopravu menej ako 53 dB; vyhláška 549/2007 pripúšťa pri cestách v obytnom území 60 dB cez deň a 50 dB v noci. Presné hodnoty majú strategické hlukové mapy a meranie.</Muted>
    </>
  );
}
