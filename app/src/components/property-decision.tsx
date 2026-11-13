// ROZHODNUTIE, POVOLENIA, VYSPORIADANIE — zobrazenie (2026-11-13). Výpočty v lib/decision.ts.
import { useState } from "react";
import type { SheetData } from "../lib/property-eval";
import type { FinResult } from "../lib/finance";
import { DECISION_DEFAULTS, gates, monteCarlo, permits, scenarios, settlement, verdict, type DecisionParams } from "../lib/decision";
import { nf, eur, Muted, Sub, Grid, Table } from "./ps-ui";

const WORD_COL: Record<string, string> = { "KÚPIŤ": "#3f5a3c", "PODMIENEČNE": "#8a6418", "NEKÚPIŤ": "#9c4a40", "NEDÁ SA POSÚDIŤ": "#666" };

export function DecisionBody({ d, fin, isClient }: { d: SheetData; fin: FinResult | null; isClient: boolean }) {
  const [p, setP] = useState<DecisionParams>(DECISION_DEFAULTS);
  const sc = scenarios(d, fin, p);
  const v = verdict(d, fin, sc);
  const wsum = sc.reduce((s, x) => s + (x.landValue != null ? x.weight : 0), 0);
  const weighted = wsum ? Math.round(sc.reduce((s, x) => s + (x.landValue != null ? x.landValue * x.weight : 0), 0) / wsum) : null;
  const best = sc.filter((s) => s.landValue != null).sort((a, b) => (b.landValue as number) - (a.landValue as number))[0];
  const mcBase = d.dev?.cpp && d.dev.hpp ? { gdv: d.dev.cpp * p.flatSaleEurM2, cost: d.dev.hpp * p.buildEurM2 } : { gdv: 130 * p.houseSaleEurM2, cost: 130 * p.buildEurM2 * 1.05 };
  const mc = monteCarlo({ ...mcBase, profitPct: p.profitPct, otherPct: p.otherPct });
  const num = (k: keyof DecisionParams, label: string) => (
    <label className="text-[11px] text-muted">{label}<input className="w-full rounded border border-line bg-surface px-2 py-1 text-xs tabular-nums" type="number" value={p[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) || 0 })} /></label>
  );
  return (
    <div className="space-y-3">
      <div className="ps-verdict rounded-md border-2 px-3 py-2" style={{ borderColor: WORD_COL[v.word] }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-lg font-semibold tracking-wide" style={{ color: WORD_COL[v.word] }}>{v.word}</span>
          <span className="text-sm">cieľová cena <b>{eur(v.target)}</b> · najviac <b>{eur(v.maxPrice)}</b></span></div>
        <ul className="mt-1 list-disc pl-5 text-xs">{v.why.map((t) => <li key={t}>{t}</li>)}</ul>
        <div className="mt-1 text-[10.5px] text-muted">Verdikt je modelové odporúčanie z údajov listu pre kupujúceho, nie investičné poradenstvo. „Najviac" = cena, nad ktorú sa kúpa podľa porovnateľných predajov a najlepšieho využitia neoplatí.</div>
      </div>
      {gates(d).length ? (<><Sub>Podmienky, ktoré treba vyriešiť</Sub><ul className="space-y-0.5 text-xs">{gates(d).map((g) => <li key={g.text}><b style={{ color: g.hard ? "#9c4a40" : "#8a6418" }}>{g.hard ? "vylučujúce" : "podmienka"}</b> — {g.text}</li>)}</ul></>) : null}
      <Sub>Scenáre využitia — hodnota pozemku / nehnuteľnosti dnes</Sub>
      <Table head={["", "Scenár", "Hodnota dnes", "Čas (mes.)", "Riziko", "Ako sme počítali"]} rows={sc.map((s) => [s.key, s.label + (best && s.key === best.key ? " ★" : ""), s.landValue != null ? (s.landValue > 0 ? eur(s.landValue) : "nevychádza") : "—", s.months, s.risk, <span key="n" className="text-muted">{s.note}{s.est ? " · odhad" : ""}</span>])} />
      <Grid rows={[["Najvyššia hodnota (najlepšie využitie)", best ? `${best.label}: ${eur(best.landValue)}` : "—"], ["Vážená hodnota podľa pravdepodobnosti scenárov", eur(weighted)],
        [`Rozpätie výsledku developera (${d.dev?.cpp ? "bytový dom" : "rodinný dom"}, 2 000 simulácií)`, `P10 ${eur(mc.p10)} · P50 ${eur(mc.p50)} · P90 ${eur(mc.p90)} · strata v ${mc.pLoss} % prípadov`]]} />
      {!isClient ? <div className="no-print grid grid-cols-2 gap-2 rounded-md border border-dashed border-line p-2 sm:grid-cols-4">{num("flatSaleEurM2", "Predaj bytov €/m²")}{num("houseSaleEurM2", "Predaj RD €/m²")}{num("buildEurM2", "Stavba €/m²")}{num("profitPct", "Zisk developera %")}{num("otherPct", "Ostatné náklady %")}{num("comSaleEurM2", "Komerčné €/m²")}{num("comBuildEurM2", "Komerčná stavba €/m²")}{num("discountPct", "Diskont %/rok")}</div> : null}
      <Muted>Scenáre B–H sú modelové odhady (ceny výstavby a predaja, prirážka za povolenie, náklady delenia) — upravte parametre podľa aktuálnej ponuky stavebníkov. Monte Carlo mení cenu predaja (±12 %) a náklady (±10 %).</Muted>
    </div>
  );
}

export function PermitsBody({ d }: { d: SheetData }) {
  const pm = permits(d);
  return (
    <div className="space-y-3">
      <Table head={["Štúdia / úkon", "Prečo", "Náklad (odhad)", "Týždne"]} rows={pm.studies.map((s) => [s.name, <span key="w" className="text-muted">{s.why}</span>, s.cost, s.weeks])} />
      <Sub>Zákonné lehoty a poplatky</Sub>
      <Grid rows={pm.legal} />
      {pm.uzavera ? <div className="text-xs font-semibold" style={{ color: "#9c4a40" }}>Na úradnej tabuli obce je oznámenie o stavebnej uzávere — overiť, či sa týka pozemku.</div> : null}
      {pm.konania.length ? (<><Sub>Stavebné konania a oznámenia v obci (úradná tabuľa)</Sub><ul className="text-xs">{pm.konania.map((k, i) => <li key={i} className="border-b border-line/40 py-0.5">{k.date ? k.date.slice(0, 10).split("-").reverse().join(". ") + " · " : ""}{k.url ? <a href={k.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{k.title}</a> : k.title}</li>)}</ul></>) : null}
      <Sub>Čas povolenia v praxi</Sub>
      <Grid rows={[["Povolenie rodinného domu", pm.timeline.rd], ["Povolenie bytového / komerčného projektu", pm.timeline.bd], ["Zmena územného plánu", pm.timeline.upChange ? "potrebná — spravidla 12–36 mesiacov, výsledok neistý" : "podľa zóny nepotrebná (overiť ÚPI)"]]} />
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{pm.notes.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

export function SettlementBlock({ d }: { d: SheetData }) {
  const s = settlement(d); if (!s || (s.rows.length === 1 && s.rows[0].n <= 1)) return null;
  return (
    <>
      <Sub>Vysporiadanie vlastníkov — odhad nákladov a času</Sub>
      <Table head={["Skupina vlastníkov", "Počet", "Náklad (odhad)", "Mesiace", "Šanca dohody"]} rows={s.rows.map((r) => [r.cat, String(r.n), r.cost, r.months, `${Math.round(r.p * 100)} %`])} />
      <Grid rows={[["Spolu (odhad)", `${nf(s.totalLow)} – ${nf(s.totalHigh)} € · ${s.months} mesiacov`], ["Šanca získať všetky podiely", `~${s.pFull} %`]]} />
      <Muted>Odhad z praxe (právny servis, notár, dedičské konanie, súd) — bez dohľadávania kontaktov osôb. Podiel nezisteného vlastníka spravuje SPF; ak máte aspoň polovicu pozemku a podiel do 500 m², existuje cesta vysporiadania cez SPF, inak súd. Spoluvlastníci majú pri predaji podielu predkupné právo.</Muted>
    </>
  );
}
