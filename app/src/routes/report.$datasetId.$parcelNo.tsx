// PDF dossier parcely — jedno-klik podklad (kataster + ESKN/AVM + ÚP + limity + trh + siete).
// Tlač: window.print() (@media print skryje app chrome). Beží na CF (client-side print-to-PDF, bez server PDF).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  getDatasets, getParcelByNo, getLvDetail, getParcelAccessibility, getParcelLimits,
  getUpDocs, getLocalityMedian, getParcelZone, getMarketListingsNear, esknIdentify,
} from "../lib/api/kataster.functions";
import { useRole } from "../lib/role-context";
import { regulativFromZone, regulativByCode, proxyZone, developmentCalc, DEV_DEFAULTS } from "../lib/development";

export const Route = createFileRoute("/report/$datasetId/$parcelNo")({
  head: () => ({ meta: [{ title: "Dossier parcely — TRI LIPY KATASTER CORE" }] }),
  loader: async ({ params }) => {
    const datasets = await getDatasets().catch(() => []);
    const ds = datasets.find((d) => d.id === params.datasetId) ?? null;
    const parcel = await getParcelByNo({ data: { datasetId: params.datasetId, parcelNo: params.parcelNo } }).catch(() => null);
    return { ds, parcel };
  },
  component: ReportPage,
});

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
  const { ds, parcel } = Route.useLoaderData();
  const { datasetId, parcelNo } = Route.useParams();
  const { role } = useRole();
  const locality = (ds?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "").trim();

  const [lv, setLv] = useState<Awaited<ReturnType<typeof getLvDetail>> | null>(null);
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getParcelAccessibility>> | null>(null);
  const [limits, setLimits] = useState<Awaited<ReturnType<typeof getParcelLimits>> | null>(null);
  const [upDocs, setUpDocs] = useState<Awaited<ReturnType<typeof getUpDocs>>>([]);
  const [medPoz, setMedPoz] = useState<number | null>(null);
  const [zone, setZone] = useState<Awaited<ReturnType<typeof getParcelZone>> | null>(null);
  const [avm, setAvm] = useState<Awaited<ReturnType<typeof esknIdentify>>["avm"] | null>(null);
  const [market, setMarket] = useState<Awaited<ReturnType<typeof getMarketListingsNear>>>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!parcel) { setReady(true); return; }
    const lat = parcel.centroid_lat, lng = parcel.centroid_lng;
    const jobs: Promise<unknown>[] = [];
    if (parcel.lv_no != null) jobs.push(getLvDetail({ data: { datasetId, lvNo: parcel.lv_no, role } }).then(setLv).catch(() => {}));
    if (lat != null && lng != null) {
      jobs.push(getParcelAccessibility({ data: { lat, lng } }).then(setAccess).catch(() => {}));
      jobs.push(getParcelLimits({ data: { lat, lng } }).then(setLimits).catch(() => {}));
      jobs.push(getParcelZone({ data: { datasetId, lat, lng } }).then(setZone).catch(() => {}));
      jobs.push(esknIdentify({ data: { lat, lng } }).then((r) => setAvm(r.avm ?? null)).catch(() => {}));
      jobs.push(getMarketListingsNear({ data: { lat, lng, radiusKm: 10 } }).then(setMarket).catch(() => {}));
    }
    jobs.push(getUpDocs({ data: { datasetId } }).then(setUpDocs).catch(() => {}));
    if (locality) jobs.push(getLocalityMedian({ data: { okres: locality, ptype: "pozemok", deal: "predaj" } }).then((r) => setMedPoz(r.median)).catch(() => {}));
    Promise.allSettled(jobs).finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, parcelNo, role]);

  if (!parcel) return <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted">Parcela {parcelNo} sa v datasete nenašla. <Link to="/mapa" className="text-brand underline">Späť na mapu</Link></div>;

  const reg = regulativFromZone(zone) ?? regulativByCode(proxyZone(parcel.use_type, null));
  const dev = parcel.area_m2 && reg ? developmentCalc(parcel.area_m2, reg, { ...DEV_DEFAULTS, predajEurM2: medPoz ?? DEV_DEFAULTS.predajEurM2 }) : null;
  const odhadCeny = parcel.area_m2 && medPoz ? parcel.area_m2 * medPoz : null;
  const siete = parcel.centroid_lat != null && parcel.centroid_lng != null ? sieteLinks(parcel.centroid_lat, parcel.centroid_lng) : [];

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
              <li key={d.id}><a href={d.url ?? "#"} className="text-brand underline">{d.title ?? "dokument"}</a> <span className="text-[10px] text-muted">{d.kind}</span></li>
            ))}
          </ul>
        ) : <Muted>Žiadne ÚP dokumenty pre k.ú.</Muted>}
      </Section>

      {!ready ? <div className="no-print mt-4 text-center text-xs text-muted">Načítavam dáta dossieru…</div> : null}
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
