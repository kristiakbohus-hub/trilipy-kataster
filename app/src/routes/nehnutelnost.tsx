// LIST NEHNUTEĽNOSTI — interná verzia (rozhodnutie vlastníka 2026-11-12). Jednotka = celok (stavba + pozemok pod
// ňou + priľahlé parcely tých istých vlastníkov), byt alebo LV. Otvára sa z parcely (?ds&p[&reg=E]), LV (?ds&lv),
// súpisného čísla (?ds&sc) alebo bytu (?ds&byt). Dáta: getPropertyCore (všetko z D1) + živé registre (limity,
// dostupnosť, AVM, ÚP zóna). BEZ `loader` (pamäť cf_app_ssr_loader_leak): načítava sa až po prihlásení.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  esknIdentify, getDatasets, getLocalityMedian, getParcelAccessibility, getParcelLimits, getParcelZone, getPropertyCore,
  getFinanceMarket, getPropertyExt, getShading, getUpDocs, type PropertyCore,
} from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { useRole } from "../lib/role-context";
import { useCalibDev } from "../lib/calib";
import { developmentCalc, proxyZone, regulativByCode, regulativFromZone } from "../lib/development";
import { PropertySheet } from "../components/property-sheet";
import { BuyersSection } from "../components/parcel-buyers";
import { CommentsPanel, WatchButton } from "../components/collab";
import { DocumentsPanel } from "../components/documents-panel";
import { PropertyShareBox } from "../components/property-share";
import type { SheetData } from "../lib/property-eval";
import type { FinInputs } from "../lib/finance";
import { loadPhotos } from "../lib/photos";

type Search = { ds?: string; p?: string; reg?: "C" | "E"; lv?: string; sc?: string; byt?: string };
export const Route = createFileRoute("/nehnutelnost")({
  head: () => ({ meta: [{ title: "List nehnuteľnosti — TRI LIPY KATASTER CORE" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ds: typeof s.ds === "string" ? s.ds : undefined,
    p: typeof s.p === "string" || typeof s.p === "number" ? String(s.p) : undefined,
    reg: s.reg === "E" ? "E" : s.reg === "C" ? "C" : undefined,
    lv: typeof s.lv === "string" || typeof s.lv === "number" ? String(s.lv) : undefined,
    sc: typeof s.sc === "string" || typeof s.sc === "number" ? String(s.sc) : undefined,
    byt: typeof s.byt === "string" ? s.byt : undefined,
  }),
  component: PropertyPage,
});

function PropertyPage() {
  const s = Route.useSearch();
  const { token } = useAuth();
  const { role } = useRole();
  const kind = s.byt ? "byt" : s.sc ? "stavba" : s.lv ? "lv" : s.p ? "parcela" : null;
  const ref = s.byt ?? s.sc ?? s.lv ?? s.p ?? null;
  const [core, setCore] = useState<PropertyCore | null>(null);
  const [env, setEnv] = useState<Omit<SheetData, "core" | "dev" | "generatedAt">>({ limits: null, access: null, zone: null, avm: null, medPoz: null, upDocs: [], ext: null, fin: null, shade: null, photos: null });
  const [rawZone, setRawZone] = useState<Awaited<ReturnType<typeof getParcelZone>>>(null);
  const [ready, setReady] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [finIn, setFinIn] = useState<Partial<FinInputs>>({});
  const [teaser, setTeaser] = useState(false);
  const calibDev = useCalibDev();

  useEffect(() => {
    if (!token || !s.ds || !kind || !ref) return;
    setCore(null); setReady(false);
    getPropertyCore({ data: { token, datasetId: s.ds, kind, ref, register: s.reg } })
      .then(setCore).catch(() => setCore({ ok: false, message: "List sa nepodarilo načítať." } as unknown as PropertyCore));
  }, [token, s.ds, kind, ref, s.reg]);

  useEffect(() => {
    if (!core?.ok || !token) return;
    const { lat, lng } = core.main;
    const jobs: Promise<unknown>[] = [];
    const patch = (p: Partial<typeof env>) => setEnv((e) => ({ ...e, ...p }));
    if (lat != null && lng != null) {
      jobs.push(getParcelLimits({ data: { lat, lng } }).then((limits) => patch({ limits })).catch(() => {}));
      jobs.push(getParcelAccessibility({ data: { lat, lng } }).then((access) => patch({ access: access as SheetData["access"] })).catch(() => {}));
      jobs.push(getParcelZone({ data: { datasetId: core.dataset!.id, lat, lng } }).then((z) => { setRawZone(z); patch({ zone: z as SheetData["zone"] }); }).catch(() => {}));
      jobs.push(esknIdentify({ data: { lat, lng } }).then((r) => patch({ avm: r.avm ?? null })).catch(() => {}));
      jobs.push(getPropertyExt({ data: { token, lat, lng, datasetId: core.dataset!.id } }).then((r) => patch({ ext: r.ok ? r.items : null })).catch(() => {}));
      jobs.push(getShading({ data: { token, lat, lng } }).then((r) => patch({ shade: r.shade })).catch(() => {}));
    }
    jobs.push(loadPhotos(core.dataset!.id, core.main.lvNo ?? core.lvs[0] ?? null).then((photos) => patch({ photos })).catch(() => {}));
    jobs.push(getFinanceMarket({ data: { token } }).then((r) => patch({ fin: r.market })).catch(() => {}));
    jobs.push(getUpDocs({ data: { datasetId: core.dataset!.id } }).then((d) => patch({ upDocs: d.map((x) => ({ id: x.id, title: x.title, url: x.url, kind: x.kind })) })).catch(() => {}));
    const okres = core.dataset?.okres ?? (core.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "");
    if (okres) jobs.push(getLocalityMedian({ data: { okres, ptype: "pozemok", deal: "predaj" } }).then((r) => patch({ medPoz: r.median })).catch(() => {}));
    Promise.allSettled(jobs).finally(() => setReady(true));
  }, [core, token]);

  const dev = useMemo<SheetData["dev"]>(() => {
    if (!core?.ok) return null;
    const p = core.parcels.find((x) => x.parcel_no === core.main.parcelNo) ?? core.parcels[0];
    const area = core.parcels.filter((x) => x.register === "C").reduce((t, x) => t + (x.area_m2 ?? 0), 0);
    if (!p || !area) return null;
    const regUp = regulativFromZone(rawZone);
    const reg = regUp ?? regulativByCode(proxyZone(p.use_type, p.placement));
    if (!reg) return null;
    const r = developmentCalc(area, reg, { ...calibDev.normal, predajEurM2: env.medPoz ?? calibDev.normal.predajEurM2 });
    return { regName: reg.name ?? null, proxy: !regUp, izp: reg.izp ?? null, kz: reg.kz ?? null, ipp: reg.ipp ?? null, izpArea: r.izpArea, hpp: r.hpp, cpp: r.cpp, byty: r.byty ?? null, gdv: r.ekonomika?.gdv ?? null };
  }, [core, rawZone, env.medPoz, calibDev]);

  const sheet = useMemo<SheetData | null>(() => (core?.ok ? { core, ...env, dev, generatedAt: new Date().toISOString() } : null), [core, env, dev]);

  useEffect(() => {
    if (!ready || !sheet) return;
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ ...sheet, generatedAt: null })))
      .then((b) => setHash(Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16))).catch(() => {});
  }, [ready, sheet]);

  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa.</div>;
  if (!s.ds || !kind || !ref) return <Picker />;
  if (!core) return <div className="p-6 text-sm text-muted">Zostavujem list nehnuteľnosti…</div>;
  if (!core.ok || !sheet) return <div className="p-6 text-sm text-muted">{core.message ?? "List nie je dostupný."} <Link to="/nehnutelnost" className="text-brand underline">Otvoriť iný</Link></div>;

  const lv = core.main.lvNo ?? core.lvs[0] ?? null;
  const mainC = core.main.register === "C" ? core.main.parcelNo : null;
  function downloadJson() {
    const blob = new Blob([JSON.stringify({ result_hash: hash, ...sheet }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `list_${core!.dataset?.ku_code ?? ""}_${(ref ?? "").replace(/[^0-9a-z]+/gi, "-")}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="px-4 py-5 print:p-0">
      {teaser ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2 text-xs"><button onClick={() => setTeaser(false)} className="rounded-md border border-line px-3 py-1.5">← Celý list</button><button onClick={() => window.print()} className="rounded-md bg-ink px-3 py-1.5 font-medium text-cream">Tlačiť teaser</button></div>
          <PropertySheet d={{ ...sheet, variant: "teaser", finInputs: finIn }} mode="client" />
        </div>
      ) : null}
      {!teaser ? <PropertySheet d={sheet} mode="internal" onFinInputs={setFinIn} internal={{
        actions: (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button onClick={() => window.print()} className="rounded-md bg-ink px-3 py-1.5 font-medium text-cream">Tlačiť / uložiť PDF</button>
            <button onClick={() => setTeaser(true)} className="rounded-md border border-line px-3 py-1.5 hover:border-ink">Teaser (1 strana)</button>
            <Link to="/ziadosti" search={{ ds: core.dataset!.id, p: mainC ?? undefined, lv: lv != null ? String(lv) : undefined }} className="rounded-md border border-line px-3 py-1.5 hover:border-ink">Žiadosti (siete, ÚPI)</Link>
            {lv != null ? <Link to="/obhliadka" search={{ ds: core.dataset!.id, lv: String(lv), p: mainC ?? undefined }} className="rounded-md border border-line px-3 py-1.5 hover:border-ink">Obhliadka (mobil)</Link> : null}
            {core.signals.briefs.length ? <Link to="/porovnanie" search={{ brief: String(core.signals.briefs[0].brief_id) }} className="rounded-md border border-line px-3 py-1.5 hover:border-ink">Porovnať s kandidátmi zadania #{core.signals.briefs[0].brief_id}</Link> : null}
            <button onClick={downloadJson} disabled={!ready} className="rounded-md border border-line px-3 py-1.5 hover:border-ink disabled:opacity-50">Stiahnuť JSON</button>
            {lv != null ? <WatchButton subjectType="lv" subjectId={`${core.dataset!.id}:${lv}`} label={core.title} /> : null}
            {lv != null ? <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: core.dataset!.id, lvNo: String(lv) }} search={{ typ: "vypis" as const }} className="text-brand underline">Výpis LV {lv}</Link> : null}
            {mainC ? <Link to="/report/$datasetId/$parcelNo" params={{ datasetId: core.dataset!.id, parcelNo: mainC }} className="text-brand underline">Dossier parcely</Link> : null}
            <span className="text-muted">{ready ? `odtlačok ${hash ?? "…"}` : "načítavam registre…"}</span>
            <div className="w-full"><PropertyShareBox sheet={{ ...sheet, finInputs: finIn }} ready={ready} /></div>
          </div>
        ),
        buyers: mainC ? <BuyersSection datasetId={core.dataset!.id} parcelNo={mainC} token={token} kuName={(core.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "") || null} areaM2={core.parcels.reduce((t, x) => t + (x.area_m2 ?? 0), 0) || null} /> : null,
        work: lv != null ? (
          <div className="no-print space-y-3">
            <CommentsPanel subjectType="lv" subjectId={`${core.dataset!.id}:${lv}`} />
            <DocumentsPanel datasetId={core.dataset!.id} subjectType="lv" subjectRef={String(lv)} role={role} compact />
          </div>
        ) : null,
      }} /> : null}
    </div>
  );
}

/** Otvorenie listu bez odkazu: k.ú. + parcela / LV / súpisné číslo. */
function Picker() {
  const nav = useNavigate();
  const [dss, setDss] = useState<{ id: string; ku_name: string | null }[]>([]);
  const [ds, setDs] = useState("");
  const [kind, setKind] = useState<"p" | "lv" | "sc">("p");
  const [ref, setRef] = useState("");
  const [reg, setReg] = useState<"C" | "E">("C");
  useEffect(() => { getDatasets().then((r) => setDss(r.map((x) => ({ id: x.id, ku_name: x.ku_name })))).catch(() => {}); }, []);
  function go(e: FormEvent) {
    e.preventDefault();
    if (!ds || !ref.trim()) return;
    const v = ref.trim();
    const search: Search = kind === "p" ? { ds, p: v, ...(reg === "E" ? { reg: "E" as const } : {}) } : kind === "lv" ? { ds, lv: v } : { ds, sc: v };
    void nav({ to: "/nehnutelnost", search });
  }
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
      <h1 className="text-xl font-semibold">List nehnuteľnosti</h1>
      <p className="text-sm text-muted">Všetko, čo appka vie o nehnuteľnosti, na jednom mieste: kataster, právny stav, prístup, ÚP, limity, terén a slnko, klíma, siete, hodnota zo skutočných predajov, trh a čo overiť pred kúpou. Z parcely sa automaticky zostaví celok — stavba s pozemkom a priľahlé parcely tých istých vlastníkov.</p>
      <form onSubmit={go} className="space-y-3 rounded-lg border border-line bg-paper p-4 text-sm">
        <label className="block">Katastrálne územie
          <select value={ds} onChange={(e) => setDs(e.target.value)} className="mt-1 w-full rounded border border-line bg-surface px-2 py-1.5">
            <option value="">— vyber —</option>
            {dss.map((d) => <option key={d.id} value={d.id}>{(d.ku_name ?? d.id).replace(/^k\.ú\.\s*/i, "")}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          {([["p", "Parcela"], ["lv", "List vlastníctva"], ["sc", "Súpisné číslo"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1"><input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {l}</label>
          ))}
          {kind === "p" ? <select value={reg} onChange={(e) => setReg(e.target.value as "C" | "E")} className="rounded border border-line bg-surface px-1 py-0.5 text-xs"><option value="C">register C</option><option value="E">register E</option></select> : null}
        </div>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={kind === "p" ? "napr. 1234/5" : kind === "lv" ? "napr. 812" : "napr. 345"} className="w-full rounded border border-line bg-surface px-2 py-1.5" />
        <button type="submit" className="rounded-md bg-ink px-4 py-1.5 font-medium text-cream">Otvoriť list</button>
      </form>
    </div>
  );
}
