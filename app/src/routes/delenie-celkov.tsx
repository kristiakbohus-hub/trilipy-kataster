import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getScenarioVariantRows, type ScenarioSchema, type ScenarioVariant } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { ScenarioSwitches, variantParams } from "../components/scenario-switches";
import { kuLabel } from "../lib/domain";
import { ReasonFilter, reasonCounts, reasonFromKeys } from "../components/reason-filter";

// GOLD-12 — DELENIE CELKOV NA VIAC STAVEBNÝCH PARCIEL (2026-11-14). Engine 21_NL_SEARCH/gold12_find.py + gold12_solver.py
// + gold12_live.py (mapa KN, SPI, pôdorysy ZBGIS, DMR 5.0, ÚP). Varianty: FRONT (pozdĺž existujúcej cesty) a ROAD (nová
// prístupová cesta). Výsledky žijú len ako varianty (0117) — predvolený beh zakladá a po importe obnovuje Mac.
// ZÁMERNE BEZ `loader` (SSR by dáta vložil do HTML pred prihlasovacou bránou).
export const Route = createFileRoute("/delenie-celkov")({
  head: () => ({ meta: [{ title: "Delenie celkov — TRI LIPY KATASTER CORE" }] }),
  component: SubdivisionPage,
});

type VarSum = {
  kind: "FRONT" | "ROAD"; label: string; lots: number; lotAreas: number[]; lotWidths: number[]; minLot: number;
  roadM2: number; roadLenM: number; remainderM2: number; remainderPct: number | null;
};
type Sketch = { w: number; h: number; site: string; lots: string[]; road: string | null; front: string | null };
type G12 = {
  kodKu: string; kuName: string | null; datasetId: string | null; classification: string; score: number | null;
  site: string[]; siteM2: number; devM2: number; ownerType: string | null; nHouses: number; houseKeepM2: number;
  best: VarSum | null; variants: VarSum[]; sketch: Sketch | null; zone: string | null; zoneSrc: string | null;
  slopePct: number | null; zuobShare: number | null; reason: string | null; notes: string[]; actions: string[];
  criteriaJson: string | null; openKeys: string[];
};

function rowOf(r: Record<string, unknown>): G12 {
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  const num = (x: unknown) => (x === undefined || x === null ? 0 : Number(x));
  const opt = (x: unknown) => (x === undefined || x === null ? null : Number(x));
  return {
    kodKu: String(r.kodKu ?? ""), kuName: (r._kuName ?? r.kuName ?? null) as string | null, datasetId: (r._datasetId ?? null) as string | null,
    classification: String(r.classification ?? ""), score: opt(r.score), site: arr(r.site), siteM2: num(r.siteM2), devM2: num(r.devM2),
    ownerType: (r.ownerType ?? null) as string | null, nHouses: num(r.nHouses), houseKeepM2: num(r.houseKeepM2),
    best: (r.best ?? null) as VarSum | null, variants: (Array.isArray(r.variants) ? r.variants : []) as VarSum[],
    sketch: (r.sketch ?? null) as Sketch | null, zone: (r.zone ?? null) as string | null, zoneSrc: (r.zoneSrc ?? null) as string | null,
    slopePct: opt(r.slopePct), zuobShare: opt(r.zuobShare), reason: (r.reason ?? null) as string | null, notes: arr(r.notes),
    actions: arr(r.actions), criteriaJson: (r.criteriaJson ?? null) as string | null, openKeys: arr(r.openKeys),
  };
}

const pno = (ref: string) => ref.replace(/^C:/, "");
const m2 = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);
const num1 = (n: number | null) => (n === null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 1 }));

function ParcelLink({ ds, refC }: { ds: string | null; refC: string }) {
  if (!ds) return <span>{pno(refC)}</span>;
  return <Link to="/nehnutelnost" search={{ ds, p: pno(refC) } as never} className="text-green hover:underline">{pno(refC)}</Link>;
}

function isDefault(v: ScenarioVariant, schema: ScenarioSchema | null) {
  if (!schema) return false;
  const p = variantParams(v);
  return schema.params.every((d) => p[d.key] === undefined || p[d.key] === d.default);
}

/** Stred polygónu z cesty náčrtu (priemer vrcholov) — na číslo pozemku. */
function pathCenter(d: string): [number, number] | null {
  const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

// Náčrt najlepšieho variantu: cesta (styk s ňou) dole, pozemky očíslované v poradí zoznamu výmer.
function SketchSvg({ s, label }: { s: Sketch; label: string }) {
  const pad = Math.max(s.w, s.h) * 0.04 + 2;
  const fs = Math.max(s.w, s.h) / 16;
  return (
    <svg viewBox={`${-pad} ${-pad} ${s.w + 2 * pad} ${s.h + 2 * pad}`} role="img" aria-label={label}
      className="h-44 w-full rounded-md border border-line bg-cream">
      <path d={s.site} fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {s.lots.map((d, i) => (
        <path key={i} d={d} fill={i % 2 ? "rgba(91,122,88,.32)" : "rgba(91,122,88,.18)"} stroke="var(--color-green)"
          strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {s.road ? <path d={s.road} fill="var(--color-muted)" fillOpacity={0.55} stroke="var(--color-ink-soft)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" /> : null}
      {s.front ? <path d={s.front} fill="var(--color-ink)" /> : null}
      {s.lots.map((d, i) => {
        const c = pathCenter(d);
        return c ? <text key={i} x={c[0]} y={c[1]} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink)">{i + 1}</text> : null;
      })}
    </svg>
  );
}

function VariantTable({ r }: { r: G12 }) {
  const vs = [...r.variants].sort((a, b) => (a.kind === r.best?.kind ? -1 : b.kind === r.best?.kind ? 1 : 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] tabular-nums">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-2 font-normal">Variant</th>
            <th className="py-1 pr-2 text-right font-normal">Pozemky</th>
            <th className="py-1 pr-2 text-right font-normal">Najmenší</th>
            <th className="py-1 pr-2 text-right font-normal">Nová cesta</th>
            <th className="py-1 text-right font-normal">Zvyšok</th>
          </tr>
        </thead>
        <tbody>
          {vs.map((v) => (
            <tr key={v.kind} className={`border-t border-line ${v.kind === r.best?.kind ? "text-fg" : "text-muted"}`}>
              <td className="py-1 pr-2">{v.label}{v.kind === r.best?.kind ? " ✓" : ""}</td>
              <td className="py-1 pr-2 text-right">{v.lots}</td>
              <td className="py-1 pr-2 text-right">{m2(v.minLot)}</td>
              <td className="py-1 pr-2 text-right">{v.roadM2 ? `${m2(v.roadM2)} · ${num1(v.roadLenM)} m` : "—"}</td>
              <td className="py-1 text-right">{v.remainderPct === null ? "—" : `${num1(v.remainderPct)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const REASON_KEYS: Record<string, string> = {
  zone_housing: "ÚP", site_access: "prístup", fragmentation: "drobenie mimo ZÚ", house_keeps_access: "vjazd domu",
  owner_identity: "vlastníci na viacerých LV", passage_easement: "vecné bremeno", planned_road_overlap: "plocha dopravy v ÚP",
  site_size: "veľký celok", geometry_valid: "geometria", slope_limit: "sklon", temporal_consistency: "dátum zdrojov",
};

function SubdivisionPage() {
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variant, setVariant] = useState<ScenarioVariant | null>(null);
  const [defaultV, setDefaultV] = useState<ScenarioVariant | null>(null);
  const [matchRows, setMatchRows] = useState<G12[]>([]);
  const [provRows, setProvRows] = useState<G12[] | null>(null);   // načíta sa až pri prvom otvorení „Na preskúmanie"
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [kuFilter, setKuFilter] = useState("");
  const [kind, setKind] = useState<"" | "FRONT" | "ROAD">("");
  const [limit, setLimit] = useState(30);
  const [reason, setReason] = useState<string | null>(null);

  const effective = variantId ? variant : defaultV;
  const load = useCallback((c: "MATCH" | "PROVISIONAL") => {
    const set = c === "MATCH" ? setMatchRows : setProvRows;
    if (!effective || effective.status !== "done") { set([]); setLoading(!!effective && effective.status !== "failed"); return; }
    setLoading(true);
    getScenarioVariantRows({ data: { variantId: effective.id, classification: c } })
      .then((r) => set((JSON.parse(r.rowsJson) as Record<string, unknown>[]).map(rowOf)))
      .catch(() => set([])).finally(() => setLoading(false));
  }, [effective?.id, effective?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setProvRows(null); load("MATCH"); }, [load]);
  useEffect(() => { if (cls === "PROVISIONAL" && provRows === null) load("PROVISIONAL"); }, [cls, provRows, load]);
  const rows = useMemo(() => [...matchRows, ...(provRows ?? [])], [matchRows, provRows]);

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.kodKu, kuLabel(r.kuName, r.kodKu));
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);
  const vKu = useMemo(() => (kuFilter ? rows.filter((r) => r.kodKu === kuFilter) : rows), [rows, kuFilter]);
  const matches = vKu.filter((r) => r.classification === "MATCH");
  // kým sa „na preskúmanie" nenačíta, počet je zo súhrnu variantu (pri filtri k.ú. ho nepoznáme)
  const nProv: number | string = provRows !== null ? vKu.length - matches.length : kuFilter ? "…" : (effective?.n_provisional ?? 0);
  const lotsTotal = matches.reduce((t, r) => t + (r.best?.lots ?? 0), 0);
  const nRoad = matches.filter((r) => r.best?.kind === "ROAD").length;
  const reasonOf = (r: G12) => reasonFromKeys(r.openKeys, r.notes.join(" "), REASON_KEYS,
    [[/územný plán|funkčné využitie|regulatív/, "ÚP"], [/drobi/, "drobenie mimo ZÚ"], [/prístup|cesty/, "prístup"]]);
  const reasonCountsList = useMemo(() => (cls === "PROVISIONAL" ? reasonCounts(vKu.filter((r) => r.classification === "PROVISIONAL"), reasonOf) : []), [vKu, cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownAll = useMemo(
    () => vKu.filter((r) => r.classification === cls && (!kind || r.best?.kind === kind) && (cls !== "PROVISIONAL" || !reason || reasonOf(r) === reason))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.best?.lots ?? 0) - (a.best?.lots ?? 0) || b.devM2 - a.devM2),
    [vKu, cls, kind, reason], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = shownAll.slice(0, limit);
  const btn = (on: boolean) => `px-3 py-1 ${on ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Delenie celkov</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Celky jedného vlastníka, ktoré sa dajú rozdeliť na dva a viac stavebných pozemkov — buď vedľa seba pozdĺž existujúcej
          cesty, alebo s novou prístupovou cestou do hĺbky celku. Každý pozemok má minimálnu výmeru, šírku a vlastný vjazd;
          existujúci dom si ponechá pozemok. Kontroluje sa územný plán, sklon terénu, zákaz drobenia pôdy mimo zastavaného
          územia a zapísané vecné bremená. Všetky prahy sa dajú prepnúť.
        </p>
      </div>

      <ScenarioSwitches
        scenario="GOLD12" selected={variantId}
        onSelect={(id, v) => { setVariantId(id); setVariant(v); setLimit(30); }}
        onVariants={(vs, schema) => setDefaultV(vs.find((v) => v.status === "done" && isDefault(v, schema)) ?? vs.find((v) => isDefault(v, schema)) ?? null)}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Zhody" value={matches.length} />
        <Stat label="Nových pozemkov v zhodách" value={lotsTotal} />
        <Stat label="Zhody s novou cestou" value={nRoad} />
        <Stat label="Na preskúmanie" value={nProv} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Celky" hint="Zoradené podľa skóre (zastavané územie, bez novej cesty, malý zvyšok, sklon, počet pozemkov)." />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-line">
            <button onClick={() => { setCls("MATCH"); setLimit(30); }} className={btn(cls === "MATCH")}>Zhody ({matches.length})</button>
            <button onClick={() => { setCls("PROVISIONAL"); setLimit(30); }} className={btn(cls === "PROVISIONAL")}>Na preskúmanie ({nProv})</button>
          </div>
          <div className="flex overflow-hidden rounded-md border border-line">
            {([["", "Všetky"], ["FRONT", "Pozdĺž cesty"], ["ROAD", "S novou cestou"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setKind(k); setLimit(30); }} className={btn(kind === k)}>{l}</button>
            ))}
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
                  <div className="text-sm font-semibold text-fg">{r.best ? `${r.best.lots} pozemky · ${r.best.label}` : "Celok"}</div>
                  <div className="text-xs text-muted">{kuLabel(r.kuName, r.kodKu)} · celok {m2(r.siteM2)}</div>
                </div>
                {r.best ? (
                  <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                    od {m2(r.best.minLot)}
                  </span>
                ) : null}
              </div>
              {r.sketch ? <div className="mt-3"><SketchSvg s={r.sketch} label={`Náčrt delenia: ${r.best?.label ?? ""}`} /></div> : null}
              {r.best ? (
                <div className="mt-2 text-[11px] tabular-nums text-muted">
                  {r.best.lotAreas.map((a, j) => <span key={j}>{j ? " · " : ""}{j + 1}: {m2(a)}</span>)}
                </div>
              ) : null}
              <div className="mt-2"><VariantTable r={r} /></div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {r.zone ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">ÚP: {r.zone}</span> : null}
                {r.slopePct !== null ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">sklon {num1(r.slopePct)} %</span> : null}
                {r.zuobShare !== null ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">v ZÚ {Math.round(r.zuobShare * 100)} %</span> : null}
                {r.nHouses ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">dom ostáva na {m2(r.houseKeepM2)}</span> : null}
                {r.ownerType ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">vlastník: {r.ownerType}</span> : null}
              </div>
              <div className="mt-3 text-xs text-muted">
                Parcely celku: {r.site.slice(0, 6).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}
                {r.site.length > 6 ? ` … +${r.site.length - 6}` : ""}
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
        Návrh delenia z mapy KN, pôdorysov budov ZBGIS a terénu DMR 5.0 — nie je potvrdením stavebnosti, geometrickým plánom
        ani urbanistickou štúdiou. Minimálnu výmeru a šírku pozemku, odstupy a parametre prístupovej cesty určuje regulatív
        územného plánu a stavebný úrad; mimo zastavaného územia sa poľnohospodársky pozemok môže deliť pod 2 000 m² len na
        účely výstavby (§ 24 ods. 3 písm. a) zák. 180/1995, potvrdenie obce). Vlastník je uvedený len typom.
      </Disclaimer>
    </div>
  );
}
