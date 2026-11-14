import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { addWmsSource, getDatasets, getMapData, getMapOpportunities, getMapTexts, listWmsSources, geocodePlace, mapSearch, mapFeature, ownerPortfolio, getSubdivisionOverlay, type GeoPlace, type MapHit, type MapRing, type SubdivisionOverlayItem } from "../lib/api/kataster.functions";
import { LvCard } from "../components/lv-card";
import { canRunPipeline, type Dataset, type MapText, type Parcel, type Role, statusMeta } from "../lib/domain";
import { useAuth } from "../lib/auth-context";
import { MapView, type WmsDef } from "../components/map-view";
import { Badge, Card, Disclaimer, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

type WmsRow = { id: number; name: string; url: string; layers: string; format: string };
const toWmsDef = (rows: WmsRow[]): WmsDef[] =>
  rows.map((r) => ({ id: `custom-${r.id}`, name: r.name, url: r.url, layers: r.layers, format: r.format, attribution: "vlastná WMS", reliable: false }));

// ESKN-first: mapa sa otvára na národnom pohľade na celé SR (ESKN default podklad); k.ú. sú vrstvy navrchu.
const SR_VIEW = { lat: 48.72, lng: 19.5, zoom: 7.4 };

// ZÁMERNE BEZ `loader`: loader beží počas SSR ešte pred prihlasovacou bránou (__root.tsx), takže
// by vložil parcely/príležitosti do HTML pre KOHOKOĽVEK, kto pozná URL. Ťaháme ich až v efekte.
export const Route = createFileRoute("/mapa")({
  head: () => ({ meta: [{ title: "Mapa / GIS — TRI LIPY KATASTER CORE" }] }),
  component: MapPage,
});

function MapPage() {
  const { token } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const { role } = useRole();
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [texts, setTexts] = useState<MapText[]>([]);
  const [wms, setWms] = useState<WmsRow[]>([]);
  const [opps, setOpps] = useState<Awaited<ReturnType<typeof getMapOpportunities>>>([]);
  // GOLD-12 návrhy delenia celkov (predvolený beh) — vrstva na prepnutie
  const [showSub, setShowSub] = useState(false);
  const [subItems, setSubItems] = useState<SubdivisionOverlayItem[] | null>(null);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  // Zoznam datasetov + voľba prvého použiteľného; samotné vrstvy k.ú. doťahuje efekt nižšie
  // podľa datasetId (rovnaká cesta, akou sa prepína dataset v UI).
  useEffect(() => {
    getDatasets().then((ds) => {
      setDatasets(ds);
      // deep link /mapa?ds=<dataset>&delenie=1 (karta Delenie celkov, list nehnuteľnosti)
      const sp = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
      const want = sp?.get("ds");
      if (sp?.get("delenie") === "1") setShowSub(true);
      const first = (want ? ds.find((d) => d.id === want) : undefined) ?? ds.find((d) => d.status !== "blocked") ?? ds[0];
      if (first) { setDatasetId(first.id); void loadLayers(first.id); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [fs, setFs] = useState(false);
  const [userNavigated, setUserNavigated] = useState(false);  // false = otvor národne (ESKN); true = fitnuté na zvolené k.ú.
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number; nonce: number } | null>(null);  // prelet na vyhľadané miesto
  const [highlight, setHighlight] = useState<{ rings: MapRing[]; nonce: number } | null>(null);   // obrys nájdeného objektu
  const [identifyAt, setIdentifyAt] = useState<{ lat: number; lng: number; nonce: number } | null>(null);
  const [lvPanel, setLvPanel] = useState<{ datasetId: string; lvNo: number; label: string } | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<{ name: string; lvs: { datasetId: string; kuName: string; lvNo: number; share: string | null }[] } | null>(null);

  // deep link /mapa?ll=49.20,18.73 (2026-11-11: nová výstavba zo satelitu, hotspoty) → prelet a „všetko v bode"
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = (new URLSearchParams(window.location.search).get("ll") ?? "").match(/^(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)$/);
    if (!m) return;
    const lat = Number(m[1]), lng = Number(m[2]);
    setUserNavigated(true);
    setFlyTo({ lat, lng, zoom: 17, nonce: Date.now() });
    setIdentifyAt({ lat, lng, nonce: Date.now() });
  }, []);

  // Výber z vyhľadávania (ako ZBGIS): priblíž, zvýrazni obrys a otvor panel s LV (tlač/PDF).
  async function pickHit(h: MapHit) {
    setSearchMsg(null); setLvPanel(null); setPortfolio(null);
    // vlastník → všetky jeho LV v našich k.ú. naraz (len plný prístup; zadanie 2026-11-11)
    if (h.kind === "owner" && h.lvNo != null) {
      const r = await ownerPortfolio({ data: { token: token ?? undefined, datasetId: h.datasetId, lvNo: h.lvNo, name: h.label } }).catch(() => null);
      if (!r?.ok || !r.lvs?.length) { setSearchMsg(r?.message ?? "Portfólio vlastníka sa nepodarilo načítať."); return; }
      const n = Date.now();
      setPortfolio({ name: r.name ?? h.label, lvs: r.lvs });
      if (r.rings?.length) {
        setHighlight({ rings: r.rings, nonce: n });
        const pts = r.rings.flat();
        const lng = pts.reduce((a, p) => a + p[0], 0) / pts.length, lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const span = Math.max(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])));
        setUserNavigated(true);
        setFlyTo({ lat, lng, zoom: span > 0.2 ? 11 : span > 0.05 ? 13 : span > 0.01 ? 15 : 17, nonce: n });
      }
      return;
    }
    const f = await mapFeature({ data: { token: token ?? undefined, datasetId: h.datasetId, kind: h.kind === "ku" ? "LV" : h.kind, no: h.no ?? null, lvNo: h.lvNo ?? null } }).catch(() => null);
    if (!f?.ok) { setSearchMsg(f?.message ?? "Objekt sa nepodarilo načítať."); return; }
    const n = Date.now();
    setHighlight(f.rings?.length ? { rings: f.rings, nonce: n } : null);
    if (f.center) { setUserNavigated(true); setFlyTo({ lat: f.center.lat, lng: f.center.lng, zoom: h.kind === "LV" || h.kind === "owner" ? 16 : 18, nonce: n }); }
    if (h.kind === "LV" || h.kind === "owner") {
      if (h.lvNo != null) setLvPanel({ datasetId: h.datasetId, lvNo: h.lvNo, label: h.label });
    } else if (f.center) {
      setIdentifyAt({ lat: f.center.lat, lng: f.center.lng, nonce: n });
    } else if (f.lvNo != null) {
      setLvPanel({ datasetId: h.datasetId, lvNo: f.lvNo, label: h.label });   // bez obrysu (napr. ESKN nedostupné) aspoň LV
      setSearchMsg("Obrys objektu sa nenašiel — zobrazený je aspoň list vlastníctva.");
    }
    // zdieľateľný odkaz ako ZBGIS: /mapa?ku=866083&c=1500
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams();
      sp.set("ku", h.kuCode);
      const k = h.kind === "C" ? "c" : h.kind === "E" ? "e" : h.kind === "SC" ? "sc" : "lv";
      sp.set(k, k === "lv" ? String(h.lvNo ?? "") : (h.kind === "SC" ? h.label.replace(/^stavba s\. č\. /, "") : h.no ?? ""));
      window.history.replaceState(null, "", `/mapa?${sp.toString()}`);
    }
  }

  // pridať WMS
  const [wName, setWName] = useState("");
  const [wUrl, setWUrl] = useState("");
  const [wLayers, setWLayers] = useState("");
  const [wMsg, setWMsg] = useState<string | null>(null);
  const [wBusy, setWBusy] = useState(false);

  const current = datasets.find((d) => d.id === datasetId) ?? null;
  const curKu = current?.ku_code ?? null;
  useEffect(() => {
    if (!showSub || !curKu) { setSubItems(null); setSubMsg(null); return; }
    let alive = true;
    setSubMsg("Načítavam návrhy delenia…");
    getSubdivisionOverlay({ data: { kodKu: curKu } }).then((r) => {
      if (!alive) return;
      setSubItems(r.items);
      const nm = r.items.filter((x) => x.classification === "MATCH").length;
      setSubMsg(r.variantId == null ? "Predvolený beh delenia ešte nie je spočítaný."
        : r.status !== "done" && !r.items.length ? "Delenie sa práve prepočítava na Macu."
        : `${nm} zhôd a ${r.items.length - nm} na preskúmanie v tomto k.ú. (plná čiara = zhoda, prerušovaná = na preskúmanie)`);
    }).catch(() => { if (alive) { setSubItems(null); setSubMsg("Návrhy delenia sa nepodarilo načítať."); } });
    return () => { alive = false; };
  }, [showSub, curKu]);

  // Permalink — zdieľateľný odkaz /mapa?ds=<dataset>&p=<parcela> (fokus po načítaní)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("p"); const ds = sp.get("ds");
    if (ds && ds !== datasetId) { void switchDataset(ds).then(() => { if (p) setFocusId(p); }); }
    else if (p) setFocusId(p);
    // permalink na výrez: ll=lat,lng & z=zoom → prelet
    const ll = sp.get("ll"); const z = sp.get("z");
    if (ll) {
      const [latS, lngS] = ll.split(","); const lat = Number(latS), lng = Number(lngS); const zoom = z ? Number(z) : 17;
      if (Number.isFinite(lat) && Number.isFinite(lng)) { setUserNavigated(true); setFlyTo({ lat, lng, zoom: Number.isFinite(zoom) ? zoom : 17, nonce: Date.now() }); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fs]);

  // Len načítanie vrstiev k.ú. — BEZ zmeny pohľadu. Prvé načítanie po prihlásení ho volá priamo,
  // aby mapa ostala na národnom pohľade (predtým to robil SSR loader).
  async function loadLayers(id: string) {
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

  async function switchDataset(id: string) {
    setDatasetId(id);
    setUserNavigated(true);   // skok na konkrétne k.ú. → fitni naň (nie národný pohľad)
    setFocusId(null);
    await loadLayers(id);
  }

  async function addWms() {
    if (!datasetId || wName.trim().length < 2 || !wUrl.trim() || !wLayers.trim()) {
      setWMsg("Vyplň názov, URL a názov vrstvy/vrstiev.");
      return;
    }
    setWBusy(true); setWMsg(null);
    try {
      const r = await addWmsSource({ data: { token: token ?? undefined, datasetId, name: wName.trim(), url: wUrl.trim(), layers: wLayers.trim(), role } });
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
          <Badge color={statusMeta(current.status).color}>{statusMeta(current.status).label}</Badge>
          <label className="flex items-center gap-1 text-muted" title="Navrhnuté rozdelenie celkov na stavebné pozemky (GOLD-12, predvolené nastavenie)">
            <input type="checkbox" checked={showSub} onChange={(e) => setShowSub(e.target.checked)} /> Návrhy delenia
          </label>
          {showSub && subMsg ? <span className="text-xs text-muted">{subMsg}</span> : null}
          <span className="text-muted">Coverage <span className="tabular-nums text-fg">{current.geometry_coverage} %</span></span>
          <span className="text-muted">Parcely <span className="tabular-nums text-fg">{parcels.length}</span></span>
          <span className="text-muted">Názvy <span className="tabular-nums text-fg">{texts.length}</span></span>
          <span className="text-muted">WMS <span className="tabular-nums text-fg">{3 + wms.length}</span></span>
          {loading ? <span className="text-muted">načítavam…</span> : null}
        </div>
      ) : null}

      <div className={fs ? "fixed inset-0 z-40 bg-paper" : "relative h-[62vh] min-h-[440px] w-full"}>
        {datasetId ? (
          <div className="absolute left-3 top-3 z-30 max-md:right-14">
            <ZSearch datasets={datasets} onPick={(h) => void pickHit(h)}
              onLock={(id) => {
                // k.ú. mimo našich dát (sr-<kód>): len prelet na k.ú., parcely sa hľadajú v národnom katastri
                if (id.startsWith("sr-")) {
                  void mapFeature({ data: { token: token ?? undefined, datasetId: id, kind: "LV", lvNo: null } }).then((f) => {
                    if (f?.center) { setUserNavigated(true); setFlyTo({ lat: f.center.lat, lng: f.center.lng, zoom: 13, nonce: Date.now() }); }
                    setSearchMsg(`${f?.kuName ?? "Toto k.ú."} nemáme importované — parcely C/E nájdeš z národného katastra, LV a vlastníkov v ZBGIS.`);
                  }).catch(() => {});
                } else if (id !== datasetId) void switchDataset(id);
              }}
              onPickPlace={(lat, lng) => { setUserNavigated(true); setFlyTo({ lat, lng, zoom: 18, nonce: Date.now() }); }} />
            {searchMsg ? <div className="mt-1 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-muted shadow">{searchMsg}</div> : null}
            {portfolio ? (
              <div className="mt-1 max-h-[45vh] w-[360px] max-w-[calc(100vw-5.5rem)] space-y-1 overflow-y-auto max-md:max-h-[35vh] rounded-xl border border-line bg-surface/97 p-2 text-xs shadow backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg">{portfolio.name} — {portfolio.lvs.length} LV v {new Set(portfolio.lvs.map((l) => l.datasetId)).size} k.ú.</span>
                  <button onClick={() => { setPortfolio(null); setHighlight(null); }} className="text-muted hover:text-fg" title="Zavrieť">✕</button>
                </div>
                <a href={`/vypis-hromadne?lv=${encodeURIComponent(portfolio.lvs.slice(0, 40).map((l) => `${l.datasetId}:${l.lvNo}`).join(","))}&print=1`} target="_blank" rel="noopener"
                  className="block rounded-md bg-ink px-2 py-1.5 text-center font-medium text-cream hover:opacity-90">🖨️ Tlačiť všetky LV{portfolio.lvs.length > 40 ? " (prvých 40)" : ""} — jedno PDF</a>
                {portfolio.lvs.map((l) => (
                  <button key={`${l.datasetId}:${l.lvNo}`} onClick={() => setLvPanel({ datasetId: l.datasetId, lvNo: l.lvNo, label: `LV ${l.lvNo} · ${l.kuName}` })}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-surface-2">
                    <span className="text-fg">LV {l.lvNo} · {l.kuName}</span><span className="text-muted">{l.share ?? ""}</span>
                  </button>
                ))}
                <div className="text-[10px] text-muted">Tá istá osoba = rovnaké meno a dátum narodenia. Parcely LV sú zvýraznené na mape.</div>
              </div>
            ) : null}
            {lvPanel ? (
              <div className="mt-1 w-[360px] max-w-[calc(100vw-5.5rem)] space-y-1 overflow-y-auto rounded-xl border border-line bg-surface/97 p-2 shadow backdrop-blur max-md:max-h-[40vh]">
                <div className="flex items-center justify-between text-xs"><span className="font-medium text-fg">{lvPanel.label}</span>
                  <button onClick={() => setLvPanel(null)} className="text-muted hover:text-fg" title="Zavrieť">✕</button></div>
                <LvCard datasetId={lvPanel.datasetId} lvNo={lvPanel.lvNo} />
              </div>
            ) : null}
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
            highlight={highlight}
            identifyAt={identifyAt}
            subdivision={showSub ? subItems : null}
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

// ——— ZBGIS vyhľadávanie (zadanie vlastníka 2026-11-11) ———
// Bez zámku: k.ú. (🔒 zamknúť), vlastník (len plný prístup), miesto/adresa. So zámkom k.ú. stačí číslo:
// „1500" → parcela C, parcela E, LV č. 1500, stavba so súpisným číslom 1500. Skratky: c / e / lv / sc.
const HIT_BADGE: Record<string, { t: string; cls: string }> = {
  ku: { t: "k.ú.", cls: "bg-ink/10 text-fg" }, C: { t: "C", cls: "bg-brand/15 text-brand" }, E: { t: "E", cls: "bg-green/15 text-green" },
  LV: { t: "LV", cls: "bg-ink text-cream" }, SC: { t: "s.č.", cls: "bg-surface-2 text-fg" }, owner: { t: "V", cls: "bg-ink/10 text-fg" },
};
function ZSearch({ datasets, onPick, onLock, onPickPlace }: { datasets: Dataset[]; onPick: (h: MapHit) => void; onLock: (datasetId: string) => void; onPickPlace: (lat: number, lng: number) => void }) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [lock, setLock] = useState<{ kuCode: string; datasetId: string; name: string } | null>(null);
  const [hits, setHits] = useState<MapHit[]>([]);
  const [needLock, setNeedLock] = useState(false);
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  function run(v: string, lk: typeof lock) {
    if (tRef.current) clearTimeout(tRef.current);
    if (gRef.current) clearTimeout(gRef.current);
    if (!v.trim()) { setHits([]); setPlaces([]); setNeedLock(false); return; }
    const my = ++reqRef.current;
    tRef.current = setTimeout(async () => {
      try {
        const r = await mapSearch({ data: { token: token ?? undefined, q: v.trim(), ku: lk?.kuCode } });
        if (my === reqRef.current) { setHits(r.hits); setNeedLock(!!r.needLock); }
      } catch { if (my === reqRef.current) setHits([]); }
    }, 200);
    if (!lk && v.trim().length >= 3 && !/^\d/.test(v.trim())) {
      gRef.current = setTimeout(async () => {
        try { setPlaces(await geocodePlace({ data: { q: v.trim() } })); } catch { setPlaces([]); }
      }, 450);
    } else setPlaces([]);
  }
  function onChange(v: string) { setQ(v); setOpen(true); run(v, lock); }
  function doLock(h: MapHit) {
    const lk = { kuCode: h.kuCode, datasetId: h.datasetId, name: h.label };
    setLock(lk); setQ(""); setHits([]); setPlaces([]); setOpen(false);
    onLock(h.datasetId);
  }
  function choose(h: MapHit) {
    if (h.kind === "ku") { doLock(h); return; }
    onPick(h); setOpen(false);
  }
  // deep link /mapa?ku=866083&c=1500 (ako ZBGIS) — zamkni a otvor
  useEffect(() => {
    if (typeof window === "undefined" || !datasets.length) return;
    const sp = new URLSearchParams(window.location.search);
    const ku = sp.get("ku"); if (!ku) return;
    const d = datasets.find((x) => x.ku_code === ku); if (!d) return;
    const lk = { kuCode: ku, datasetId: d.id, name: d.ku_name };
    setLock(lk);
    const [k, val] = (["c", "e", "lv", "sc"] as const).map((x) => [x, sp.get(x)] as const).find(([, v]) => v) ?? [null, null];
    if (k && val) {
      mapSearch({ data: { token: token ?? undefined, q: `${k} ${val}`, ku } }).then((r) => {
        const h = r.hits.find((x) => (x.no ?? String(x.lvNo ?? "")) === val || x.kind === "SC" || x.kind === "LV") ?? r.hits[0];
        if (h) onPick(h); else onLock(d.id);
      }).catch(() => onLock(d.id));
    } else onLock(d.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.length]);

  const list = [...hits];
  return (
    <div className="w-[360px] max-w-[calc(100vw-5.5rem)] max-md:w-full">
      <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-1 shadow-lg focus-within:border-brand">
        {lock ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg" title="Vyhľadávanie je zamknuté na toto k.ú.">
            🔒 {lock.name} ({lock.kuCode})
            <button onClick={() => { setLock(null); setHits([]); run(q, null); }} className="text-muted hover:text-fg" title="Odomknúť">✕</button>
          </span>
        ) : null}
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) choose(list[0]); if (e.key === "Escape") setOpen(false); }}
          placeholder={lock ? "číslo parcely C/E, LV, súpisné č.…" : "k.ú. / obec (🔒 zamknúť), vlastník, adresa…"}
          className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-sm text-fg outline-none"
        />
      </div>
      {open && (list.length || places.length || needLock) ? (
        <div className="mt-1 max-h-[52vh] overflow-y-auto rounded-xl border border-line bg-paper shadow-xl">
          {needLock && !lock ? (
            <div className="border-b border-line px-3 py-2 text-xs text-muted">Pre hľadanie podľa čísla najprv zamkni katastrálne územie: napíš jeho názov a klikni 🔒.</div>
          ) : null}
          {list.map((h, i) => {
            const b = HIT_BADGE[h.kind] ?? HIT_BADGE.ku;
            return (
              <div key={`${h.kind}-${h.datasetId}-${h.no ?? h.lvNo ?? h.label}-${i}`} className="flex items-center border-b border-line last:border-0 hover:bg-surface">
                <button onClick={() => choose(h)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.t}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{h.label}</span>
                    <span className="block truncate text-[11px] text-muted">{h.sub}</span>
                  </span>
                </button>
                {h.kind === "ku" ? (
                  <button onClick={() => doLock(h)} title="Zamknúť vyhľadávanie na toto k.ú." className="px-3 py-2 text-base text-muted hover:text-fg">🔒</button>
                ) : null}
              </div>
            );
          })}
          {places.map((p, i) => (
            <button key={`geo-${i}`} onClick={() => { onPickPlace(p.lat, p.lng); setOpen(false); setQ(p.label); }}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface">
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">📍</span>
              <span className="truncate text-sm text-fg">{p.label}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{p.kind}</span>
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
