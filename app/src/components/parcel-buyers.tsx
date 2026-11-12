// Kto by mohol kúpiť pozemok — zdieľané medzi dossierom parcely a listom nehnuteľnosti (2026-11-12).
// Mená osôb len pre rolu s plným prístupom (server ich inak nevráti); GDPR námietky vyradené na serveri.
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getParcelBuyers, type ParcelBuyers } from "../lib/api/kataster.functions";
import { ScorePill, finText } from "./buyer-ui";
import type { LetterJob, LetterRecipient } from "../lib/letters";

function Muted({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted">{children}</div>;
}

// KUPUJÚCI (plán vlastníka 2026-11-10): zhodný dopyt z evidencie, susedia, ľudia a firmy, ktoré v k.ú. nedávno
// kupovali alebo tu vlastnia majetok. Odvodený záujem, nie potvrdený dopyt. Kontakty osôb appka nedohľadáva.
export function BuyersSection({ datasetId, parcelNo, token, kuName, areaM2 }: { datasetId: string; parcelNo: string; token: string | null; kuName: string | null; areaM2: number | null }) {
  const [b, setB] = useState<ParcelBuyers | null>(null);
  const [sel, setSel] = useState<Map<string, LetterRecipient>>(new Map());
  useEffect(() => {
    if (!token) return;
    getParcelBuyers({ data: { token, datasetId, parcelNo } }).then(setB).catch(() => setB(null));
  }, [token, datasetId, parcelNo]);
  if (!b) return <Muted>Hľadám možných kupcov…</Muted>;
  if (!b.ok) return <Muted>{b.message ?? "Kupcov sa nepodarilo zistiť."}</Muted>;
  const masked = b.access !== "full";
  const toggle = (r: LetterRecipient) => setSel((prev) => { const m = new Map(prev); if (m.has(r.key)) m.delete(r.key); else m.set(r.key, r); return m; });
  const Pick = ({ r }: { r: LetterRecipient }) => (
    <input type="checkbox" className="mr-1.5 align-middle print:hidden" checked={sel.has(r.key)} onChange={() => toggle(r)} aria-label={`Vybrať na list: ${r.label.split(",")[0]}`} />
  );
  const Person = ({ o, group }: { o: ParcelBuyers["recentBuyers"][number]; group: LetterRecipient["group"] }) => {
    const r: LetterRecipient = { key: `${group}:${o.lvNo}:${o.name}`, label: o.name, group, lvNo: o.lvNo };
    return (
      <li className="flex justify-between gap-2 border-b border-line/40 py-0.5">
        <span className="min-w-0"><Pick r={r} />{o.name}{o.isCompany ? <span className="ml-1 text-[10px] uppercase text-muted">firma</span> : null}</span>
        <span className="shrink-0 text-muted">{[o.obec, o.detail, `LV ${o.lvNo}`].filter(Boolean).join(" · ")}</span>
      </li>
    );
  };
  function prepare() {
    const job: LetterJob = { datasetId, parcelNo, kuName, areaM2, recipients: [...sel.values()] };
    try { sessionStorage.setItem("tl.letters", JSON.stringify(job)); } catch { /* bez úložiska list nevznikne */ }
    window.location.href = "/listy";
  }
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="font-medium text-fg">Zhodný dopyt z evidencie ({b.scoredRequests?.length ?? b.requests.length})</div>
        {(b.scoredRequests?.length ?? b.requests.length) === 0 ? <Muted>Žiadny aktívny dopyt na pozemok v tejto lokalite a výmere. <Link to="/kupci" className="text-brand hover:underline print:hidden">Pridať záujemcu →</Link></Muted>
          : b.scoredRequests ? (
          <ul>{b.scoredRequests.map((r) => (
            <li key={r.id} className="border-b border-line/40 py-1">
              <div className="flex justify-between gap-2">
                <span className="min-w-0"><ScorePill n={r.score} /> <b>{r.name}</b> <span className="text-muted">({r.kind})</span></span>
                <Link to="/kupci" className="shrink-0 text-brand hover:underline print:hidden">dopyt #{r.id} →</Link>
              </div>
              <div className="text-muted">{r.reasons.join(" · ")}{r.checks.length ? <span className="text-warning"> · overiť: {r.checks.join(", ")}</span> : null}</div>
            </li>))}</ul>
        ) : (
          <ul>{b.requests.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
              <span className="min-w-0"><b>{r.name}</b> <span className="text-muted">({r.kind}){r.contact ? ` · ${r.contact}` : ""}</span></span>
              <span className="shrink-0 text-muted">{r.area_min ?? ""}–{r.area_max ?? ""} m² · do {r.budget_max ? `${Math.round(r.budget_max).toLocaleString("sk-SK")} €` : "—"}</span>
            </li>))}</ul>
        )}
      </div>
      {b.repeatBuyers ? (
        <div>
          <div className="font-medium text-fg">Overení kupci v okrese — od {b.repeatFromYear} kúpili 2 a viac LV ({b.repeatBuyers.length})</div>
          {b.repeatBuyers.length === 0 ? <Muted>{masked ? "Osoby vidí len rola s plným prístupom; firmy s viacerými kúpami sa v okrese nenašli." : "V okrese sa nenašiel nikto s viacerými kúpami."}</Muted> : (
            <ul>{b.repeatBuyers.map((x, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
                <span className="min-w-0">{x.name}{x.isCompany ? <span className="ml-1 text-[10px] uppercase text-muted">firma</span> : null}</span>
                <span className="shrink-0 text-muted">{x.lvCount} LV{x.kus > 1 ? ` v ${x.kus} k.ú.` : ""}{x.lastYear ? ` · naposledy ${x.lastYear}` : ""}{x.priceMed ? ` · zmluvy ${Math.round((x.priceMin ?? 0) / 1000)}–${Math.round((x.priceMax ?? 0) / 1000)} tis. €` : ""}</span>
              </li>))}</ul>
          )}
        </div>
      ) : null}
      {b.demandAds && b.demandAds.length ? (
        <div>
          <div className="font-medium text-fg">Inzeráty „hľadám pozemok" v okrese ({b.demandAds.length})</div>
          <ul>{b.demandAds.map((d, i) => (
            <li key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
              <span className="min-w-0">{d.title ?? "dopyt"}<span className="text-muted">{d.obec ? ` · ${d.obec}` : ""}{d.priceEur ? ` · do ${Math.round(d.priceEur).toLocaleString("sk-SK")} €` : ""}</span></span>
              {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-brand hover:underline print:hidden">inzerát ↗</a> : null}
            </li>))}</ul>
        </div>
      ) : null}
      <div>
        <div className="font-medium text-fg">Susedia — vlastníci priľahlých parciel ({b.neighborsCount})</div>
        {b.neighbors.length === 0 ? <Muted>{masked && b.neighborsCount ? "Mená susedov vidí len rola s plným prístupom." : "Susedné parcely s inými vlastníkmi sa nenašli."}</Muted> : (
          <ul>{b.neighbors.flatMap((n) => n.owners.map((o, i) => <Person key={`${n.parcelNo}-${i}`} group="sused" o={{ ...o, detail: `parc. ${n.parcelNo}` }} />))}</ul>
        )}
      </div>
      <div>
        <div className="font-medium text-fg">Nedávno kupovali v tomto k.ú. — od {b.recentFromYear} ({b.recentBuyersCount})</div>
        {b.recentBuyers.length === 0 ? <Muted>{masked && b.recentBuyersCount ? "Mená osôb vidí len rola s plným prístupom." : "V zázname nie sú kúpy z posledných rokov."}</Muted> : (
          <ul>{b.recentBuyers.map((o, i) => <Person key={i} group="kupec" o={o} />)}</ul>
        )}
      </div>
      <div>
        <div className="font-medium text-fg">Firmy s majetkom v tomto k.ú. ({b.companies.length})</div>
        {b.companies.length === 0 ? <Muted>Žiadne firmy s majetkom v k.ú.</Muted> : (
          <ul>{b.companies.map((c, i) => {
            const r: LetterRecipient = { key: `firma:${c.ico ?? c.name}`, label: c.name, group: "firma", lvNo: null };
            return (
              <li key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
                <span className="min-w-0"><Pick r={r} />{c.name}{c.ico ? <span className="text-muted"> · IČO {c.ico}</span> : null}</span>
                <span className="shrink-0 text-muted">{c.category} · {c.lvCount} LV{finText(c.fin) ? ` · ${finText(c.fin)}` : ""}</span>
              </li>);
          })}</ul>
        )}
      </div>
      <div>
        <div className="font-medium text-fg">Firmy z registra so sídlom v okrese{b.okres ? ` ${b.okres}` : ""} ({b.registryFirms.length})</div>
        {b.registryFirms.length === 0 ? <Muted>Zoznam firiem z registra (RPO) pre tento okres ešte nie je načítaný.</Muted> : (
          <ul>{b.registryFirms.map((f) => {
            const r: LetterRecipient = { key: `register:${f.ico}`, label: [f.name, f.obec].filter(Boolean).join(", "), group: "register", lvNo: null };
            return (
              <li key={f.ico} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
                <span className="min-w-0"><Pick r={r} />{f.name}<span className="text-muted"> · IČO {f.ico}</span></span>
                <span className="shrink-0 text-muted">{[f.category, f.obec, finText(f.fin), f.established ? `od ${f.established.slice(0, 4)}` : null].filter(Boolean).join(" · ")}</span>
              </li>);
          })}</ul>
        )}
      </div>
      {sel.size > 0 ? (
        <div className="flex items-center gap-2 print:hidden">
          <button onClick={prepare} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream">Pripraviť listy ({sel.size})</button>
          <button onClick={() => setSel(new Map())} className="text-xs text-muted hover:text-fg">Zrušiť výber</button>
        </div>
      ) : <p className="text-[11px] text-muted print:hidden">Zaškrtni adresátov a appka pripraví listy na tlač s adresou z katastra.</p>}
      <p className="text-[11px] text-muted">
        Susedia a nedávni kupci sú odvodený záujem (môžu mať dôvod kúpiť), nie potvrdený dopyt. Kontakt na osoby
        appka nedohľadáva — oslovenie listom na adresu z katastra; ľudia s GDPR námietkou sú vyradení.
      </p>
    </div>
  );
}
