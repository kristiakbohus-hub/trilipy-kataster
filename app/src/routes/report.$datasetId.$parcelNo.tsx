// PDF dossier parcely — jedno-klik podklad (kataster + ESKN/AVM + ÚP + limity + trh + siete).
// Tlač: window.print() (@media print skryje app chrome). Beží na CF (client-side print-to-PDF, bez server PDF).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getDatasets, getParcelByNo, getLvDetail, getParcelAccessibility, getParcelLimits,
  getUpDocs, getLocalityMedian, getParcelZone, getMarketListingsNear, esknIdentify,
  getProperty360, getLvLegal,
} from "../lib/api/kataster.functions";
import { useRole } from "../lib/role-context";
import { useAuth } from "../lib/auth-context";
import { CriteriaMatrix } from "../components/kit";
import { QUALITY_META } from "../lib/domain";
import { regulativFromZone, regulativByCode, proxyZone, developmentCalc } from "../lib/development";
import { useCalibDev } from "../lib/calib";
import { DocumentsPanel } from "../components/documents-panel";

// BEZ `loader`: beží počas SSR pred prihlasovacou bránou → dáta by videl ktokoľvek.
// Viď pamäť cf_app_ssr_loader_leak.
const UP_DOC_KIND: Record<string, string> = { vykres: "výkres", text: "textová časť", ine: "iné" };
export const Route = createFileRoute("/report/$datasetId/$parcelNo")({
  head: () => ({ meta: [{ title: "Dossier parcely — TRI LIPY KATASTER CORE" }] }),
  component: ReportPage,
});

// Pusher posiela strojové kódy (`zalozne_pravo`, `dedicstvo`…) — v klientskom dossieri musia byť
// po slovensky. Číselník zodpovedá hodnotám v lv_tarchy.type a lv_titles.type na Macu.
const LEGAL_LABEL: Record<string, string> = {
  zalozne_pravo: "Záložné právo", vecne_bremeno: "Vecné bremeno", predkupne: "Predkupné právo",
  najom: "Nájom", exekucia: "Exekúcia",
  dedicstvo: "Dedičstvo", kupa: "Kúpna zmluva", darovanie: "Darovacia zmluva",
  rozhodnutie: "Rozhodnutie", drazba: "Dražba", ine: "Iné",
};
// „zalozne_pravo 2019“ → „Záložné právo 2019“; neznámy kód nechá tak, nech sa nič nestratí.
const legalLabel = (raw: string) => raw.replace(/^([a-z_]+)/, (m) => LEGAL_LABEL[m] ?? m);
// 9 rovnakých riadkov pod sebou je šum → zoskupiť na „Záložné právo ×8“.
function groupLegal(items: string[]): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of items) { const l = legalLabel(it.trim()); m.set(l, (m.get(l) ?? 0) + 1); }
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
}

const eurM2 = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("sk-SK") + " €/m²");
const eur = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("sk-SK") + " €");
const m2 = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK") + " m²");

function sieteLinks(lat: number, lng: number): { kind: string; op: string; url: string }[] {
  const el = lng < 18.0
    ? { op: "ZSD — Západoslovenská distribučná", url: "https://www.zsdis.sk/Uvod/Podnikatelia/Sluzby-distribucie/Existencia-a-zakreslovanie-sieti" }
    : lng < 20.3
      ? { op: "SSD — Stredoslovenská distribučná", url: "https://www.ssd.sk" }
      : { op: "VSD — Východoslovenská distribučná", url: "https://www.vsds.sk/edso/mapa" };
  const zilina = lng >= 18.0 && lng < 19.7 && lat >= 49.0;
  return [
    { kind: "Elektrina", op: el.op, url: el.url },
    { kind: "Plyn", op: "SPP-distribúcia", url: "https://www.spp-distribucia.sk" },
    { kind: "Voda / kanalizácia", op: zilina ? "SEVAK" : "Miestny vodárenský podnik", url: zilina ? "https://www.sevak.sk" : "https://www.vodarne.eu" },
    { kind: "Telekom", op: "Slovak Telekom", url: "https://www.telekom.sk" },
  ];
}

function ReportPage() {
  const { datasetId, parcelNo } = Route.useParams();
  const [ds, setDs] = useState<Awaited<ReturnType<typeof getDatasets>>[number] | null>(null);
  const [parcel, setParcel] = useState<Awaited<ReturnType<typeof getParcelByNo>> | null>(null);
  useEffect(() => {
    getDatasets().then((all) => setDs(all.find((x) => x.id === datasetId) ?? null)).catch(() => {});
    getParcelByNo({ data: { datasetId, parcelNo } }).then(setParcel).catch(() => setParcel(null));
  }, [datasetId, parcelNo]);
  const { role } = useRole();
  const { token } = useAuth();
  const locality = (ds?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "").trim();

  const [lv, setLv] = useState<Awaited<ReturnType<typeof getLvDetail>> | null>(null);
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getParcelAccessibility>> | null>(null);
  const [limits, setLimits] = useState<Awaited<ReturnType<typeof getParcelLimits>> | null>(null);
  const [upDocs, setUpDocs] = useState<Awaited<ReturnType<typeof getUpDocs>>>([]);
  const [medPoz, setMedPoz] = useState<number | null>(null);
  const [zone, setZone] = useState<Awaited<ReturnType<typeof getParcelZone>> | null>(null);
  const [avm, setAvm] = useState<Awaited<ReturnType<typeof esknIdentify>>["avm"] | null>(null);
  const [market, setMarket] = useState<Awaited<ReturnType<typeof getMarketListingsNear>>>([]);
  const [signals, setSignals] = useState<Awaited<ReturnType<typeof getProperty360>> | null>(null);
  const [legal, setLegal] = useState<Awaited<ReturnType<typeof getLvLegal>> | null>(null);
  const [ready, setReady] = useState(false);
  const [resultHash, setResultHash] = useState<string | null>(null);

  useEffect(() => {
    if (!parcel) { setReady(true); return; }
    const lat = parcel.centroid_lat, lng = parcel.centroid_lng;
    const jobs: Promise<unknown>[] = [];
    if (parcel.lv_no != null) jobs.push(getLvDetail({ data: { datasetId, lvNo: parcel.lv_no, role, token: token ?? undefined } }).then(setLv).catch(() => {}));
    if (parcel.lv_no != null) jobs.push(getLvLegal({ data: { datasetId, lvNo: parcel.lv_no, role, token: token ?? undefined } }).then(setLegal).catch(() => {}));
    if (lat != null && lng != null) {
      jobs.push(getParcelAccessibility({ data: { lat, lng } }).then(setAccess).catch(() => {}));
      jobs.push(getParcelLimits({ data: { lat, lng } }).then(setLimits).catch(() => {}));
      jobs.push(getParcelZone({ data: { datasetId, lat, lng } }).then(setZone).catch(() => {}));
      jobs.push(esknIdentify({ data: { lat, lng } }).then((r) => setAvm(r.avm ?? null)).catch(() => {}));
      jobs.push(getMarketListingsNear({ data: { lat, lng, radiusKm: 10 } }).then(setMarket).catch(() => {}));
    }
    jobs.push(getProperty360({ data: { datasetId, parcelNo, lvNo: parcel.lv_no ?? null } }).then(setSignals).catch(() => {}));
    jobs.push(getUpDocs({ data: { datasetId } }).then(setUpDocs).catch(() => {}));
    if (locality) jobs.push(getLocalityMedian({ data: { okres: locality, ptype: "pozemok", deal: "predaj" } }).then((r) => setMedPoz(r.median)).catch(() => {}));
    Promise.allSettled(jobs).finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `parcel` a `locality` MUSIA byť v deps: kým prichádzali zo SSR loadera, boli dostupné už pri
    // prvom renderi. Teraz sa načítavajú asynchrónne — bez nich efekt zbehne s parcel===null,
    // vyskočí hneď na začiatku a nikdy sa nezopakuje (prázdne vlastníctvo, ťarchy, trh, dostupnosť).
  }, [datasetId, parcelNo, role, token, parcel, locality]);

  const calibDev = useCalibDev(); // Fáza 5: kalibrované dev sadzby

  // reg/dev/odhadCeny/siete sú null-safe (parcel môže byť null) — POZOR: musia byť PRED prípadným
  // early returnom nižšie, lebo bundle/hash hooky pod nimi musia byť volané nepodmienečne (Rules of Hooks).
  const reg = parcel ? (regulativFromZone(zone) ?? regulativByCode(proxyZone(parcel.use_type, null))) : null;
  const dev = (parcel && parcel.area_m2 && reg) ? developmentCalc(parcel.area_m2, reg, { ...calibDev.normal, predajEurM2: medPoz ?? calibDev.normal.predajEurM2 }) : null;
  const odhadCeny = (parcel && parcel.area_m2 && medPoz) ? parcel.area_m2 * medPoz : null;
  const siete = (parcel && parcel.centroid_lat != null && parcel.centroid_lng != null) ? sieteLinks(parcel.centroid_lat, parcel.centroid_lng) : [];

  // Property-360 kontrakt (42_NL docs/16 §6): strojovo čitateľný JSON export + result_hash —
  // rovnaké fakty/počty/hodnoty musia sedieť medzi web zobrazením a exportom (jeden ResultBundle).
  const bundle = useMemo(() => ({
    dataset: ds, parcel, lv, access, limits, upDocs, zone, avm, market, signals, legal,
    development: dev, odhadCenyEur: odhadCeny, medianEurM2: medPoz,
    as_of: ds?.updated_at ?? null,
  }), [ds, parcel, lv, access, limits, upDocs, zone, avm, market, signals, legal, dev, odhadCeny, medPoz]);

  useEffect(() => {
    if (!ready || !parcel) return;
    const data = new TextEncoder().encode(JSON.stringify(bundle));
    crypto.subtle.digest("SHA-256", data).then((buf) => {
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setResultHash(hex.slice(0, 16));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, parcel, bundle]);

  if (!parcel) return <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted">Parcela {parcelNo} sa v datasete nenašla. <Link to="/mapa" className="text-brand underline">Späť na mapu</Link></div>;

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ result_hash: resultHash, ...bundle }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dossier_${datasetId}_${parcelNo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="report-root mx-auto max-w-3xl px-6 py-6 text-fg">
      <style>{`@media print { .no-print { display:none !important } .report-root { max-width:none; padding:0 } header, nav, aside, footer { display:none !important } a { color:inherit; text-decoration:none } }`}</style>

      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link to="/mapa" className="text-sm text-muted hover:text-fg">← Mapa</Link>
        <button onClick={() => window.print()} className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-cream">Tlačiť / uložiť PDF</button>
      </div>

      <div className="mb-4 border-b-2 border-ink pb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">TRI LIPY · Dossier parcely</div>
        <h1 className="mt-1 text-2xl font-semibold">Parcela č. {parcel.parcel_no} <span className="text-base font-normal text-muted">({parcel.kn_type})</span></h1>
        <div className="mt-0.5 text-sm text-muted">{ds?.ku_name ?? datasetId}{ds?.region ? ` · ${ds.region}` : ""}</div>
      </div>

      <Section title="Základné údaje">
        <Grid rows={[
          ["Výmera", m2(parcel.area_m2)],
          ["Druh pozemku", parcel.use_type ?? "—"],
          ["Register", parcel.kn_type ?? "—"],
          ["LV", parcel.lv_no != null ? String(parcel.lv_no) : "—"],
          ["Vysporiadanosť", parcel.settled === 1 ? "vysporiadaná (C-KN)" : parcel.settled === 0 ? `nevysporiadaná${parcel.ekn_ref ? ` — E-KN ${parcel.ekn_ref}` : ""}` : "—"],
          ["Evidenčný celok", parcel.celok != null ? String(parcel.celok) : "—"],
        ]} />
      </Section>

      <Section title="Mapa / Geometria">
        <Grid rows={[
          ["Kvalita geometrie", parcel.geometry_quality ? `${QUALITY_META[parcel.geometry_quality]?.label ?? parcel.geometry_quality}` : "—"],
          ["Geometria k dispozícii", parcel.geometry_json ? "áno (polygón)" : "nie (len centroid/bez geometrie)"],
          ["Súradnice (CRS WGS84, EPSG:4326)", parcel.centroid_lat != null && parcel.centroid_lng != null ? `${parcel.centroid_lat.toFixed(5)}, ${parcel.centroid_lng.toFixed(5)}` : "—"],
          ["Zdrojový CRS", "S-JTSK (EPSG:5514) — transformované na WGS84 pre zobrazenie"],
          ["Prístupové body", access ? "doložené — pozri sekciu Dostupnosť" : "—"],
        ]} />
        <div className="no-print mt-1">
          <Link to="/mapa" className="text-xs text-brand underline">Otvoriť na mape →</Link>
        </div>
      </Section>

      <Section title="Vlastníctvo (LV)">
        {lv == null ? <Muted>—</Muted> : lv.access === "full" ? (
          <table className="w-full text-sm"><tbody>
            {lv.owners.map((o, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className="py-1 pr-2">{String((o as { name?: string }).name ?? "vlastník")}</td>
                <td className="py-1 text-right tabular-nums text-muted">{String((o as { share?: string }).share ?? "")}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <Muted>{lv.count} vlastníkov (mená chránené — rola bez plného prístupu).</Muted>}
      </Section>

      {/* Property-360 §2: Tituly (časť B). Plný text je owner-sensitive → len rola s plným prístupom. */}
      <Section title="Tituly (časť B)">
        {parcel.lv_no == null ? <Muted>Parcela nemá priradené LV — tituly sa nedajú priradiť.</Muted>
          : legal == null ? <Muted>{ready ? "Údaje o tituloch sa nepodarilo načítať." : "Načítavam…"}</Muted>
          : !legal.hasData ? <Muted>O tomto LV nemáme záznam časti B. Neznamená to, že tituly neexistujú — over na úradnom výpise.</Muted>
          : legal.titlesCount === 0 ? <Muted>V našom zázname nie je k tomuto LV uvedený žiadny titul nadobudnutia.</Muted>
          : legal.access === "full" ? (
            <ul className="space-y-1 text-sm">
              {groupLegal(legal.titles).map((g, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-line/40 py-0.5">
                  <span>{g.label}</span>
                  {g.n > 1 ? <span className="shrink-0 tabular-nums text-muted">×{g.n}</span> : null}
                </li>
              ))}
            </ul>
          ) : <Muted>{legal.titlesCount} titulov (text chránený — rola bez plného prístupu).</Muted>}
      </Section>

      {/* Property-360 §2 + §4: nikdy netvrdiť „bez tiarch“ — chýbajúci záznam je NEZNÁMY stav. */}
      <Section title="Ťarchy a poznámky (časť C)">
        {parcel.lv_no == null ? <Muted>Parcela nemá priradené LV — ťarchy sa nedajú priradiť.</Muted>
          : legal == null ? (
            <Muted>
              {ready
                ? "Údaje o ťarchách sa nepodarilo načítať — stav je NEZNÁMY, nie „bez tiarch“. Over na úradnom výpise."
                : "Načítavam…"}
            </Muted>
          )
          : !legal.hasData ? (
            <Muted>
              O tomto LV nemáme záznam časti C. <b>Nie je to potvrdenie, že pozemok je bez tiarch</b> —
              stav je neznámy, over ho na úradnom výpise z listu vlastníctva.
            </Muted>
          )
          : legal.tarchyCount === 0 ? (
            <Muted>
              V našom snapshote nie je k tomuto LV zapísaná žiadna ťarcha. Pred prevodom to over na
              úradnom výpise — náš záznam je informatívny a nemusí byť aktuálny.
            </Muted>
          )
          : legal.access === "full" ? (
            <>
              <div className="mb-2 text-sm font-medium" style={{ color: "#a4553a" }}>
                {legal.tarchyCount}× zapísaná ťarcha alebo poznámka
              </div>
              <ul className="space-y-1 text-sm">
                {groupLegal(legal.tarchy).map((g, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-line/40 py-0.5">
                    <span>{g.label}</span>
                    {g.n > 1 ? <span className="shrink-0 tabular-nums text-muted">×{g.n}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-sm" style={{ color: "#a4553a" }}>
              {legal.tarchyCount}× zapísaná ťarcha alebo poznámka — text chránený (rola bez plného prístupu).
            </div>
          )}
      </Section>

      {signals && (signals.settlement.length > 0 || signals.landsearch.length > 0 || signals.deal) ? (
        <Section title="Prepojené signály (360°)">
          <div className="space-y-1 text-sm">
            {signals.settlement.map((s, i) => (
              <div key={`st${i}`} className="border-b border-line/50 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <b>Vysporiadanie</b> — {s.classification === "MATCH" ? "kandidát" : "na preskúmanie"}
                    {s.classification === "MATCH" ? (s.minority_share ? " · menšinový podiel" : " · cudzí pozemok") : ""}
                    {s.register ? ` · ${s.register}-KN` : ""}{s.n_land_owners ? ` · ${s.n_land_owners} vlastníkov` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {s.buyout_eur != null ? <span className="tabular-nums text-muted">{eur(s.buyout_eur)}</span> : null}
                    <Link to="/vysporiadanie" className="no-print text-brand underline">detail</Link>
                  </span>
                </div>
                <CriteriaMatrix json={s.criteria_json} />
              </div>
            ))}
            {signals.landsearch.map((l, i) => (
              <div key={`ls${i}`} className="flex items-center justify-between gap-2 border-b border-line/50 py-1">
                <span><b>Príležitosť</b> — {l.purpose ?? "?"} · {l.verdict ?? "?"}{l.quality != null ? ` · skóre ${Math.round(l.quality)}` : ""}</span>
                <Link to="/prilezitosti" className="no-print text-brand underline">detail</Link>
              </div>
            ))}
            {signals.deal ? (
              <div className="flex items-center justify-between gap-2 py-1">
                <span><b>Deal v pipeline</b> — stav {signals.deal.status}</span>
                <Link to="/deals" className="no-print text-brand underline">pipeline</Link>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Ocenenie (AVM + medián lokality)">
        <Grid rows={[
          ["AVM — odhad hodnoty", avm && avm.estimate_eur != null ? `${eur(avm.estimate_eur)} (${eur(avm.low_eur)}–${eur(avm.high_eur)})` : "—"],
          ["AVM — €/m² · trieda · spoľahlivosť", avm && avm.estimate_eur != null ? `${eurM2(avm.ppm2)} · ${avm.klass} · ${avm.confidence}` : "—"],
          ["Medián lokality (pozemok)", eurM2(medPoz)],
          ["Odhad hodnoty (medián × výmera)", odhadCeny ? eur(odhadCeny) : "—"],
        ]} />
        <Muted>Orientačné, z inzercie lokality {locality || "—"}. Nie znalecký posudok.</Muted>
      </Section>

      <Section title="Development potenciál (ÚP regulatív)">
        {dev ? (
          <Grid rows={[
            ["Regulatív (zóna)", `${reg?.name ?? "—"} (IZP ${reg?.izp ?? "—"} · KZ ${reg?.kz ?? "—"} · IPP ${reg?.ipp ?? "—"})`],
            ["Zastavateľnosť (IZP max.)", m2(Math.round(dev.izpArea))],
            ["Hrubá podlažná plocha (HPP)", m2(Math.round(dev.hpp))],
            ["Čistá predajná plocha (ČPP)", m2(Math.round(dev.cpp))],
            ["Odhad počtu bytov", String(dev.byty ?? "—")],
            ["Odhad GDV (hrubá hodnota)", eur(dev.ekonomika.gdv)],
          ]} />
        ) : <Muted>Bez výmery / nezastavateľné.</Muted>}
        <Muted>Regulatívy z ÚP (zóna alebo číselník). Model orientačný.</Muted>
      </Section>

      <Section title="Limity výstavby (úradné registre)">
        {limits && limits.items.length ? (
          <div className="text-sm">
            {limits.items.map((h) => (
              <div key={h.key} className="flex items-center justify-between border-b border-line/40 py-0.5">
                <span className="text-muted">{h.label} <span className="text-[10px]">({h.attribution})</span></span>
                <span style={{ color: h.error ? "#888" : h.hit ? "#9c4a40" : "#3f5a3c" }}>{h.error ? "nedostupné" : h.hit ? `zasiahnuté${h.count > 1 ? ` (${h.count}×)` : ""}` : "bez limitu"}</span>
              </div>
            ))}
          </div>
        ) : <Muted>—</Muted>}
      </Section>

      <Section title="Inžinierske siete (vyjadrenie správcov)">
        {siete.length ? (
          <Grid rows={siete.map((s) => [s.kind, `${s.op} — ${s.url}`] as [string, string])} />
        ) : <Muted>—</Muted>}
        <Muted>Detailné siete nie sú otvorené dáta — polohu potvrdí správca cez „vyjadrenie k existencii sietí".</Muted>
      </Section>

      <Section title="Trh v okolí (inzercia ≤10 km)">
        {market.length ? (
          <table className="w-full text-sm"><tbody>
            {market.slice(0, 8).map((mkt, i) => (
              <tr key={i} className="border-b border-line/40">
                <td className="py-1 pr-2">{(mkt.title ?? mkt.ptype ?? "inzerát").slice(0, 48)}</td>
                <td className="py-1 pr-2 text-muted">{mkt.obec ?? mkt.okres ?? ""}</td>
                <td className="py-1 text-right tabular-nums">{eur(mkt.price_eur)}{mkt.ppm2 ? ` · ${Math.round(mkt.ppm2)} €/m²` : ""}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <Muted>Žiadne inzeráty v okolí.</Muted>}
      </Section>

      <Section title="Dostupnosť (doprava · vybavenosť)">
        {access ? (
          <div className="grid grid-cols-2 gap-x-6 text-sm">
            {[...Object.entries(access.transport), ...Object.entries(access.amenities), ...Object.entries(access.infra)]
              .filter(([, v]) => v).slice(0, 12).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line/40 py-0.5">
                  <span className="text-muted">{k}</span>
                  <span className="tabular-nums">{v ? `${v.dist < 1000 ? v.dist + " m" : (v.dist / 1000).toFixed(1) + " km"}` : "—"}</span>
                </div>
              ))}
          </div>
        ) : <Muted>—</Muted>}
      </Section>

      {parcel.bpej ? (
        <Section title="Pôda (BPEJ / odňatie)">
          <Grid rows={[
            ["BPEJ kód", parcel.bpej],
            ["Skupina kvality", parcel.bpej_skupina != null ? String(parcel.bpej_skupina) : "—"],
            ["Odhad odvodu za odňatie", parcel.odnatie_eur != null ? eur(parcel.odnatie_eur) : "—"],
          ]} />
        </Section>
      ) : null}

      <Section title="Územný plán — dokumenty">
        {upDocs.length ? (
          <ul className="list-disc pl-5 text-sm">
            {upDocs.slice(0, 20).map((d) => (
              <li key={d.id}><a href={d.url ?? "#"} className="text-brand underline">{d.title ?? "dokument"}</a> <span className="text-[10px] text-muted">{UP_DOC_KIND[d.kind ?? ""] ?? d.kind}</span></li>
            ))}
          </ul>
        ) : <Muted>Žiadne ÚP dokumenty pre k.ú.</Muted>}
      </Section>

      <div className="no-print">
        <Section title="Dokumenty k parcele (interné)">
          <DocumentsPanel datasetId={datasetId} subjectType="parcel" subjectRef={parcelNo} role={role} compact />
        </Section>
      </div>

      {!ready ? <div className="no-print mt-4 text-center text-xs text-muted">Načítavam dáta dossieru…</div> : null}

      <Section title="Zdroje a export">
        <Grid rows={[
          ["Snapshot dát (as_of)", ds?.updated_at ?? "—"],
          ["result_hash", resultHash ?? "počíta sa…"],
          ["Pokrytie", `${[lv, access, limits, zone, avm].filter((x) => x != null).length}/5 sekcií s dátami${market.length ? ` · ${market.length} inzerátov` : ""}`],
        ]} />
        <div className="no-print mt-1">
          <button onClick={downloadJson} disabled={!ready} className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2 disabled:opacity-50">
            Stiahnuť JSON (strojovo čitateľný export)
          </button>
        </div>
        <Muted>result_hash je odtlačok zobrazeného obsahu (SHA-256, prvých 16 hex znakov) — rovnaký hash vo web zobrazení a v JSON exporte potvrdzuje, že ide o identické fakty. Časová platnosť = snapshot dát (as_of), nie čas renderovania.</Muted>
      </Section>

      <div className="mt-6 border-t border-line pt-2 text-[10px] leading-snug text-muted">
        Dossier je orientačný pracovný podklad z verejných a katastrálnych dát — nie znalecký posudok ani právny/geodetický záver.
        Vlastnícke údaje sú rolovo maskované. Vygenerované: {new Date().toLocaleString("sk-SK")}.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <div className="mb-1 text-sm font-semibold uppercase tracking-wide text-fg">{title}</div>
      {children}
    </div>
  );
}
function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm"><tbody>
      {rows.map(([k, v], i) => (
        <tr key={i} className="border-b border-line/50">
          <td className="w-1/2 py-1 pr-2 text-muted">{k}</td>
          <td className="py-1 text-fg">{v}</td>
        </tr>
      ))}
    </tbody></table>
  );
}
function Muted({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted">{children}</div>;
}
