import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createDeal, getUPCases, type UPRow } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";
import { kuLabel } from "../lib/domain";

// ZÁMERNE BEZ `loader`: loader beží počas SSR ešte pred prihlasovacou bránou (__root.tsx), takže
// by vložil celý dataset do HTML pre KOHOKOĽVEK, kto pozná URL. Dáta sa preto ťahajú až v efekte —
// komponent sa namountuje až po prihlásení. Rovnako to robí /stavebne-pozemky.
export const Route = createFileRoute("/poda-na-byvanie")({
  head: () => ({ meta: [{ title: "Pôda na bývanie — TRI LIPY KATASTER CORE" }] }),
  component: UpzonedFarmlandPage,
});

const eur = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("sk-SK")} €`);

function UpzonedFarmlandPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<UPRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    getUPCases({ data: {} }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const [kuFilter, setKuFilter] = useState("");
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [limit, setLimit] = useState(40);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [dealBusy, setDealBusy] = useState<string | null>(null);

  async function makeDeal(r: UPRow) {
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
    for (const r of rows) m.set(r.kod_ku, kuLabel(r.ku_name, r.kod_ku));
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);

  // Počty musia ctiť filter k.ú. — dovtedy sa počítalo cez všetky `rows`, takže pri vybranej
  // obci gombíky a štatistiky tvrdili globálne čísla (napr. „Vyhovuje (65)" nad obcou, čo má 0).
  const vKu = useMemo(() => (kuFilter ? rows.filter((r) => r.kod_ku === kuFilter) : rows), [rows, kuFilter]);
  const nMatch = vKu.filter((r) => r.classification === "MATCH").length;
  const nProv = vKu.filter((r) => r.classification === "PROVISIONAL").length;
  const lacne = rows.filter((r) => r.classification === "MATCH" && !r.chranena
    && r.naklad_vynatie_eur !== null && r.naklad_vynatie_eur <= 1000).length;

  const shownAll = useMemo(
    () => rows.filter((r) => r.classification === cls && (!kuFilter || r.kod_ku === kuFilter)),
    [rows, cls, kuFilter],
  );
  const shown = shownAll.slice(0, limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Pôda na bývanie</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pozemky, ktoré územný plán už určil na bývanie, ale kataster ich stále vedie ako ornú pôdu
          alebo trvalý trávny porast a nestojí na nich stavba. Zoradené podľa nákladu vyňatia
          z poľnohospodárskeho fondu — najlacnejšie hore. Signál na preskúmanie, nie právny posudok.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Kandidáti (MATCH)" value={nMatch} />
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label="Vyňatie do 1000 €" value={lacne} />
        <Stat label={kuFilter ? "Vybrané k.ú." : "Katastre"} value={kuFilter ? 1 : katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Kandidáti" hint="ÚP dovoľuje bývanie + stále poľnohospodárska pôda + nezastavané." />
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
          {/* Klientsky report (dok. 16 §3 A–H) sa robí vždy za JEDNO k.ú. — bez filtra nie je čo zadať. */}
          {kuFilter ? (
            <Link
              to="/klient-report/$scenario/$kodKu"
              params={{ scenario: "up", kodKu: kuFilter }}
              className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2"
            >Klientsky report</Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">Načítavam kandidátov…</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Žiadni kandidáti v tejto kategórii. Dáta plní Mac engine cez <code>/api/ingest-up</code>.
          Katastre bez zdroja územného plánu sa tu nemôžu objaviť — nie je ich s čím porovnať.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => (
            <Card key={`${r.kod_ku}-${r.parcels}-${i}`} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-fg">
                    {r.area_m2 ? `${r.area_m2.toLocaleString("sk-SK")} m²` : "—"} · {r.druh ?? "—"}
                  </div>
                  <div className="text-xs text-muted">{kuLabel(r.ku_name, r.kod_ku)}</div>
                </div>
                <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                  vyňatie {eur(r.naklad_vynatie_eur)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.zone ? (
                  <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
                    {r.zone}
                  </span>
                ) : null}
                {/* spoľahlivosť zoningu: presné WMS vs orientačný georeferencovaný raster */}
                {r.zoning_src ? (
                  <span
                    className="rounded-full border border-line px-2 py-0.5 text-[11px]"
                    style={{ color: r.zoning_src === "WMS" ? "#3e7a52" : "#9a7b3e" }}
                    title={r.zoning_src === "WMS"
                      ? "Funkčná zóna z presného WMS výkresu obce."
                      : "Funkčná zóna z georeferencovaného rastra — poloha hranice zón je orientačná, overiť na výkrese."}
                  >
                    ÚP: {r.zoning_src === "WMS" ? "presný zdroj" : "orientačný raster"}
                  </span>
                ) : null}
                {r.bpej_skupina ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                    BPEJ skup. {r.bpej_skupina}
                  </span>
                ) : null}
                {r.chranena ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#a4553a" }}>
                    chránená pôda
                  </span>
                ) : null}
                {r.build === "demolishable" ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                    drobná stavba
                  </span>
                ) : null}
              </div>

              {r.parcels ? (
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Parcely: <span className="tabular-nums text-fg">{r.parcels}</span>
                  {r.n_owners ? ` · ${r.n_owners} vlastník(ov)` : ""}
                </p>
              ) : null}
              {r.reason ? <p className="mt-2 text-xs leading-relaxed text-muted">{r.reason}</p> : null}
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
        Funkčné využitie pochádza z územného plánu obce — buď z presného WMS výkresu, alebo
        z georeferencovaného rastra, kde je poloha hraníc zón len orientačná (pri každom náleze je
        uvedené ktorý zdroj). Katastre bez dostupného územného plánu tu nefigurujú vôbec; ich
        neprítomnosť neznamená, že tam príležitosti nie sú, ale že ich nemáme ako overiť. Náklad
        vyňatia je odvod podľa NV 58/2013 (sadzba BPEJ × výmera), nie cena pozemku ani odhad celkových
        nákladov projektu. Neslúži na právne ani investičné rozhodnutia.
      </Disclaimer>
    </div>
  );
}
