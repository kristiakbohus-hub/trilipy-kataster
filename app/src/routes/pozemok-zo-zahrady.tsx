import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getScenarioVariantRows, type ScenarioSchema, type ScenarioVariant } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { ScenarioSwitches, variantParams } from "../components/scenario-switches";
import { kuLabel } from "../lib/domain";
import { ReasonFilter, reasonCounts, reasonFromKeys } from "../components/reason-filter";

// GOLD-10 — STAVEBNÝ POZEMOK Z VEĽKEJ ZÁHRADY (2026-11-13). Engine 21_NL_SEARCH/gold10_find.py + gold10_live.py
// (mapa KN, SPI, pôdorysy ZBGIS, ÚP); výsledky žijú len ako varianty (0117) — predvolený beh zakladá a po importe
// obnovuje Mac. ZÁMERNE BEZ `loader` (SSR by dáta vložil do HTML pred prihlasovacou bránou).
export const Route = createFileRoute("/pozemok-zo-zahrady")({
  head: () => ({ meta: [{ title: "Pozemok zo záhrady — TRI LIPY KATASTER CORE" }] }),
  component: GardenPlotPage,
});

type G10 = {
  kodKu: string; kuName: string | null; datasetId: string | null; classification: string; score: number | null;
  site: string[]; siteM2: number; ownerType: string | null; nHouses: number; houseM2: number; keepM2: number;
  freeM2: number; freeWidthM: number | null; freeParcels: string[]; frontagePublicM: number; zone: string | null;
  zoneSrc: string | null; reason: string | null; notes: string[]; criteriaJson: string | null; openKeys: string[];
};

function rowOf(r: Record<string, unknown>): G10 {
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  const num = (x: unknown) => (x === undefined || x === null ? 0 : Number(x));
  return {
    kodKu: String(r.kodKu ?? ""), kuName: (r._kuName ?? r.kuName ?? null) as string | null, datasetId: (r._datasetId ?? null) as string | null,
    classification: String(r.classification ?? ""), score: r.score === undefined || r.score === null ? null : Number(r.score),
    site: arr(r.site), siteM2: num(r.siteM2), ownerType: (r.ownerType ?? null) as string | null, nHouses: num(r.nHouses),
    houseM2: num(r.houseM2), keepM2: num(r.keepM2), freeM2: num(r.freeM2),
    freeWidthM: r.freeWidthM === undefined || r.freeWidthM === null ? null : Number(r.freeWidthM),
    freeParcels: arr(r.freeParcels), frontagePublicM: num(r.frontagePublicM), zone: (r.zone ?? null) as string | null,
    zoneSrc: (r.zoneSrc ?? null) as string | null, reason: (r.reason ?? null) as string | null, notes: arr(r.notes),
    criteriaJson: (r.criteriaJson ?? null) as string | null, openKeys: arr(r.openKeys),
  };
}

const pno = (ref: string) => ref.replace(/^C:/, "");
const m2 = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);

function ParcelLink({ ds, refC }: { ds: string | null; refC: string }) {
  if (!ds) return <span>{pno(refC)}</span>;
  return <Link to="/nehnutelnost" search={{ ds, p: pno(refC) } as never} className="text-green hover:underline">{pno(refC)}</Link>;
}

function isDefault(v: ScenarioVariant, schema: ScenarioSchema | null) {
  if (!schema) return false;
  const p = variantParams(v);
  return schema.params.every((d) => p[d.key] === undefined || p[d.key] === d.default);
}

function GardenPlotPage() {
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variant, setVariant] = useState<ScenarioVariant | null>(null);
  const [defaultV, setDefaultV] = useState<ScenarioVariant | null>(null);
  const [rows, setRows] = useState<G10[]>([]);
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [kuFilter, setKuFilter] = useState("");
  const [onlyRoad, setOnlyRoad] = useState(false);
  const [limit, setLimit] = useState(40);

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
  const nProv = vKu.filter((r) => r.classification === "PROVISIONAL").length;
  const nRoad = vKu.filter((r) => r.classification === "MATCH" && r.frontagePublicM >= 4).length;
  const [reason, setReason] = useState<string | null>(null);
  const reasonOf = (r: G10) => reasonFromKeys(r.openKeys, r.notes.join(" "), {
    zone_housing: "ÚP", own_access: "prístup", free_part_unbuilt: "stavba na voľnej časti", geometry_valid: "geometria" },
    [[/územný plán|funkčné využitie|regulatív/, "ÚP"], [/prístup|cesty|prechodu/, "prístup"], [/menšia stavba/, "stavba na voľnej časti"], [/geometria/, "geometria"]]);
  const reasonCountsList = useMemo(() => (cls === "PROVISIONAL" ? reasonCounts(vKu.filter((r) => r.classification === "PROVISIONAL"), reasonOf) : []), [vKu, cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownAll = useMemo(
    () => vKu.filter((r) => r.classification === cls && (!onlyRoad || r.frontagePublicM >= 4) && (cls !== "PROVISIONAL" || !reason || reasonOf(r) === reason))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.freeM2 - a.freeM2),
    [vKu, cls, onlyRoad, reason], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = shownAll.slice(0, limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Pozemok zo záhrady</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Celky s rodinným domom, kde po ponechaní funkčného pozemku domu ostáva dostatočne veľká a široká časť záhrady
          na samostatný stavebný pozemok — s vlastným vjazdom z verejnej cesty a v ploche, kde územný plán dovoľuje bývanie.
          Z mapy KN, pôdorysov budov ZBGIS a ÚP; všetky prahy sa dajú prepnúť.
        </p>
      </div>

      <ScenarioSwitches
        scenario="GOLD10" selected={variantId}
        onSelect={(id, v) => { setVariantId(id); setVariant(v); setLimit(40); }}
        onVariants={(vs, schema) => setDefaultV(vs.find((v) => v.status === "done" && isDefault(v, schema)) ?? vs.find((v) => isDefault(v, schema)) ?? null)}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Zhody" value={nMatch} />
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label="Zhody s vlastným vjazdom" value={nRoad} />
        <Stat label={kuFilter ? "Vybrané k.ú." : "Katastre"} value={kuFilter ? 1 : katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Nálezy" hint="Zoradené podľa skóre (zastavané územie, jeden vlastník, veľkosť) a plochy." />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-line">
            {(["MATCH", "PROVISIONAL"] as const).map((c) => (
              <button key={c} onClick={() => { setCls(c); setLimit(40); }}
                className={`px-3 py-1 ${cls === c ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}>
                {c === "MATCH" ? `Zhody (${nMatch})` : `Na preskúmanie (${nProv})`}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" checked={onlyRoad} onChange={(e) => { setOnlyRoad(e.target.checked); setLimit(40); }} />
            len s vlastným vjazdom
          </label>
          <select value={kuFilter} onChange={(e) => { setKuFilter(e.target.value); setLimit(40); }}
            className="rounded-md border border-line bg-paper px-2 py-1 text-fg">
            <option value="">Všetky k.ú.</option>
            {katastre.map((k) => <option key={k.kod} value={k.kod}>{k.name}</option>)}
          </select>
        </div>
      </div>

      {cls === "PROVISIONAL" ? <ReasonFilter counts={reasonCountsList} value={reason} onChange={(v) => { setReason(v); setLimit(40); }} /> : null}

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
                  <div className="text-sm font-semibold text-fg">Voľná časť {m2(r.freeM2)}</div>
                  <div className="text-xs text-muted">{kuLabel(r.kuName, r.kodKu)}</div>
                </div>
                <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                  šírka {r.freeWidthM !== null ? `${r.freeWidthM.toLocaleString("sk-SK")} m` : "—"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {r.frontagePublicM >= 4 ? <span className="rounded-full border border-line px-2 py-0.5 text-fg">vjazd {Math.round(r.frontagePublicM)} m</span> : null}
                {r.zone ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">ÚP: {r.zone}</span> : null}
                {r.ownerType ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">vlastník: {r.ownerType}</span> : null}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted">
                <div>Celok {m2(r.siteM2)}, dom {m2(r.houseM2)} pôdorys, domu ostane {m2(r.keepM2)}</div>
                <div>Parcely celku: {r.site.slice(0, 6).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}{r.site.length > 6 ? ` … +${r.site.length - 6}` : ""}</div>
                {r.freeParcels.length ? <div>Voľná časť na parcelách: {r.freeParcels.slice(0, 4).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}</div> : null}
              </div>
              {r.reason ? <p className="mt-3 text-xs leading-relaxed text-muted">{r.reason}</p> : null}
              {r.notes.map((n, j) => <p key={j} className="mt-1 text-[11px] leading-relaxed text-muted">{n}</p>)}
              <CriteriaMatrix json={r.criteriaJson} />
            </Card>
          ))}
        </div>
      )}

      {shown.length < shownAll.length ? (
        <button onClick={() => setLimit((l) => l + 40)} className="mx-auto block rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-surface-2">
          Zobraziť viac ({shownAll.length - shown.length})
        </button>
      ) : null}

      <Disclaimer>
        Odhad z mapy KN a pôdorysov budov ZBGIS, nie geometrický plán ani posúdenie stavebného úradu. Deliteľnosť, odstupy,
        minimálnu výmeru a šírku pozemku určuje regulatív územného plánu obce; vjazd a napojenie na siete treba overiť na
        mieste. Vlastník je uvedený len typom.
      </Disclaimer>
    </div>
  );
}
