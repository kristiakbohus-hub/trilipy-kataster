import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createDeal, getSettlementCases, type SettlementRow } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { eur, parcelLabel } from "../lib/domain";
import { useRole } from "../lib/role-context";

// ZÁMERNE BEZ `loader`: loader beží počas SSR ešte pred prihlasovacou bránou (__root.tsx), takže
// by vložil celý dataset do HTML pre KOHOKOĽVEK, kto pozná URL. Dáta sa ťahajú až v efekte.
export const Route = createFileRoute("/vysporiadanie")({
  head: () => ({ meta: [{ title: "Vysporiadanie pozemkov — TRI LIPY KATASTER CORE" }] }),
  component: SettlementPage,
});

type OItem = { share: string; pct: number; kind: string; absent: boolean };
function OutreachList({ json }: { json: string | null }) {
  if (!json) return null;
  let items: OItem[] = [];
  try { items = JSON.parse(json) as OItem[]; } catch { return null; }
  if (!items.length) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Koho osloviť (podľa podielu)</div>
      <ol className="space-y-0.5">
        {items.map((o, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-fg">{i + 1}. podiel {o.share} <span className="tabular-nums text-muted">({o.pct} %)</span></span>
            <span className="flex shrink-0 gap-1">
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">{o.kind}</span>
              {o.absent ? <span className="rounded border border-line px-1.5 py-0.5 text-[10px]" style={{ color: "#9a7b3e" }}>absentér</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SettlementPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    getSettlementCases({ data: {} }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const [kuFilter, setKuFilter] = useState<string>("");
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [flavor, setFlavor] = useState<"all" | "disjoint" | "minority">("all");
  const [limit, setLimit] = useState(40);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [dealBusy, setDealBusy] = useState<string | null>(null);

  async function makeDeal(r: SettlementRow) {
    if (!r.dataset_id || !r.land_lv_no) return;
    const key = `${r.dataset_id}-${r.land_lv_no}`;
    setDealBusy(key);
    try {
      const res = await createDeal({ data: { datasetId: r.dataset_id, lvNo: r.land_lv_no, role } });
      if (res.ok && res.id) { setCreated((m) => ({ ...m, [key]: res.id! })); reload(); }
    } finally { setDealBusy(null); }
  }

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.kod_ku, r.ku_name ?? r.kod_ku);
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);

  const nMatch = rows.filter((r) => r.classification === "MATCH").length;
  const nProv = rows.filter((r) => r.classification === "PROVISIONAL").length;
  const nSpf = rows.filter((r) => r.classification === "MATCH" && r.has_spf).length;

  const shownAll = useMemo(
    () => rows.filter((r) =>
      r.classification === cls
      && (!kuFilter || r.kod_ku === kuFilter)
      && (cls !== "MATCH" || flavor === "all"
          || (flavor === "minority" ? r.minority_share === 1 : r.minority_share !== 1))),
    [rows, cls, kuFilter, flavor],
  );
  const shown = shownAll.slice(0, limit);
  const buyoutSum = useMemo(
    () => shownAll.reduce((a, r) => a + (r.buyout_eur ?? 0), 0),
    [shownAll],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Vysporiadanie pozemkov pod stavbami</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Stavba má vlastný list vlastníctva, ale podložná parcela (register C alebo E / pozemková kniha) má
          <b> iných vlastníkov</b> — typický kysucký prípad (dedičia, SPF, neznámi). Ide o <b>signál</b> na preskúmanie,
          nie o právny záver o (ne)vysporiadaní.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Kandidáti (MATCH)" value={nMatch} />
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label="So SPF / štátom" value={nSpf} />
        <Stat label="Katastre" value={katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Kandidáti vysporiadania" hint="Vlastník stavby ≠ vlastník pozemku (disjunktný)." />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-xs">
            <button
              onClick={() => { setCls("MATCH"); setLimit(40); }}
              className={`px-3 py-1 ${cls === "MATCH" ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
            >Kandidáti ({nMatch})</button>
            <button
              onClick={() => { setCls("PROVISIONAL"); setLimit(40); }}
              className={`px-3 py-1 ${cls === "PROVISIONAL" ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
            >Na preskúmanie ({nProv})</button>
          </div>
          {cls === "MATCH" ? (
            <div className="flex overflow-hidden rounded-md border border-line text-xs">
              {([["all", "Všetky"], ["disjoint", "Cudzí pozemok"], ["minority", "Menšinový podiel"]] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => { setFlavor(v); setLimit(40); }}
                  className={`px-3 py-1 ${flavor === v ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
                >{lbl}</button>
              ))}
            </div>
          ) : null}
          <select
            value={kuFilter}
            onChange={(e) => { setKuFilter(e.target.value); setLimit(40); }}
            className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg"
          >
            <option value="">Všetky k.ú.</option>
            {katastre.map((k) => <option key={k.kod} value={k.kod}>{k.name}</option>)}
          </select>
          {/* Klientsky report (dok. 16 §3) sa robí vždy za JEDNO k.ú. */}
          {kuFilter ? (
            <Link
              to="/klient-report/$scenario/$kodKu"
              params={{ scenario: "settlement", kodKu: kuFilter }}
              className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2"
            >Klientsky report</Link>
          ) : null}
        </div>
      </div>

      {cls === "MATCH" && buyoutSum > 0 ? (
        <p className="-mt-3 text-xs text-muted">
          Orientačný odhad hodnoty pozemkov vo výbere: <b className="text-fg">{eur(buyoutSum)}</b> (horná hranica odkupu,
          výmera × €/m² podľa druhu — hrubý screening, nie znalecký posudok).
        </p>
      ) : null}

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">Načítavam kandidátov…</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Žiadni kandidáti v tejto kategórii. Dáta plní Mac engine (GOLD 04) cez <code>/api/ingest-settlement</code>.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => (
            <Card key={`${r.building_id}-${i}`} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-fg">{r.building_desc ?? "stavba"}</div>
                  <div className="text-xs text-muted">{r.ku_name ?? r.kod_ku}</div>
                </div>
                <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                  parc. {parcelLabel(r.parcel_no)} · {r.register}-KN
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.classification === "MATCH" ? (
                  <span className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={r.minority_share ? { color: "#9a7b3e", borderColor: "#9a7b3e55" } : { color: "#5b7a58", borderColor: "#5b7a5855" }}>
                    {r.minority_share ? "menšinový podiel" : "cudzí pozemok"}
                  </span>
                ) : null}
                {r.n_land_owners ? (
                  <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
                    {r.n_land_owners} {r.n_land_owners === 1 ? "vlastník pozemku" : "vlastníkov pozemku"}
                  </span>
                ) : null}
                {r.via_e ? (
                  <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">rozlíšené cez E</span>
                ) : null}
                {r.has_spf ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>SPF / štát</span>
                ) : null}
                {r.has_unknown ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#6b6f86" }}>neznámy vlastník</span>
                ) : null}
              </div>

              {r.buyout_eur != null ? (
                <div className="mt-3 rounded-md border border-line bg-surface-2/30 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Orientačný odhad pozemku</span>
                    <span className="font-semibold tabular-nums text-fg">{eur(r.buyout_eur)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {r.land_area_m2 != null ? `${r.land_area_m2} m²` : ""}{r.land_druh ? ` · ${r.land_druh}` : ""} · horná hranica odkupu
                  </div>
                </div>
              ) : null}

              <OutreachList json={r.outreach_json} />
              <CriteriaMatrix json={r.criteria_json} />

              {r.reason ? <p className="mt-3 text-xs leading-relaxed text-muted">{r.reason}</p> : null}

              <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs">
                <span className="text-muted">
                  {cls === "MATCH" ? "Potenciálny kandidát" : "Na preskúmanie"}
                </span>
                {r.dataset_id && r.land_lv_no ? (
                  <Link
                    to="/vypis/$datasetId/$lvNo"
                    params={{ datasetId: r.dataset_id, lvNo: String(r.land_lv_no) }}
                    search={{ typ: "vypis" }}
                    className="text-green hover:underline"
                  >Výpis LV pozemku ({r.land_lv_no})</Link>
                ) : (
                  <span className="text-muted">LV pozemku {r.land_lv_no ?? "—"}</span>
                )}
              </div>

              {cls === "MATCH" && r.dataset_id && r.land_lv_no ? (
                <div className="mt-2">
                  {created[`${r.dataset_id}-${r.land_lv_no}`] ? (
                    <Link to="/deals" className="block rounded-md border border-line px-3 py-1.5 text-center text-xs font-medium text-green hover:bg-surface-2">
                      Deal založený → pipeline
                    </Link>
                  ) : (
                    <button
                      onClick={() => void makeDeal(r)}
                      disabled={dealBusy === `${r.dataset_id}-${r.land_lv_no}`}
                      className="w-full rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream disabled:opacity-50"
                    >
                      {dealBusy === `${r.dataset_id}-${r.land_lv_no}` ? "Zakladám…" : "Založiť deal (odkup pozemku)"}
                    </button>
                  )}
                </div>
              ) : null}
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
        Kandidáti sú odvodení z lokálneho SPI importu (stavba s vlastným LV vs. vlastníci podložnej C/E parcely).
        E-parcely sa napájajú cez zhodné parcelné číslo (nesubdivovaná parcela = tá istá zem) — geometrický
        prienik nie je možný (E polygóny nie sú). „Vlastník stavby ≠ vlastník pozemku" je signál na overenie
        LV/EKN vzťahov a titulu, nie tvrdenie o právnom (ne)vysporiadaní. Neslúži na právne ani investičné rozhodnutia.
      </Disclaimer>
    </div>
  );
}
