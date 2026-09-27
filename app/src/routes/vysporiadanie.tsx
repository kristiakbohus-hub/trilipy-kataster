import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getSettlementCases } from "../lib/api/kataster.functions";
import { Card, Disclaimer, SectionHeader, Stat } from "../components/kit";

export const Route = createFileRoute("/vysporiadanie")({
  head: () => ({ meta: [{ title: "Vysporiadanie pozemkov — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getSettlementCases({ data: {} }),
  component: SettlementPage,
});

function SettlementPage() {
  const rows = Route.useLoaderData();
  const [kuFilter, setKuFilter] = useState<string>("");
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [limit, setLimit] = useState(40);

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.kod_ku, r.ku_name ?? r.kod_ku);
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);

  const nMatch = rows.filter((r) => r.classification === "MATCH").length;
  const nProv = rows.filter((r) => r.classification === "PROVISIONAL").length;
  const nSpf = rows.filter((r) => r.classification === "MATCH" && r.has_spf).length;

  const shownAll = useMemo(
    () => rows.filter((r) => r.classification === cls && (!kuFilter || r.kod_ku === kuFilter)),
    [rows, cls, kuFilter],
  );
  const shown = shownAll.slice(0, limit);

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
          <select
            value={kuFilter}
            onChange={(e) => { setKuFilter(e.target.value); setLimit(40); }}
            className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg"
          >
            <option value="">Všetky k.ú.</option>
            {katastre.map((k) => <option key={k.kod} value={k.kod}>{k.name}</option>)}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
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
                  parc. {r.parcel_no} · {r.register}-KN
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
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
