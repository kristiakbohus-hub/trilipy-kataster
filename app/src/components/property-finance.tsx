// LIST NEHNUTEĽNOSTI — finančné kapitoly (2026-11-13): financovanie a hypotéka, náklady a dane, poistenie a riziká,
// predikcia hodnoty, výnos a vyjednávanie. Výpočty v lib/finance.ts; texty pre laika v lib/property-explain.ts.
// Zásada: všetko je modelový výpočet so zdrojom a dátumom — nie finančné poradenstvo ani odporúčanie produktu.
import type { ReactNode } from "react";
import type { FinInputs, FinResult } from "../lib/finance";
import { FIN, FIN_SOURCES } from "../lib/fin-params";
import { nf, eur, m2, date, Muted, Sub, Grid, Table } from "./ps-ui";

const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${nf(n, d)} %`);
export function Hint({ children }: { children: ReactNode }) { return <span className="ps-hint block text-[10.5px] font-normal leading-snug text-muted">{children}</span>; }
const V = ({ v, h }: { v: ReactNode; h?: ReactNode }) => <span>{v}{h ? <Hint>{h}</Hint> : null}</span>;

// ——— zadanie vlastných hodnôt (len na obrazovke) ———
export function FinInputsPanel({ fin, set }: { fin: FinResult; set: (p: Partial<FinInputs>) => void }) {
  const i = fin.inputs;
  const field = "w-full rounded border border-line bg-surface px-2 py-1 text-sm tabular-nums";
  const L = ({ label, children }: { label: string; children: ReactNode }) => <label className="block text-[11px] text-muted">{label}{children}</label>;
  return (
    <div className="no-print grid grid-cols-2 gap-2 rounded-md border border-dashed border-line p-2.5 sm:grid-cols-4">
      <L label="Kúpna cena (€)"><input className={field} type="number" min={0} step={1000} defaultValue={i.price ?? undefined} onBlur={(e) => set({ price: e.target.value ? Number(e.target.value) : null })} /></L>
      <L label="Úver z ceny"><select className={field} value={i.ltv} onChange={(e) => set({ ltv: Number(e.target.value) })}>{[0, 0.5, 0.6, 0.7, 0.8, 0.9].map((x) => <option key={x} value={x}>{x === 0 ? "bez úveru" : `${Math.round(x * 100)} %`}</option>)}</select></L>
      <L label="Splatnosť (roky)"><select className={field} value={i.years} onChange={(e) => set({ years: Number(e.target.value) })}>{[10, 15, 20, 25, 30].map((x) => <option key={x} value={x}>{x}</option>)}</select></L>
      <L label="Fixácia"><select className={field} value={i.fix} onChange={(e) => set({ fix: Number(e.target.value) })}>{[1, 3, 5, 10].map((x) => <option key={x} value={x}>{x} {x === 1 ? "rok" : x < 5 ? "roky" : "rokov"}</option>)}</select></L>
      <L label="Vek žiadateľa"><input className={field} type="number" min={18} max={75} defaultValue={i.age} onBlur={(e) => set({ age: Math.max(18, Math.min(75, Number(e.target.value) || 35)) })} /></L>
      <L label="Dospelí / deti"><span className="flex gap-1"><input className={field} type="number" min={1} max={4} defaultValue={i.adults} onBlur={(e) => set({ adults: Math.max(1, Number(e.target.value) || 1), persons: Math.max(1, Number(e.target.value) || 1) + i.children })} /><input className={field} type="number" min={0} max={8} defaultValue={i.children} onBlur={(e) => set({ children: Math.max(0, Number(e.target.value) || 0), persons: i.adults + Math.max(0, Number(e.target.value) || 0) })} /></span></L>
      <L label="Nájom mesačne (€)"><input className={field} type="number" min={0} step={10} placeholder={fin.invest.rent ? String(fin.invest.rent) : "z trhu"} onBlur={(e) => set({ rentMonthly: e.target.value ? Number(e.target.value) : null })} /></L>
      <div className="self-end text-[10.5px] leading-snug text-muted">Výpočty sa prepočítajú hneď. Do PDF idú zadané hodnoty.</div>
    </div>
  );
}

// ——— grafy (monochróm, čitateľné v tlači) ———
function OwnFundsBar({ f }: { f: NonNullable<FinResult["mortgage"]>["ownFunds"] }) {
  const parts: [string, number, string][] = [["časť ceny", f.down, "#333"], ["poplatky", f.costs, "#8a8a8a"], ["rezerva", f.reserve, "#cfcfcf"]];
  const tot = Math.max(1, f.total);
  return (
    <div className="space-y-1">
      <div className="flex h-3 w-full overflow-hidden rounded-sm border border-line">{parts.map(([k, v, c]) => <span key={k} style={{ width: `${(v / tot) * 100}%`, background: c }} title={`${k} ${eur(v)}`} />)}</div>
      <div className="flex flex-wrap gap-x-4 text-[11px] text-muted">{parts.map(([k, v, c]) => <span key={k}><span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: c }} />{k} {eur(v)}</span>)}</div>
    </div>
  );
}
function StressChart({ m }: { m: NonNullable<FinResult["mortgage"]> }) {
  const rows: [string, number][] = [["dnes", m.payment], ...m.stress.map((s) => [`+${s.pp} b. (${nf(s.rate, 2)} %)`, s.payment] as [string, number])];
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div className="space-y-1">{rows.map(([k, v], i) => (
      <div key={k} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2 text-[11px]">
        <span className="text-muted">{k}</span>
        <span className="h-2.5 rounded-sm" style={{ width: `${(v / max) * 100}%`, background: i === 0 ? "#333" : "#9a9a9a" }} />
        <span className="text-right tabular-nums">{eur(v)}</span>
      </div>))}
    </div>
  );
}
function PredictionChart({ p }: { p: NonNullable<FinResult["prediction"]> }) {
  const W = 640, H = 210, x0 = 56, y0 = 18, x1 = W - 70, y1 = H - 28;
  const all = [p.basis, ...p.scenarios.flatMap((s) => s.values)];
  const lo = Math.min(...all) * 0.95, hi = Math.max(...all) * 1.03;
  const X = (yr: number) => x0 + (yr / 10) * (x1 - x0), Y = (v: number) => y1 - ((v - lo) / Math.max(1, hi - lo)) * (y1 - y0);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-md border border-line bg-surface-2" role="img" aria-label="Predikcia hodnoty v troch scenároch">
      {ticks.map((t) => <g key={t}><line x1={x0} x2={x1} y1={Y(t)} y2={Y(t)} stroke="#e2e2e2" /><text x={x0 - 6} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="#777">{nf(Math.round(t / 1000))} tis.</text></g>)}
      {[0, 1, 3, 5, 10].map((y) => <text key={y} x={X(y)} y={H - 10} fontSize="9" textAnchor="middle" fill="#777">{y === 0 ? "dnes" : `+${y} r.`}</text>)}
      {p.scenarios.map((s) => {
        const pts = [[0, p.basis], ...p.years.map((y, i) => [y, s.values[i]])] as [number, number][];
        const col = s.key === "zak" ? "#2b2b2b" : "#9a9a9a";
        return <g key={s.key}><polyline points={pts.map(([y, v]) => `${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} fill="none" stroke={col} strokeWidth={s.key === "zak" ? 2.2 : 1.3} strokeDasharray={s.key === "zak" ? undefined : "5 3"} />
          <text x={X(10) + 6} y={Y(s.values[3]) + 3} fontSize="9.5" fill={col}>{s.label} {nf(s.cagr, 1)} %</text></g>;
      })}
      <circle cx={X(0)} cy={Y(p.basis)} r="3" fill="#2b2b2b" />
    </svg>
  );
}
function TrendChart({ trend, mark }: { trend: { year: number; medPpm2: number | null; n: number }[]; mark: number | null }) {
  const t = trend.filter((x) => x.medPpm2 != null);
  if (t.length < 2) return null;
  const W = 640, H = 170, x0 = 50, x1 = W - 20, y0 = 14, y1 = H - 26;
  const vals = [...t.map((x) => x.medPpm2 as number), ...(mark ? [mark] : [])];
  const lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.08;
  const X = (i: number) => x0 + (i / Math.max(1, t.length - 1)) * (x1 - x0), Y = (v: number) => y1 - ((v - lo) / Math.max(1, hi - lo)) * (y1 - y0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-md border border-line bg-surface-2" role="img" aria-label="Vývoj mediánu ceny za m² v okrese">
      {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} stroke="#e2e2e2" /><text x={x0 - 6} y={Y(v) + 3} fontSize="9" textAnchor="end" fill="#777">{nf(Math.round(v))}</text></g>)}
      <polyline points={t.map((x, i) => `${X(i).toFixed(1)},${Y(x.medPpm2 as number).toFixed(1)}`).join(" ")} fill="none" stroke="#2b2b2b" strokeWidth="2" />
      {t.map((x, i) => <g key={x.year}><circle cx={X(i)} cy={Y(x.medPpm2 as number)} r="2.6" fill="#2b2b2b" /><text x={X(i)} y={H - 10} fontSize="9" textAnchor="middle" fill="#777">{x.year}</text></g>)}
      {mark ? <g><line x1={x0} x2={x1} y1={Y(mark)} y2={Y(mark)} stroke="#9c4a40" strokeDasharray="4 3" /><text x={x1} y={Y(mark) - 4} fontSize="9.5" textAnchor="end" fill="#9c4a40">táto nehnuteľnosť {nf(Math.round(mark))} €/m²</text></g> : null}
      <text x={x0} y={10} fontSize="9" fill="#777">medián €/m² zo zmlúv v okrese</text>
    </svg>
  );
}
const LV: Record<string, number> = { "nízke": 0, "stredné": 1, "vysoké": 2 };
function RiskMatrix({ risks }: { risks: NonNullable<FinResult["insurance"]>["risks"] }) {
  // pravdepodobnosť = úroveň z registrov; dopad = typ rizika (povodeň/zosuv/zemetrasenie vysoký, krádež stredný, radón nízky-stredný)
  const impact: Record<string, number> = { "Povodeň / záplava": 2, "Zosuv pôdy": 2, "Zemetrasenie": 2, "Požiar — dojazd hasičov": 2, "Krádež a vandalizmus": 1, "Radón": 1 };
  const known = risks.filter((r) => r.level !== "neznáme" && impact[r.label] != null);
  if (!known.length) return null;
  const cell = (p: number, i: number) => known.filter((r) => LV[r.level] === p && impact[r.label] === i);
  const shade = (p: number, i: number) => ["#f2f2f2", "#e4e4e4", "#d2d2d2", "#bdbdbd", "#a5a5a5"][p + i];
  return (
    <div className="ps-matrix grid grid-cols-[4.5rem_repeat(3,1fr)] gap-px text-[10.5px]">
      <span />{["nízky dopad", "stredný dopad", "vysoký dopad"].map((h) => <span key={h} className="px-1 text-center text-muted">{h}</span>)}
      {[2, 1, 0].map((p) => [<span key={`l${p}`} className="self-center pr-1 text-right text-muted">{["nízka", "stredná", "vysoká"][p]}<br />pravdep.</span>,
        ...[0, 1, 2].map((i) => <span key={`${p}${i}`} className="min-h-[2.4rem] px-1.5 py-1 leading-tight" style={{ background: shade(p, i) }}>{cell(p, i).map((r) => r.label).join(", ")}</span>)])}
    </div>
  );
}

// ——— kapitoly ———
export function FinancingBody({ fin, isClient }: { fin: FinResult; isClient: boolean }) {
  const m = fin.mortgage; const b = fin.basis; const mk = fin.market;
  if (!m) return <Muted>Na výpočet financovania chýba cena aj odhad hodnoty — zadajte kúpnu cenu.</Muted>;
  return (
    <div className="space-y-3">
      <Grid rows={[
        ["Kúpna cena", <V key="p" v={eur(b.price)} h={b.priceFrom} />],
        ["Orientačná hodnota", <V key="v" v={eur(b.value)} h={b.valueFrom} />],
        ["Úver", <V key="l" v={`${eur(m.loan)} (${Math.round((m.loan / Math.max(1, b.price ?? 1)) * 100)} %)`} h={`banka požičia najviac ${Math.round(m.ltvMax * 100)} % z hodnoty (limit NBS)`} />],
        ["Úroková sadzba", <V key="r" v={pct(m.rate, 2)} h={m.rateFrom} />],
        ["Splatnosť / fixácia", `${Math.min(fin.inputs.years, m.maxYears)} rokov / ${fin.inputs.fix} ${fin.inputs.fix === 1 ? "rok" : fin.inputs.fix < 5 ? "roky" : "rokov"}`],
        ["Mesačná splátka", <V key="s" v={<b>{eur(m.payment)}</b>} h="istina + úrok, rovnaká počas fixácie" />],
        ["Úroky za celú dobu", eur(m.totalInterest)],
        ["Zostatok úveru po fixácii", <V key="z" v={eur(m.balanceAtFix)} h="z tejto sumy sa počíta nová sadzba" />],
      ]} />
      {new Date().toISOString().slice(0, 10) < FIN.nbs.ltv2027.od ? <Muted>Od {date(FIN.nbs.ltv2027.od)} platí nové opatrenie NBS: úver najviac {Math.round(FIN.nbs.ltv2027.ostatni * 100)} % z hodnoty ({Math.round(FIN.nbs.ltv2027.mladi35 * 100)} % len mladí do 35 rokov pri prvom bývaní, {Math.round(FIN.nbs.ltv2027.tretia * 100)} % pri tretej a ďalšej nehnuteľnosti). Ak úver čerpáte v roku 2027, počítajte s vyšším podielom vlastných zdrojov.</Muted> : null}
      <Sub>Vlastné zdroje spolu {eur(m.ownFunds.total)}</Sub>
      <OwnFundsBar f={m.ownFunds} />
      <Sub>Potrebný príjem podľa pravidiel NBS</Sub>
      <Grid rows={[
        ["Čistý mesačný príjem domácnosti aspoň", <V key="i" v={<b>{eur(m.income.netMonthly)}</b>} h={`pri ${fin.inputs.adults} dosp. a ${fin.inputs.children} deťoch; rozhoduje ${m.income.binding === "DSTI" ? "splátka voči príjmu" : "výška úveru voči príjmu"}`} />],
        ["Test splátky pri vyššej sadzbe", <V key="t" v={`${pct(m.income.stressRate, 2)} → ${eur(m.income.stressPayment)}`} h={`splátka musí byť najviac ${Math.round(FIN.nbs.dstiMax * 100)} % z príjmu po odpočítaní životného minima (${eur(m.income.zm)})`} />],
        ["Limit výšky úveru", m.income.dtiNote],
      ]} />
      <Sub>Splátka podľa fixácie</Sub>
      <Table head={["Fixácia", "Sadzba", "Splátka", "Zdroj sadzby"]} rows={m.byFix.map((f) => [f.fix, pct(f.rate, 2), eur(f.payment), <span key="s" className="text-muted">{f.from}</span>])} />
      <Sub>Stresový test — splátka po skončení fixácie</Sub>
      <StressChart m={m} />
      {m.valueGap ? <Muted>Cena je nad odhadom hodnoty. Ak znalec banky určí hodnotu ako odhad, úver bude o ~{eur(m.valueGap)} nižší a rozdiel doplatíte z vlastných zdrojov.</Muted> : null}
      {m.rentVsBuyYears ? <Grid rows={[["Kúpa vs. nájom", <V key="k" v={`cena = ${nf(m.rentVsBuyYears, 1)} rokov nájomného`} h="pod 20 rokov sa kúpa na bývanie spravidla oplatí skôr ako nájom" />], ["Sadzby +1 bod", <V key="c" v={`o ${nf(m.sensitivity1pp, 1)} % menší úver pri rovnakej splátke`} h="vyššie sadzby znižujú kúpyschopnosť trhu" />]]} /> : null}
      <Sub>Čo môže hypotéku skomplikovať</Sub>
      {m.blockers.length ? <ol className="list-decimal space-y-1 pl-5 text-xs">{m.blockers.map((x, i) => <li key={i}><b className="font-medium">{x.text}</b><span className="text-muted"> — {x.why}</span></li>)}</ol>
        : <Muted>Z údajov listu sme nenašli prekážku financovania. Banka ju potvrdí po vlastnom posúdení a znaleckom posudku.</Muted>}
      <Sub>Štátna podpora</Sub>
      <ul className="space-y-1 text-xs">{m.support.map((s) => <li key={s.title}><b className="font-medium">{s.title}</b>{s.ok === false ? <span className="text-muted"> — nárok pravdepodobne nevznikne</span> : null}<div className="text-muted">{s.text}</div></li>)}</ul>
      {mk ? (<>
        <Sub>Aktuálne sadzby na trhu</Sub>
        {mk.banks.length ? <Table head={["Banka", "1 r.", "3 r.", "5 r.", "10 r.", "Typ"]} rows={mk.banks.map((x) => [x.url && !isClient ? <a key="b" href={x.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{x.banka}</a> : x.banka,
          ...["1", "3", "5", "10"].map((k) => (x.fixacie[k] != null ? pct(x.fixacie[k], 2) : "—")), x.typ === "od" ? "sadzba „od“" : x.typ === "reprezentativny" ? "reprezent. príklad" : x.typ ?? "—"])} /> : null}
        {mk.rates.length ? <Grid rows={mk.rates.map((r) => [`Priemer nových úverov v SR — ${r.label}`, `${pct(r.pct, 2)} (${r.period})`] as [string, string])} /> : null}
        <Muted>Sadzby bánk sú prehľad verejne uvedených sadzieb z webov bánk{mk.banksAsOf ? ` k ${date(mk.banksAsOf)}` : ""} (spravidla „od“ pri splnení podmienok banky); priemery sú štatistika ECB/NBS. Nejde o odporúčanie konkrétneho produktu — ponuku na mieru dá banka alebo finančný agent.</Muted>
      </>) : <Muted>Aktuálne trhové sadzby sa nepodarilo načítať — výpočet používa predvolenú sadzbu.</Muted>}
    </div>
  );
}

export function CostsBody({ fin }: { fin: FinResult }) {
  const k = fin.costs;
  return (
    <div className="space-y-3">
      <Sub>Jednorazové náklady kúpy ~{eur(k.oneOffTotal)}</Sub>
      <Table head={["Položka", "Suma", "Poznámka"]} rows={k.oneOff.map((x) => [x.label, eur(x.eur), <span key="n" className="text-muted">{x.note}</span>])} />
      <Sub>Ročné náklady vlastníctva ~{eur(k.annualTotal)} (~{eur(k.monthly)} mesačne)</Sub>
      <Table head={["Položka", "Ročne", "Ako sme počítali"]} rows={k.annual.map((x) => [x.label, eur(x.eur), <span key="n" className="text-muted">{x.note}</span>])} />
      <Sub>Dane pri prevode</Sub>
      <Grid rows={[["Daň z príjmu predávajúceho", <V key="s" v={k.saleTax.exemptFrom ? `oslobodenie od ${k.saleTax.exemptFrom}` : "neznáme"} h={k.saleTax.text} />], ["DPH", <V key="d" v={fin.basis.kind === "pozemok" ? "spravidla bez DPH" : "závisí od predávajúceho"} h={k.vat} />], ["Daň z prevodu nehnuteľností", <V key="p" v="neplatí sa" h="na Slovensku sa daň z prevodu nehnuteľností nevyberá" />]]} />
      {k.build.length ? (<>
        <Sub>Náklady pred stavbou ~{eur(k.buildTotal)}</Sub>
        <Table head={["Položka", "Odhad", "Poznámka"]} rows={k.build.map((x) => [x.label, eur(x.eur), <span key="n" className="text-muted">{x.note}</span>])} />
        <Muted>Prípojky a zemné práce sú orientačné — presne ich určí projekt a cenníky správcov sietí. Odvod za vyňatie platí len za plochu, ktorá sa zastavia.</Muted>
      </>) : null}
    </div>
  );
}

export function InsuranceBody({ fin }: { fin: FinResult }) {
  const i = fin.insurance; if (!i) return <Muted>Na odhad poistenia nemáme údaje o stavbe.</Muted>;
  return (
    <div className="space-y-3">
      <Grid rows={[
        ["Odporúčaná poistná suma stavby", <V key="r" v={i.rebuild ? <b>{eur(i.rebuild)}</b> : "—"} h={i.rebuildNote} />],
        ["Odhad ročného poistného", <V key="p" v={`${eur(i.premiumLow)} – ${eur(i.premiumHigh)}`} h={`stavba${i.domacnost ? " + domácnosť" : ""}; prirážka za riziká lokality ×${nf(i.mult, 2)}`} />],
      ]} />
      <Sub>Riziká lokality</Sub>
      <Table head={["Riziko", "Úroveň", "Čo to znamená"]} rows={i.risks.map((r) => [r.label, <span key="l" style={{ color: r.level === "vysoké" ? "#9c4a40" : r.level === "stredné" ? "#8a6418" : undefined, fontWeight: r.level === "vysoké" ? 600 : undefined }}>{r.level}</span>, <span key="i" className="text-muted">{r.impact}</span>])} />
      <Sub>Matica rizík</Sub>
      <RiskMatrix risks={i.risks} />
      <Muted>Poistné je modelový odhad — skutočnú ponuku dá poisťovňa podľa svojich podmienok, spoluúčasti a stavu stavby.</Muted>
    </div>
  );
}

export function PredictionBody({ fin, trend }: { fin: FinResult; trend: { year: number; medPpm2: number | null; n: number }[] }) {
  const p = fin.prediction; const b = fin.basis;
  const markM2 = b.price && (b.kind === "byt" ? b.floorM2 : b.landM2) ? b.price / ((b.kind === "byt" ? b.floorM2 : b.landM2) || 1) : null;
  return (
    <div className="space-y-3">
      {p ? (<>
        <PredictionChart p={p} />
        <Table head={["Scenár", "Ročne", "o 1 rok", "o 3 roky", "o 5 rokov", "o 10 rokov"]} rows={p.scenarios.map((s) => [s.label, pct(s.cagr), ...s.values.map((v) => eur(v))])} />
        <Grid rows={[["Hodnota o 5 rokov v dnešných peniazoch", <V key="r" v={eur(p.real5)} h="po odpočítaní inflácie (základný scenár)" />], ["Trend cien zo zmlúv v okrese", pct(p.trendCagr)], ["Rast miezd v okrese (10 rokov)", pct(p.wageCagr)]]} />
        {p.drivers.length ? (<><Sub>Čo hodnotu ovplyvní</Sub><ul className="space-y-0.5 text-xs">{p.drivers.map((x, i) => <li key={i}><span className="mr-1 inline-block w-3 text-center font-semibold">{x.sign > 0 ? "+" : x.sign < 0 ? "−" : "·"}</span>{x.text}</li>)}</ul></>) : null}
        <Muted>{p.method} Predikcia nie je prísľub budúcej ceny.</Muted>
      </>) : <Muted>Na predikciu chýba odhad hodnoty.</Muted>}
      <Sub>Vývoj cien v okrese</Sub>
      <TrendChart trend={trend} mark={markM2 && b.kind !== "dom" ? markM2 : null} />
    </div>
  );
}

export function InvestBody({ fin }: { fin: FinResult }) {
  const v = fin.invest;
  return (
    <div className="space-y-3">
      {v.rent ? <Grid rows={[
        ["Nájom mesačne", <V key="n" v={eur(v.rent)} h={v.rentFrom} />],
        ["Hrubý výnos", <V key="g" v={pct(v.gross)} h="ročné nájomné ÷ cena" />],
        ["Čistý výnos", <V key="c" v={pct(v.net)} h={`po nákladoch, dani a ${FIN.investicia.neobsadenostMes} mesiaci bez nájomníka`} />],
        ["Čistý ročný príjem", eur(v.netIncome)],
        ["Peňažný tok s hypotékou", <V key="cf" v={v.monthlyCF != null ? `${v.monthlyCF >= 0 ? "+" : "−"}${eur(Math.abs(v.monthlyCF))} mesačne` : "—"} h="nájom − náklady − splátka" />],
        ["Výnos z vlastných peňazí", <V key="coc" v={pct(v.cashOnCash)} h="vrátane splatenej istiny" />],
        ["Výnosnosť za 10 rokov (IRR)", <V key="irr" v={pct(v.irr10)} h="nájom + predaj v základnom scenári" />],
        ["Návratnosť", v.payback ? `${nf(v.payback, 1)} rokov` : "—"],
      ]} /> : <Muted>{v.rentFrom}. Pri pozemku sa výnos počíta z rozvoja (nižšie) — alebo zadajte nájom vyššie.</Muted>}
      {v.maxPrice.length ? (<><Sub>Najvyššia cena pre požadovaný čistý výnos</Sub><Table head={["Požadovaný výnos", "Najviac zaplatiť"]} rows={v.maxPrice.map((x) => [pct(x.yieldPct, 0), eur(x.price)])} /></>) : null}
      {v.residual ? (<><Sub>Zostatková hodnota pozemku pre developera</Sub><Grid rows={[["Hodnota projektu po dokončení", <V key="g" v={eur(v.residual.gdv)} h={`predajná plocha × ${eur(v.residual.saleM2)}/m² za nový byt`} />], ["Náklady výstavby", <V key="c" v={eur(v.residual.cost)} h={`${eur(FIN.vystavba.developerEurM2Hpp)}/m² hrubej podlažnej plochy`} />], ["Zisk developera", `${eur(v.residual.profit)} (${FIN.vystavba.developerZiskPct} %)`],
        ["Zostáva na pozemok (max. cena)", v.residual.land > 0 ? <b key="l">{eur(v.residual.land)}</b> : <span key="l">projekt podľa regulatívu pri týchto predpokladoch nevychádza</span>]]} /></>) : null}
      <Sub>Kúpa na fyzickú osobu alebo na firmu</Sub>
      <Table head={["", "Fyzická osoba", "s. r. o."]} rows={v.foVsSro.map((x) => [x.label, x.fo, x.sro])} />
      {v.offer ? (<>
        <Sub>Vyjednávanie — pre kupujúceho</Sub>
        <Grid rows={[["Odporúčaná úvodná ponuka", <b key="o">{eur(v.offer.low)} – {eur(v.offer.high)}</b>], ["Inzerát online", v.daysOnMarket != null ? `${v.daysOnMarket} dní` : "—"], ["Zníženie ceny", v.cuts ? pct(v.cuts) : "—"]]} />
        {v.offer.args.length ? <ul className="list-disc space-y-0.5 pl-5 text-xs">{v.offer.args.map((a, i) => <li key={i}>{a}</li>)}</ul> : <Muted>Bez výrazných argumentov na zníženie ceny.</Muted>}
      </>) : null}
      <Muted>Výnosy a ceny sú modelový výpočet — nie investičné poradenstvo. Daňové porovnanie je zjednodušené; pred rozhodnutím ho overte s daňovým poradcom.</Muted>
    </div>
  );
}

export function finSourcesText(fin: FinResult): string {
  const m = fin.market;
  return [m?.rates.length ? `sadzby ECB/NBS (${m.rates[0].period})` : null, m?.banks.length ? `verejné sadzby ${m.banks.length} bánk (${date(m.banksAsOf)})` : null,
    ...FIN_SOURCES.map((s) => s.text), `parametre k ${date(FIN.asOf)}`].filter(Boolean).join("; ");
}
export { m2 };
