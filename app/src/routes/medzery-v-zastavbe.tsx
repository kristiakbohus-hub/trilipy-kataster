import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getScenarioVariantRows, type ScenarioSchema, type ScenarioVariant } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { ScenarioSwitches, variantParams } from "../components/scenario-switches";
import { kuLabel } from "../lib/domain";
import { ReasonFilter, reasonCounts, reasonFromKeys } from "../components/reason-filter";
import { SketchSvg, type Sketch } from "../components/subdivision-sketch";

// GOLD-11 — STAVEBNÉ MEDZERY V ZÁSTAVBE (2026-11-14). Engine 21_NL_SEARCH/gold11_find.py + gold11_live.py (mapa KN,
// SPI, pôdorysy ZBGIS, DMR 5.0, vedenia z OSM, ÚP). Výsledky žijú len ako varianty (0117) — predvolený beh zakladá
// a po importe obnovuje Mac. ZÁMERNE BEZ `loader` (SSR by dáta vložil do HTML pred prihlasovacou bránou).
export const Route = createFileRoute("/medzery-v-zastavbe")({
  head: () => ({ meta: [{ title: "Medzery v zástavbe — TRI LIPY KATASTER CORE" }] }),
  component: InfillPage,
});

type G11 = {
  kodKu: string; kuName: string | null; datasetId: string | null; classification: string; score: number | null; site: string[];
  lotM2: number; gapWidthM: number; gapDepthM: number; buildableM2: number; buildableWidthM: number; housesLeft: number;
  housesRight: number; powerLine: string | null; ownerType: string | null; zone: string | null; slopePct: number | null;
  frontageM: number; sketch: Sketch | null; pt: [number, number] | null; notes: string[]; actions: string[];
  criteriaJson: string | null; openKeys: string[];
};

function rowOf(r: Record<string, unknown>): G11 {
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  const num = (x: unknown) => (x === undefined || x === null ? 0 : Number(x));
  const opt = (x: unknown) => (x === undefined || x === null ? null : Number(x));
  return {
    kodKu: String(r.kodKu ?? ""), kuName: (r._kuName ?? r.kuName ?? null) as string | null, datasetId: (r._datasetId ?? null) as string | null,
    classification: String(r.classification ?? ""), score: opt(r.score), site: arr(r.site), lotM2: num(r.lotM2), gapWidthM: num(r.gapWidthM),
    gapDepthM: num(r.gapDepthM), buildableM2: num(r.buildableM2), buildableWidthM: num(r.buildableWidthM), housesLeft: num(r.housesLeft),
    housesRight: num(r.housesRight), powerLine: (r.powerLine ?? null) as string | null, ownerType: (r.ownerType ?? null) as string | null,
    zone: (r.zone ?? null) as string | null, slopePct: opt(r.slopePct), frontageM: num(r.frontageM), sketch: (r.sketch ?? null) as Sketch | null,
    pt: Array.isArray(r.pt) ? (r.pt as [number, number]) : null, notes: arr(r.notes), actions: arr(r.actions),
    criteriaJson: (r.criteriaJson ?? null) as string | null, openKeys: arr(r.openKeys),
  };
}

const pno = (ref: string) => ref.replace(/^C:/, "");
const m2 = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);
const m1 = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("sk-SK", { maximumFractionDigits: 1 })} m`);

function ParcelLink({ ds, refC }: { ds: string | null; refC: string }) {
  if (!ds) return <span>{pno(refC)}</span>;
  return <Link to="/nehnutelnost" search={{ ds, p: pno(refC) } as never} className="text-green hover:underline">{pno(refC)}</Link>;
}

function isDefault(v: ScenarioVariant, schema: ScenarioSchema | null) {
  if (!schema) return false;
  const p = variantParams(v);
  return schema.params.every((d) => p[d.key] === undefined || p[d.key] === d.default);
}

const REASON_KEYS: Record<string, string> = {
  zone_housing: "ÚP", not_public_green: "pozemok obce/štátu", not_shared_yard: "spoločný dvor", vacant: "menšia stavba",
  road_access: "prístup", power_line_zone: "vysoké napätie", owner_identity: "vlastníci na viacerých LV", in_built_up_area: "zastavané územie",
  geometry_valid: "geometria", slope_limit: "sklon", temporal_consistency: "dátum zdrojov",
};

function InfillPage() {
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variant, setVariant] = useState<ScenarioVariant | null>(null);
  const [defaultV, setDefaultV] = useState<ScenarioVariant | null>(null);
  const [rows, setRows] = useState<G11[]>([]);
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [kuFilter, setKuFilter] = useState("");
  const [limit, setLimit] = useState(30);
  const [reason, setReason] = useState<string | null>(null);

  const effective = variantId ? variant : defaultV;
  const reload = useCallback(() => {
    if (!effective || effective.status !== "done") { setRows([]); setLoading(!!effective && effective.status !== "failed"); return; }
    setLoading(true);
    getScenarioVariantRows({ data: { variantId: effective.id } })
      .then((r) => setRows((JSON.parse(r.rowsJson) as Record<string, unknown>[]).map(rowOf)))
      .catch(() => setRows([])).finally(() => setLoading(false));
  }, [effective?.id, effective?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.kodKu, kuLabel(r.kuName, r.kodKu));
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);
  const vKu = useMemo(() => (kuFilter ? rows.filter((r) => r.kodKu === kuFilter) : rows), [rows, kuFilter]);
  const nMatch = vKu.filter((r) => r.classification === "MATCH").length;
  const nProv = vKu.length - nMatch;
  const areaTotal = vKu.filter((r) => r.classification === "MATCH").reduce((t, r) => t + r.lotM2, 0);
  const reasonOf = (r: G11) => reasonFromKeys(r.openKeys, r.notes.join(" "), REASON_KEYS, [[/územný plán|regulatív/, "ÚP"]]);
  const reasonCountsList = useMemo(() => (cls === "PROVISIONAL" ? reasonCounts(vKu.filter((r) => r.classification === "PROVISIONAL"), reasonOf) : []), [vKu, cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownAll = useMemo(
    () => vKu.filter((r) => r.classification === cls && (cls !== "PROVISIONAL" || !reason || reasonOf(r) === reason))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.buildableM2 - a.buildableM2),
    [vKu, cls, reason], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = shownAll.slice(0, limit);
  const btn = (on: boolean) => `px-3 py-1 ${on ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Medzery v zástavbe</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Nezastavané pozemky v zastavanom území medzi domami na tej istej ulici, kde sa po odstupoch od hraníc, od domov
          susedov a od cesty zmestí samostatný rodinný dom. Kontroluje sa vjazd, územný plán, sklon, ochranné pásma vedení
          vysokého napätia, verejná zeleň a spoločné dvory. Všetky prahy sa dajú prepnúť.
        </p>
      </div>

      <ScenarioSwitches
        scenario="GOLD11" selected={variantId}
        onSelect={(id, v) => { setVariantId(id); setVariant(v); setLimit(30); }}
        onVariants={(vs, schema) => setDefaultV(vs.find((v) => v.status === "done" && isDefault(v, schema)) ?? vs.find((v) => isDefault(v, schema)) ?? null)}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Zhody" value={nMatch} />
        <Stat label="Plocha pozemkov v zhodách" value={m2(areaTotal)} />
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label={kuFilter ? "Vybrané k.ú." : "Katastre"} value={kuFilter ? 1 : katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Medzery" hint="Zoradené podľa skóre (domy na oboch stranách, jeden vlastník, veľkosť zastavateľnej plochy, sklon)." />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-line">
            <button onClick={() => { setCls("MATCH"); setLimit(30); }} className={btn(cls === "MATCH")}>Zhody ({nMatch})</button>
            <button onClick={() => { setCls("PROVISIONAL"); setLimit(30); }} className={btn(cls === "PROVISIONAL")}>Na preskúmanie ({nProv})</button>
          </div>
          <select value={kuFilter} onChange={(e) => { setKuFilter(e.target.value); setLimit(30); }}
            className="rounded-md border border-line bg-paper px-2 py-1 text-fg">
            <option value="">Všetky k.ú.</option>
            {katastre.map((k) => <option key={k.kod} value={k.kod}>{k.name}</option>)}
          </select>
        </div>
      </div>

      {cls === "PROVISIONAL" ? <ReasonFilter counts={reasonCountsList} value={reason} onChange={(v) => { setReason(v); setLimit(30); }} /> : null}

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">
          {effective && effective.status !== "done" ? `Prepočet beží na Macu (${effective.progress ?? effective.status})…` : "Načítavam…"}
        </Card>
      ) : !effective ? (
        <Card className="p-6 text-center text-sm text-muted">Predvolený beh ešte nie je spočítaný — Mac ho založí pri najbližšom behu.</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">V tejto kategórii nie sú nálezy.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => (
            <Card key={`${r.kodKu}-${r.site[0]}-${i}`} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-fg">Medzera {m2(r.lotM2)} · šírka {m1(r.gapWidthM)}</div>
                  <div className="text-xs text-muted">{kuLabel(r.kuName, r.kodKu)} · domy vľavo {r.housesLeft}, vpravo {r.housesRight}</div>
                </div>
                <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                  zastaviť {m2(r.buildableM2)}
                </span>
              </div>
              {r.sketch ? <div className="mt-3"><SketchSvg s={r.sketch} label="Náčrt medzery: pozemok, zastavateľná časť po odstupoch, domy susedov" numbered={false} /></div> : null}
              <div className="mt-2 text-[11px] text-muted">
                Hĺbka {m1(r.gapDepthM)} · zastavateľná časť široká do {m1(r.buildableWidthM)} · vjazd {m1(r.frontageM)}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {r.zone ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">ÚP: {r.zone}</span> : null}
                {r.slopePct !== null ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">sklon {r.slopePct.toLocaleString("sk-SK")} %</span> : null}
                {r.powerLine ? <span className="rounded-full border border-line px-2 py-0.5 text-warning">vedenie {r.powerLine}</span> : null}
                {r.ownerType ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">vlastník: {r.ownerType}</span> : null}
              </div>
              <div className="mt-3 text-xs text-muted">
                Parcely: {r.site.slice(0, 6).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}
                {r.pt && r.datasetId ? <> · <a className="text-green hover:underline" href={`/mapa?ds=${encodeURIComponent(r.datasetId)}&ll=${r.pt[0]},${r.pt[1]}`}>na mape →</a></> : null}
              </div>
              {r.notes.filter((n) => n.startsWith("Otvorené")).map((n, j) => <p key={j} className="mt-2 text-[11px] leading-relaxed text-warning">{n}</p>)}
              {r.actions.length ? (
                <details className="mt-2 text-[11px] text-muted">
                  <summary className="cursor-pointer text-fg">Ďalšie kroky ({r.actions.length})</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">{r.actions.map((a, j) => <li key={j}>{a}</li>)}</ul>
                </details>
              ) : null}
              <CriteriaMatrix json={r.criteriaJson} />
            </Card>
          ))}
        </div>
      )}

      {shown.length < shownAll.length ? (
        <button onClick={() => setLimit((l) => l + 30)} className="mx-auto block rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-surface-2">
          Zobraziť viac ({shownAll.length - shown.length})
        </button>
      ) : null}

      <Disclaimer>
        Odhad z mapy KN, pôdorysov budov ZBGIS, terénu DMR 5.0 a vedení z OpenStreetMap — nie posúdenie stavebného úradu.
        Odstupy (vyhláška 532/2002 § 6), uličnú čiaru a zastavanosť určuje regulatív územného plánu obce; ochranné pásmo vedenia
        sa počíta od osi z OSM. Vlastník je uvedený len typom.
      </Disclaimer>
    </div>
  );
}
