import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { createDeal, getDeals, type LvSignal } from "../lib/api/kataster.functions";
import { m2 } from "../lib/domain";
import { Badge, Card, Disclaimer, Meter, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/prilezitosti")({
  head: () => ({ meta: [{ title: "Príležitosti — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getDeals({ data: {} }),
  component: OpportunitiesPage,
});

type Weights = { co: number; spf: number; dedic: number; buildable: number; absenter: number; clean: number };
const W0: Weights = { co: 0.3, spf: 0.25, dedic: 0.15, buildable: 0.15, absenter: 0.1, clean: 0.05 };
const WLABEL: { key: keyof Weights; label: string }[] = [
  { key: "co", label: "Spoluvlastníci" },
  { key: "spf", label: "SPF / štát" },
  { key: "dedic", label: "Dedičské" },
  { key: "buildable", label: "Stavebný potenciál" },
  { key: "absenter", label: "Absentéri" },
  { key: "clean", label: "Bez tiarch" },
];

function scoreOf(s: LvSignal, w: Weights): number {
  const sum = w.co + w.spf + w.dedic + w.buildable + w.absenter + w.clean || 1;
  const raw =
    (w.co * Math.min(s.co_owners, 20)) / 20 +
    w.spf * s.has_spf +
    w.dedic * s.dedic +
    w.buildable * s.buildable +
    w.absenter * s.absenter_ratio +
    w.clean * s.clean_title;
  return Math.round((100 * raw) / sum);
}
function reasonsOf(s: LvSignal): string[] {
  const r: string[] = [];
  if (s.co_owners >= 5) r.push(`${s.co_owners} spoluvlastníkov`);
  if (s.has_spf) r.push("SPF / štát v podiele");
  if (s.dedic) r.push(`pravdepodobne dedičské${s.oldest_birth_year ? ` (najstarší ${s.oldest_birth_year})` : ""}`);
  if (s.buildable) r.push("stavebný potenciál (druh + intravilán)");
  if (s.absenter_ratio > 0) r.push(`absentéri ${Math.round(s.absenter_ratio * 100)} %`);
  if (s.clean_title) r.push("bez evidovaných tiarch");
  return r;
}

function OpportunitiesPage() {
  const signals = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const [w, setW] = useState<Weights>(W0);
  const [dsFilter, setDsFilter] = useState<string>("");
  const [limit, setLimit] = useState(40);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [dealBusy, setDealBusy] = useState<string | null>(null);

  async function makeDeal(s: LvSignal) {
    const key = `${s.dataset_id}-${s.lv_no}`;
    setDealBusy(key);
    try {
      const r = await createDeal({ data: { datasetId: s.dataset_id, lvNo: s.lv_no, role } });
      if (r.ok && r.id) { setCreated((m) => ({ ...m, [key]: r.id! })); router.invalidate(); }
    } finally { setDealBusy(null); }
  }

  const datasets = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of signals) m.set(s.dataset_id, s.ku_name);
    return Array.from(m, ([id, ku_name]) => ({ id, ku_name }));
  }, [signals]);

  const ranked = useMemo(() => {
    return signals
      .filter((s) => !dsFilter || s.dataset_id === dsFilter)
      .map((s) => ({ s, score: scoreOf(s, w), reasons: reasonsOf(s) }))
      .sort((a, b) => b.score - a.score);
  }, [signals, w, dsFilter]);

  const shown = ranked.slice(0, limit);
  const avg = ranked.length ? Math.round(ranked.reduce((a, x) => a + x.score, 0) / ranked.length) : 0;
  const spfCount = ranked.filter((x) => x.s.has_spf).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Príležitosti — deal skóre</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Transparentné skóre z reálnych SPI signálov (nevysporiadané, SPF/štát, dedičské, stavebný potenciál,
          absentéri, bez tiarch). <b>Uprav váhy</b> nižšie — poradie sa prepočíta. Skóre je pracovný indikátor,
          nie odporúčanie kúpy ani právny posudok.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="LV v hre" value={ranked.length} />
        <Stat label="Priem. skóre" value={avg} />
        <Stat label="So SPF / štátom" value={spfCount} />
        <Stat label="Katastre" value={datasets.length} />
      </div>

      {/* Váhy */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <SectionHeader title="Váhy signálov" hint="Ladíš skóre naživo. Normalizuje sa na súčet váh." />
          <button onClick={() => setW(W0)} className="text-xs text-muted underline hover:text-fg">reset</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WLABEL.map(({ key, label }) => (
            <label key={key} className="text-xs text-muted">
              <div className="mb-1 flex justify-between"><span>{label}</span><span className="tabular-nums text-fg">{Math.round(w[key] * 100)} %</span></div>
              <input type="range" min={0} max={1} step={0.05} value={w[key]} onChange={(e) => setW((p) => ({ ...p, [key]: Number(e.target.value) }))} className="w-full accent-brand" />
            </label>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Rebríček príležitostí" hint="Zoradené podľa skóre." />
        <select value={dsFilter} onChange={(e) => setDsFilter(e.target.value)} className="ml-auto rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg">
          <option value="">Všetky k.ú.</option>
          {datasets.map((d) => <option key={d.id} value={d.id}>{d.ku_name}</option>)}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ s, score, reasons }) => (
          <Card key={`${s.dataset_id}-${s.lv_no}`} className="flex flex-col p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-fg">LV č. {s.lv_no}</div>
                <div className="text-xs text-muted">{s.ku_name}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-fg">{score}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted">skóre</div>
              </div>
            </div>
            <div className="mt-2"><Meter value={score} color={score >= 70 ? "#5b7a58" : score >= 45 ? "#9a7b3e" : "#8a8a8a"} /></div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {reasons.length ? reasons.map((r, i) => (
                <span key={i} className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">{r}</span>
              )) : <span className="text-[11px] text-muted">bez výrazných signálov</span>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs">
              <span className="text-muted">Výmera <span className="tabular-nums text-fg">{m2(s.total_area)}</span></span>
              <div className="flex gap-2">
                <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: s.dataset_id, lvNo: String(s.lv_no) }} search={{ typ: "vypis" }} className="text-green hover:underline">Výpis LV</Link>
                <Link to="/vlastnici" className="text-muted hover:text-fg">Vlastníci</Link>
              </div>
            </div>
            <div className="mt-2">
              {created[`${s.dataset_id}-${s.lv_no}`] ? (
                <Link to="/deals" className="block rounded-md border border-line px-3 py-1.5 text-center text-xs font-medium text-green hover:bg-surface-2">Deal založený → pipeline</Link>
              ) : (
                <button onClick={() => void makeDeal(s)} disabled={dealBusy === `${s.dataset_id}-${s.lv_no}`} className="w-full rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream disabled:opacity-50">
                  {dealBusy === `${s.dataset_id}-${s.lv_no}` ? "Zakladám…" : "Založiť deal"}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {shown.length < ranked.length ? (
        <button onClick={() => setLimit((l) => l + 40)} className="mx-auto block rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-surface-2">
          Zobraziť viac ({ranked.length - shown.length})
        </button>
      ) : null}

      <Disclaimer>
        Signály sú odvodené z lokálneho SPI importu (počty spoluvlastníkov, podiely, druh pozemku, umiestnenie, ťarchy,
        obec vlastníka). „Dedičské" a „absentér" sú heuristiky, nie právne stavy. Skóre neslúži na právne ani investičné rozhodnutia.
      </Disclaimer>
    </div>
  );
}
