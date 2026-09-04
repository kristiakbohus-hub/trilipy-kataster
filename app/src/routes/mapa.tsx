import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { addWmsSource, getDatasets, getMapData, getMapOpportunities, getMapTexts, listWmsSources, searchDataset, geocodePlace, type GeoPlace } from "../lib/api/kataster.functions";
import { STATUS_META, canRunPipeline, type Dataset, type MapText, type Parcel, type Role } from "../lib/domain";
import { MapView, type WmsDef } from "../components/map-view";
import { Badge, Card, Disclaimer, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

type WmsRow = { id: number; name: string; url: string; layers: string; format: string };
const toWmsDef = (rows: WmsRow[]): WmsDef[] =>
  rows.map((r) => ({ id: `custom-${r.id}`, name: r.name, url: r.url, layers: r.layers, format: r.format, attribution: "vlastná WMS", reliable: false }));

// ESKN-first: mapa sa otvára na národnom pohľade na celé SR (ESKN default podklad); k.ú. sú vrstvy navrchu.
const SR_VIEW = { lat: 48.72, lng: 19.5, zoom: 7.4 };

export const Route = createFileRoute("/mapa")({
  head: () => ({ meta: [{ title: "Mapa / GIS — TRI LIPY KATASTER CORE" }] }),
  loader: async () => {
    const datasets = await getDatasets();
    const withGeom = datasets.find((d) => d.status !== "blocked") ?? datasets[0];
    const id = withGeom?.id ?? null;
    const initial = id ? await getMapData({ data: { datasetId: id } }) : null;
    const texts = id ? await getMapTexts({ data: { datasetId: id } }) : [];
    const wms = id ? await listWmsSources({ data: { datasetId: id } }) : [];
    const opps = id ? await getMapOpportunities({ data: { datasetId: id } }) : [];
    return { datasets, initialId: id, initialParcels: initial?.parcels ?? [], initialTexts: texts, initialWms: wms, initialOpps: opps };
  },
  component: MapPage,
});

function MapPage() {
  const { datasets, initialId, initialParcels, initialTexts, initialWms, initialOpps } = Route.useLoaderData();
  const { role } = useRole();
  const [datasetId, setDatasetId] = useState<string | null>(initialId);
  const [parcels, setParcels] = useState<Parcel[]>(initialParcels);
  const [texts, setTexts] = useState<MapText[]>(initialTexts);
  const [wms, setWms] = useState<WmsRow[]>(initialWms);
  const [opps, setOpps] = useState(initialOpps);
  const [loading, setLoading] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [fs, setFs] = useState(false);
  const [userNavigated, setUserNavigated] = useState(false);  // false = otvor národne (ESKN); true = fitnuté na zvolené k.ú.
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number; nonce: number } | null>(null);  // prelet na vyhľadané miesto

  // pridať WMS
  const [wName, setWName] = useState("");
  const [wUrl, setWUrl] = useState("");
  const [wLayers, setWLayers] = useState("");
  const [wMsg, setWMsg] = useState<string | null>(null);
  const [wBusy, setWBusy] = useState(false);

  const current = datasets.find((d) => d.id === datasetId) ?? null;

  // Permalink — zdieľateľný odkaz /mapa?ds=<dataset>&p=<parcela> (fokus po načítaní)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("p"); const ds = sp.get("ds");
    if (ds && ds !== datasetId) { void switchDataset(ds).then(() => { if (p) setFocusId(p); }); }
    else if (p) setFocusId(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fs]);

  async function switchDataset(id: string) {
    setDatasetId(id);
    setUserNavigated(true);   // skok na konkrétne k.ú. → fitni naň (nie národný pohľad)
    setFocusId(null);
    setLoading(true);
    try {
      const [r, t, w, o] = await Promise.all([
        getMapData({ data: { datasetId: id } }),
        getMapTexts({ data: { datasetId: id } }),
        listWmsSources({ data: { datasetId: id } }),
        getMapOpportunities({ data: { datasetId: id } }),
      ]);
      setParcels(r.parcels);
      setTexts(t);
      setWms(w);
      setOpps(o);
    } finally {
      setLoading(false);
    }
  }

  async function addWms() {
    if (!datasetId || wName.trim().length < 2 || !wUrl.trim() || !wLayers.trim()) {
      setWMsg("Vyplň názov, URL a názov vrstvy/vrstiev.");
      return;
    }
    setWBusy(true); setWMsg(null);
    try {
      const r = await addWmsSource({ data: { datasetId, name: wName.trim(), url: wUrl.trim(), layers: wLayers.trim(), role } });
      setWMsg(r.ok ? "WMS pridaná — nájdeš ju vo Vrstvách." : r.message ?? "Neúspešné.");
      if (r.ok) {
        setWName(""); setWUrl(""); setWLayers("");
        setWms(await listWmsSources({ data: { datasetId } }));
      }
    } finally { setWBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Mapa / GIS viewer</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            ZBGIS-štýl portál: prepínateľné <b>VGI vrstvy</b> (parcely, čísla, miestne názvy) + <b>WMS podklady</b>
            (ortofoto, kataster…). Nástroje: <b>Pan</b> (klik = identify, Ctrl/Shift = multi-výber), <b>Výber</b> (box),
            <b> Meranie</b> (snapping). Vrstvy vľavo, audit relácie dole.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted">Dataset</span>
          <select
            value={datasetId ?? ""}
            onChange={(e) => switchDataset(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
          >
            {datasets.map((d: Dataset) => (
              <option key={d.id} value={d.id}>{d.ku_name} · {d.kn_type}</option>
            ))}
          </select>
        </label>
      </div>

      {current ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge color={STATUS_META[current.status].color}>{STATUS_META[current.status].label}</Badge>
          <span className="text-muted">Coverage <span className="tabular-nums text-fg">{current.geometry_coverage} %</span></span>
          <span className="text-muted">Parcely <span className="tabular-nums text-fg">{parcels.length}</span></span>
          <span className="text-muted">Názvy <span className="tabular-nums text-fg">{texts.length}</span></span>
          <span className="text-muted">WMS <span className="tabular-nums text-fg">{3 + wms.length}</span></span>
          {loading ? <span className="text-muted">načítavam…</span> : null}
        </div>
      ) : null}

      <div className={fs ? "fixed inset-0 z-40 bg-paper" : "relative h-[62vh] min-h-[440px] w-full"}>
        {datasetId ? (
          <div className="absolute left-3 top-3 z-30">
            <MapSearch datasetId={datasetId} datasets={datasets} role={role} onPick={setFocusId} onPickDataset={switchDataset}
              onPickPlace={(lat, lng) => { setUserNavigated(true); setFlyTo({ lat, lng, zoom: 18, nonce: Date.now() }); }} />
          </div>
        ) : null}
        <button
          onClick={() => setFs((v) => !v)}
          title={fs ? "Zavrieť celú obrazovku (Esc)" : "Mapa na celú obrazovku"}
          className="absolute right-3 top-3 z-30 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-xs font-medium text-fg shadow backdrop-blur hover:border-ink"
        >
          {fs ? "✕ Zavrieť" : "⛶ Celá obrazovka"}
        </button>
        {parcels.length > 0 ? (
          <MapView
            key={`${datasetId ?? "none"}-${userNavigated}`}
            parcels={parcels}
            datasetName={current?.ku_name}
            datasetId={datasetId ?? undefined}
            role={role}
            texts={texts}
            wmsExtra={toWmsDef(wms)}
            opportunities={opps}
            focusParcelId={focusId}
            initialCenter={userNavigated ? null : SR_VIEW}
            flyTo={flyTo}
          />
        ) : (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-line bg-surface/50 text-sm text-muted">
            Tento dataset nemá odvodenú geometriu na zobrazenie.
          </div>
        )}
      </div>

      {/* Pridať vlastnú WMS */}
      <Card className="p-4">
        <SectionHeader
          title="Pridať WMS vrstvu"
          hint={canRunPipeline(role) ? "Manuálne, confirm-gated (no auto-fetch). Pridá sa do Vrstiev." : "Rola nemá oprávnenie."}
        />
        <div className="grid gap-2 md:grid-cols-8">
          <input value={wName} onChange={(e) => setWName(e.target.value)} disabled={!canRunPipeline(role)} placeholder="Názov" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50 md:col-span-2" />
          <input value={wUrl} onChange={(e) => setWUrl(e.target.value)} disabled={!canRunPipeline(role)} placeholder="WMS URL (GetMap endpoint)" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50 md:col-span-4" />
          <input value={wLayers} onChange={(e) => setWLayers(e.target.value)} disabled={!canRunPipeline(role)} placeholder="Vrstva/vrstvy" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-50" />
          <button onClick={addWms} disabled={!canRunPipeline(role) || wBusy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {wBusy ? "…" : "Pridať"}
          </button>
        </div>
        {wMsg ? <div className="mt-2 text-sm text-muted">{wMsg}</div> : null}
      </Card>

      {/* QGIS konektor — živá OGC služba + stiahnuteľný balík */}
      {datasetId ? <QgisConnector datasetId={datasetId} datasetName={current?.ku_name} wms={wms} /> : null}

      <Disclaimer>
        VGI vrstvy sú z nahraného katastrálneho územia; WMS podklady sú z overeného registra alebo tvojej WMS
        (žiadny automatický scraping internetu). Zobrazená geometria je interná odvodená reprezentácia — nie úradná
        katastrálna mapa. Nedostupná WMS sa zobrazí prázdno.
      </Disclaimer>
    </div>
  );
}

const NATIONAL_WMS = [
  { name: "ZBGIS ortofoto", url: "https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get", layers: "1", format: "image/jpeg" },
  { name: "ZBGIS základná mapa", url: "https://zbgisws.skgeodesy.sk/zbgis_wms_featureinfo/service.svc/get", layers: "0", format: "image/png" },
];

// ——— ZBGIS-style vyhľadávanie na mape: k.ú. / parcela / LV / vlastník → skok / fokus ———
function MapSearch({ datasetId, datasets, role, onPick, onPickDataset, onPickPlace }: { datasetId: string; datasets: Dataset[]; role: Role; onPick: (id: string) => void; onPickDataset: (id: string) => void; onPickPlace: (lat: number, lng: number) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof searchDataset>> | null>(null);
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kuMatches = q.trim().length >= 2
    ? datasets.filter((d) => d.ku_name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  function onChange(v: string) {
    setQ(v); setOpen(true);
    if (tRef.current) clearTimeout(tRef.current);
    if (gRef.current) clearTimeout(gRef.current);
    if (v.trim().length < 1) { setRes(null); setPlaces([]); return; }
    tRef.current = setTimeout(async () => {
      try { setRes(await searchDataset({ data: { datasetId, q: v.trim(), role } })); } catch { setRes(null); }
    }, 220);
    // národné geokódovanie (ZBGIS-style našepkávač) — dlhší debounce (Nominatim policy)
    if (v.trim().length >= 3) {
      gRef.current = setTimeout(async () => {
        try { setPlaces(await geocodePlace({ data: { q: v.trim() } })); } catch { setPlaces([]); }
      }, 400);
    } else setPlaces([]);
  }
  function pick(id: string | null, label: string) {
    if (!id) return;
    onPick(id); setOpen(false); setQ(label);
  }
  function pickKu(id: string, label: string) {
    onPickDataset(id); setOpen(false); setQ(label);
  }
  function pickPlace(p: GeoPlace) {
    onPickPlace(p.lat, p.lng); setOpen(false); setQ(p.label);
  }
  const hasResults = kuMatches.length + places.length + (res ? res.parcels.length + res.lvs.length + res.owners.length : 0) > 0;
  return (
    <div className="w-[320px] max-w-[calc(100vw-2rem)]">
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Hľadať: k.ú. / parcela / LV / vlastník…"
        className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-fg shadow-lg outline-none focus:border-brand"
      />
      {open && hasResults ? (
        <div className="mt-1 max-h-[52vh] overflow-y-auto rounded-xl border border-line bg-paper shadow-xl">
          {kuMatches.map((d) => (
            <button key={`ku-${d.id}`} onClick={() => pickKu(d.id, d.ku_name)}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface">
              <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-fg">k.ú.</span>
              <span className="truncate text-sm text-fg">{d.ku_name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{d.kn_type}</span>
            </button>
          ))}
          {places.map((p, i) => (
            <button key={`geo-${i}`} onClick={() => pickPlace(p)}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface">
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">📍</span>
              <span className="truncate text-sm text-fg">{p.label}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{p.kind}</span>
            </button>
          ))}
          {(res?.parcels ?? []).map((p) => (
            <button key={`p-${p.id}`} onClick={() => pick(p.id, `parcela ${p.parcel_no}`)}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface">
              <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">C-KN</span>
              <span className="text-sm text-fg">parcela {p.parcel_no}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{p.use_type ?? ""} · {p.area_m2} m²</span>
            </button>
          ))}
          {(res?.lvs ?? []).map((l) => (
            <button key={`l-${l.lv_no}`} onClick={() => pick(l.parcel_id, `LV ${l.lv_no}`)}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface">
              <span className="rounded bg-green/15 px-1.5 py-0.5 text-[10px] font-bold text-green">LV</span>
              <span className="text-sm text-fg">LV č. {l.lv_no}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{l.n} parciel</span>
            </button>
          ))}
          {(res?.owners ?? []).map((o, i) => (
            <button key={`o-${i}`} onClick={() => pick(o.parcel_id, o.name)}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface">
              <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-fg">V</span>
              <span className="truncate text-sm text-fg">{o.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">LV {o.lv_no}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QgisConnector({ datasetId, datasetName, wms }: { datasetId: string; datasetName?: string; wms: WmsRow[] }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ogcUrl = `${origin}/ogc?dataset=${encodeURIComponent(datasetId)}`;
  const allWms = [...NATIONAL_WMS, ...wms.map((w) => ({ name: w.name, url: w.url, layers: w.layers, format: w.format }))];
  const nm = datasetName ?? datasetId;

  function dl(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  function readme() {
    const lines = [
      `TRI LIPY KATASTER CORE — QGIS napojenie: ${nm}`,
      "",
      "1) ŽIVÁ VRSTVA PARCIEL (GeoJSON, vždy aktuálna):",
      `   Layer → Add Layer → Add Vector Layer → URI/Protocol: ${ogcUrl}`,
      "   (alebo priamo otvor URL; CRS: EPSG:4326 / CRS84)",
      "",
      "2) WMS PODKLADY (Layer → Add Layer → Add WMS/WMTS → New → URL):",
      ...allWms.map((w) => `   - ${w.name}: ${w.url}  [vrstvy: ${w.layers}]`),
      "",
      "3) Priložený projekt tri-lipy-" + datasetId + ".qgs (beta) načíta parcely automaticky.",
      "   Ak sa neotvorí, použi krok 1) a 2) ručne.",
      "",
      "Pozn.: owner-sensitive údaje (mená, dátumy narodenia) sa cez OGC NEexportujú — len geometria a parcelné čísla.",
    ];
    dl(lines.join("\n"), "text/plain;charset=utf-8", `tri-lipy-${datasetId}-QGIS-README.txt`);
  }
  function qgs() {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const lid = `parcely_${datasetId.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const proj =
      `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>\n` +
      `<qgis version="3.34.0" projectname="TRI LIPY — ${esc(nm)}">\n` +
      `  <projectCrs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></projectCrs>\n` +
      `  <layer-tree-group>\n` +
      `    <layer-tree-layer id="${lid}" name="Parcely ${esc(nm)}" source="/vsicurl/${esc(ogcUrl)}" providerKey="ogr" checked="Qt::Checked"/>\n` +
      `  </layer-tree-group>\n` +
      `  <projectlayers>\n` +
      `    <maplayer type="vector" geometry="Polygon">\n` +
      `      <id>${lid}</id>\n` +
      `      <datasource>/vsicurl/${esc(ogcUrl)}</datasource>\n` +
      `      <layername>Parcely ${esc(nm)}</layername>\n` +
      `      <provider>ogr</provider>\n` +
      `      <srs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></srs>\n` +
      `    </maplayer>\n` +
      `  </projectlayers>\n` +
      `</qgis>\n`;
    dl(proj, "application/x-qgis-project", `tri-lipy-${datasetId}.qgs`);
  }

  return (
    <Card className="p-4">
      <SectionHeader title="QGIS konektor" hint="Živá OGC/GeoJSON služba + stiahnuteľný balík pre rozsiahlejšie analýzy." />
      <div className="rounded-md border border-line bg-surface-2/30 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted">Živá OGC URL (parcely, GeoJSON, CRS84)</div>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-paper px-2 py-1 text-xs text-fg">{ogcUrl}</code>
          <button
            onClick={() => { if (typeof navigator !== "undefined" && navigator.clipboard) { void navigator.clipboard.writeText(ogcUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
            className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-fg hover:border-ink"
          >
            {copied ? "skopírované" : "kopírovať"}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={ogcUrl} download={`${datasetId}.geojson`} className="rounded-md border border-line px-3 py-2 text-sm font-medium text-fg hover:border-ink">Stiahnuť GeoJSON</a>
        <button onClick={qgs} className="rounded-md border border-line px-3 py-2 text-sm font-medium text-fg hover:border-ink">QGIS projekt (.qgs)</button>
        <button onClick={readme} className="rounded-md border border-line px-3 py-2 text-sm font-medium text-fg hover:border-ink">README + WMS URL</button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        V QGIS: <b className="text-fg">Add Vector Layer → URL</b> (živé parcely) alebo otvor priložený <b className="text-fg">.qgs</b>.
        WMS podklady (ortofoto/ESKN…) sú v README. Owner-sensitive údaje sa cez OGC neexportujú — len geometria a parcelné čísla.
      </p>
    </Card>
  );
}
