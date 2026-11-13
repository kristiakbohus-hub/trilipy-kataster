import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getScenarioVariantRows, type ScenarioSchema, type ScenarioVariant } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { ScenarioSwitches, variantParams } from "../components/scenario-switches";
import { kuLabel } from "../lib/domain";
import { ReasonFilter, reasonCounts, reasonFromKeys } from "../components/reason-filter";

// GOLD-19 — STRATEGICKÉ MALÉ PARCELY (2026-11-13). Engine 21_NL_SEARCH/gold19_find.py + gold19_live.py; výsledky
// žijú len ako varianty (scenario_variants, 0117) — predvolený beh je variant s predvolenými parametrami, ktorý
// zakladá a po importe obnovuje Mac. ZÁMERNE BEZ `loader` (SSR by dáta vložil do HTML pred prihlasovacou bránou).
export const Route = createFileRoute("/strategicke-parcely")({
  head: () => ({ meta: [{ title: "Strategické parcely — TRI LIPY KATASTER CORE" }] }),
  component: StrategicParcelsPage,
});

type G19 = {
  kodKu: string; kuName: string | null; datasetId: string | null; classification: string; score: number | null;
  kind: "ACCESS" | "JOIN"; micro: string; microM2: number; microOwnerType: string | null; microDrp: string | null;
  site: string[]; siteM2: number; site2: string[] | null; site2M2: number | null; roads: string[];
  reason: string | null; notes: string[]; criteriaJson: string | null; openKeys: string[];
};

function g19FromRow(r: Record<string, unknown>): G19 {
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return {
    kodKu: String(r.kodKu ?? ""), kuName: (r._kuName ?? r.kuName ?? null) as string | null, datasetId: (r._datasetId ?? null) as string | null,
    classification: String(r.classification ?? ""), score: r.score === undefined || r.score === null ? null : Number(r.score),
    kind: r.kind === "JOIN" ? "JOIN" : "ACCESS", micro: String(r.micro ?? ""), microM2: Number(r.microM2 ?? 0),
    microOwnerType: (r.microOwnerType ?? null) as string | null, microDrp: (r.microDrp ?? null) as string | null,
    site: arr(r.site), siteM2: Number(r.siteM2 ?? 0), site2: r.site2 ? arr(r.site2) : null,
    site2M2: r.site2M2 === undefined || r.site2M2 === null ? null : Number(r.site2M2), roads: arr(r.roads),
    reason: (r.reason ?? null) as string | null, notes: arr(r.notes), criteriaJson: (r.criteriaJson ?? null) as string | null,
    openKeys: arr(r.openKeys),
  };
}

const pno = (ref: string) => ref.replace(/^C:/, "");
const m2 = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);

function ParcelLink({ ds, refC }: { ds: string | null; refC: string }) {
  if (!ds) return <span>{pno(refC)}</span>;
  return (
    <Link to="/nehnutelnost" search={{ ds, p: pno(refC) } as never} className="text-green hover:underline">{pno(refC)}</Link>
  );
}

function isDefault(v: ScenarioVariant, schema: ScenarioSchema | null) {
  if (!schema) return false;
  const p = variantParams(v);
  return schema.params.every((d) => p[d.key] === undefined || p[d.key] === d.default);
}

function StrategicParcelsPage() {
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variant, setVariant] = useState<ScenarioVariant | null>(null);
  const [defaultV, setDefaultV] = useState<ScenarioVariant | null>(null);
  const [rows, setRows] = useState<G19[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"ACCESS" | "JOIN">("ACCESS");
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [kuFilter, setKuFilter] = useState("");
  const [onlyUnique, setOnlyUnique] = useState(false);
  const [limit, setLimit] = useState(40);

  // „Predvolené“ = najnovší hotový variant s predvolenými parametrami (zakladá ho Mac)
  const effective = variantId ? variant : defaultV;
  const reload = useCallback(() => {
    if (!effective || effective.status !== "done") { setRows([]); setLoading(!!effective && effective.status !== "failed"); return; }
    setLoading(true);
    getScenarioVariantRows({ data: { variantId: effective.id } })
      .then((r) => setRows((JSON.parse(r.rowsJson) as Record<string, unknown>[]).map(g19FromRow)))
      .catch(() => setRows([])).finally(() => setLoading(false));
  }, [effective?.id, effective?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.kodKu, kuLabel(r.kuName, r.kodKu));
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);
  const vKu = useMemo(() => (kuFilter ? rows.filter((r) => r.kodKu === kuFilter) : rows), [rows, kuFilter]);
  const unique = (r: G19) => r.notes.some((n) => n.startsWith("Alternatívy: v načítanom k.ú. sa nenašli"));
  const cnt = (k: string, c: string) => vKu.filter((r) => r.kind === k && r.classification === c).length;
  const [reason, setReason] = useState<string | null>(null);
  const reasonOf = (r: G19) => reasonFromKeys(r.openKeys, r.notes.join(" "), {
    owner_differs: "vlastník spojky", no_recorded_passage_right: "vecné bremeno", same_owner: "totožnosť vlastníka",
    micro_not_road: "spojka je cesta", temporal_consistency: "dátumy údajov", geometry_valid: "geometria", micro_width: "šírka" },
    [[/vlastník malej parcely|nie je určený na LV/, "vlastník spojky"], [/vecné bremeno/, "vecné bremeno"], [/totožnosť|okruh vlastníkov/, "totožnosť vlastníka"],
     [/cestná parcela/, "spojka je cesta"], [/dátumov/, "dátumy údajov"], [/geometria/, "geometria"]]);
  const reasonCountsList = useMemo(() => (cls === "PROVISIONAL"
    ? reasonCounts(vKu.filter((r) => r.kind === kind && r.classification === "PROVISIONAL"), reasonOf) : []), [vKu, kind, cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownAll = useMemo(
    () => vKu.filter((r) => r.kind === kind && r.classification === cls && (!onlyUnique || unique(r)) && (cls !== "PROVISIONAL" || !reason || reasonOf(r) === reason))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.siteM2 + (b.site2M2 ?? 0)) - (a.siteM2 + (a.site2M2 ?? 0))),
    [vKu, kind, cls, onlyUnique, reason], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = shownAll.slice(0, limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Strategické malé parcely</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Malé parcely, ktoré menia využiteľnosť susedného celku: <span className="text-fg">prístup</span> — leží medzi celkom
          bez verejnej cesty a verejnou cestou; <span className="text-fg">spojenie</span> — oddeľuje dve časti toho istého
          vlastníka. Z mapy KN (spoločné hranice) a katastra; alternatívne trasy sú zrátané pri každom náleze.
        </p>
      </div>

      <ScenarioSwitches
        scenario="GOLD19" selected={variantId}
        onSelect={(id, v) => { setVariantId(id); setVariant(v); setLimit(40); }}
        onVariants={(vs, schema) => setDefaultV(vs.find((v) => v.status === "done" && isDefault(v, schema)) ?? vs.find((v) => isDefault(v, schema)) ?? null)}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Prístup — zhody" value={cnt("ACCESS", "MATCH")} />
        <Stat label="Spojenie — zhody" value={cnt("JOIN", "MATCH")} />
        <Stat label="Na preskúmanie" value={cnt("ACCESS", "PROVISIONAL") + cnt("JOIN", "PROVISIONAL")} />
        <Stat label={kuFilter ? "Vybrané k.ú." : "Katastre"} value={kuFilter ? 1 : katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Nálezy" hint="Zoradené podľa skóre (jediná trasa, v zastavanom území, veľkosť celku)." />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-line">
            {(["ACCESS", "JOIN"] as const).map((k) => (
              <button key={k} onClick={() => { setKind(k); setLimit(40); }}
                className={`px-3 py-1 ${kind === k ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}>
                {k === "ACCESS" ? "Prístup" : "Spojenie"}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line">
            {(["MATCH", "PROVISIONAL"] as const).map((c) => (
              <button key={c} onClick={() => { setCls(c); setLimit(40); }}
                className={`px-3 py-1 ${cls === c ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}>
                {c === "MATCH" ? `Zhody (${cnt(kind, "MATCH")})` : `Na preskúmanie (${cnt(kind, "PROVISIONAL")})`}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" checked={onlyUnique} onChange={(e) => { setOnlyUnique(e.target.checked); setLimit(40); }} />
            len jediná trasa
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
            <Card key={`${r.kodKu}-${r.micro}-${i}`} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-fg">
                    {r.kind === "ACCESS" ? "Odomyká prístup" : "Spája celky"} · parcela <ParcelLink ds={r.datasetId} refC={r.micro} />
                  </div>
                  <div className="text-xs text-muted">{kuLabel(r.kuName, r.kodKu)}</div>
                </div>
                <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                  {m2(r.microM2)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {r.microDrp ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">{r.microDrp}</span> : null}
                {r.microOwnerType ? <span className="rounded-full border border-line px-2 py-0.5 text-muted">vlastník: {r.microOwnerType}</span> : null}
                {unique(r) ? <span className="rounded-full border border-line px-2 py-0.5 text-fg">jediná trasa</span> : null}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted">
                <div>
                  {r.kind === "ACCESS" ? "Celok bez verejnej cesty" : "Časť 1"} ({m2(r.siteM2)}):{" "}
                  {r.site.slice(0, 6).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}
                  {r.site.length > 6 ? ` … +${r.site.length - 6}` : ""}
                </div>
                {r.kind === "JOIN" && r.site2 ? (
                  <div>Časť 2 ({m2(r.site2M2)}): {r.site2.slice(0, 6).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}</div>
                ) : null}
                {r.kind === "ACCESS" && r.roads.length ? (
                  <div>Verejná cesta: {r.roads.map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={r.datasetId} refC={p} /></span>)}</div>
                ) : null}
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
        Nález je dátový podklad z mapy KN a katastra, nie právny ani znalecký záver. Strategickosť neznamená právo na
        prístup ani automaticky vyššiu cenu. Pred akýmkoľvek krokom overiť na mieste fyzický stav, v listinách vecné
        bremená a nájmy a v územnom pláne, či je celok zastavateľný. Vlastník je uvedený len typom, nie menom.
      </Disclaimer>
    </div>
  );
}
