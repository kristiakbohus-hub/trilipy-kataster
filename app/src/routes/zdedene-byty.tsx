import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createDeal, getZACases, type ZARow } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";

// ZÁMERNE BEZ `loader`: loader beží počas SSR ešte pred prihlasovacou bránou (__root.tsx), takže
// by vložil celý dataset do HTML pre KOHOKOĽVEK, kto pozná URL. Dáta sa ťahajú až v efekte.
export const Route = createFileRoute("/zdedene-byty")({
  head: () => ({ meta: [{ title: "Zdedené byty — TRI LIPY KATASTER CORE" }] }),
  component: InheritedFlatsPage,
});

function InheritedFlatsPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<ZARow[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    getZACases({ data: {} }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const [kuFilter, setKuFilter] = useState("");
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [limit, setLimit] = useState(40);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [dealBusy, setDealBusy] = useState<string | null>(null);

  async function makeDeal(r: ZARow) {
    if (!r.dataset_id || !r.lv_no) return;
    const key = `${r.dataset_id}-${r.lv_no}`;
    setDealBusy(key);
    try {
      const res = await createDeal({ data: { datasetId: r.dataset_id, lvNo: r.lv_no, role } });
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
  const n2026 = rows.filter((r) => r.classification === "MATCH" && r.instrument_year === 2026).length;

  const shownAll = useMemo(
    () => rows.filter((r) => r.classification === cls && (!kuFilter || r.kod_ku === kuFilter)),
    [rows, cls, kuFilter],
  );
  const shown = shownAll.slice(0, limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Zdedené byty</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Byty, kde aktuálny spoluvlastník zdedil podiel v rokoch 2025–2026, byt NIE JE na prvom ani
          poslednom podlaží budovy a vlastník má inú evidovanú adresu (mimo mesta bytu). Signál na
          preskúmanie — nie tvrdenie o (ne)obývaní ani právny posudok.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Kandidáti (MATCH)" value={nMatch} />
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label="Dedičstvo 2026" value={n2026} />
        <Stat label="Katastre" value={katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Kandidáti" hint="Dedičstvo 2025/26 + iná adresa toho istého vlastníka." />
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
              params={{ scenario: "za", kodKu: kuFilter }}
              className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2"
            >Klientsky report</Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">Načítavam kandidátov…</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Žiadni kandidáti v tejto kategórii. Dáta plní Mac engine cez <code>/api/ingest-za</code>.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => (
            <Card key={`${r.flat_id}-${i}`} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-fg">Byt, podlažie {r.floor ?? "—"}</div>
                  <div className="text-xs text-muted">{r.ku_name ?? r.kod_ku}</div>
                </div>
                <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                  budova {r.building_min_floor ?? "—"}..{r.building_max_floor ?? "—"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.instrument_year ? (
                  <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
                    dedičstvo {r.instrument_year}
                  </span>
                ) : null}
                {r.registration_year && r.registration_year !== r.instrument_year ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                    zápis {r.registration_year}
                  </span>
                ) : null}
                {r.owner_obec ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>
                    vlastník: {r.owner_obec}
                  </span>
                ) : null}
              </div>

              {r.reason ? <p className="mt-3 text-xs leading-relaxed text-muted">{r.reason}</p> : null}
              <CriteriaMatrix json={r.criteria_json} />

              <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs">
                <span className="text-muted">{cls === "MATCH" ? "Potenciálny kandidát" : "Na preskúmanie"}</span>
                {r.dataset_id && r.lv_no ? (
                  <Link
                    to="/vypis/$datasetId/$lvNo"
                    params={{ datasetId: r.dataset_id, lvNo: String(r.lv_no) }}
                    search={{ typ: "vypis" }}
                    className="text-green hover:underline"
                  >Výpis LV ({r.lv_no})</Link>
                ) : (
                  <span className="text-muted">LV {r.lv_no ?? "—"}</span>
                )}
              </div>

              {cls === "MATCH" && r.dataset_id && r.lv_no ? (
                <div className="mt-2">
                  {created[`${r.dataset_id}-${r.lv_no}`] ? (
                    <Link to="/deals" className="block rounded-md border border-line px-3 py-1.5 text-center text-xs font-medium text-green hover:bg-surface-2">
                      Deal založený → pipeline
                    </Link>
                  ) : (
                    <button
                      onClick={() => void makeDeal(r)}
                      disabled={dealBusy === `${r.dataset_id}-${r.lv_no}`}
                      className="w-full rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream disabled:opacity-50"
                    >
                      {dealBusy === `${r.dataset_id}-${r.lv_no}` ? "Zakladám…" : "Založiť deal"}
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
        Kandidáti sú odvodené z lokálneho SPI importu (titul dedičstva, podlažie budovy, hrubá
        odlišnosť evidovanej adresy vlastníka na úrovni obce/mesta). „Iná adresa" je DERIVED signál,
        nie tvrdenie o (ne)obývaní bytu. Dedičstvo a odlišná adresa musia platiť pre toho istého
        vlastníka (nie pre dvoch rôznych spoluvlastníkov). Neslúži na právne ani investičné rozhodnutia.
      </Disclaimer>
    </div>
  );
}
