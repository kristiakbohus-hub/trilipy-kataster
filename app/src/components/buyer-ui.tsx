import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buyerMatchToDeal, getStateContracts, listingBuyers, setBuyerMatchStatus, type BuyerHit, type ListingBuyers, type StateContract } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";

// Spoločné prvky kupcov (2026-11-11): skóre zhody, stav zhody a panel „Kto by to kúpil" k inzerátu.
export function ScorePill({ n }: { n: number }) {
  const cls = n >= 70 ? "bg-green/15 text-green" : n >= 50 ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted";
  return <span className={`inline-block min-w-[2.2rem] rounded px-1 text-center text-[11px] font-semibold tabular-nums ${cls}`} title="skóre zhody 0–100 (odvodené, nie ocenenie)">{n}</span>;
}

/** Finančná sila firmy z RÚZ (bod 9): „tržby 2,1 mil. € · majetok 3,4 mil. € (2025)". */
export function finText(f: { revenue: number | null; assets: number | null; year: number | null } | null | undefined): string | null {
  if (!f || (f.revenue == null && f.assets == null)) return null;
  const m = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString("sk-SK", { maximumFractionDigits: 1 })} mil. €` : `${Math.round(n / 1000).toLocaleString("sk-SK")} tis. €`);
  return [f.revenue != null ? `tržby ${m(f.revenue)}` : null, f.assets != null ? `majetok ${m(f.assets)}` : null].filter(Boolean).join(" · ") + (f.year ? ` (${f.year})` : "");
}

export const MATCH_STATUS_SK: Record<string, string> = {
  nova: "nová", vybrana: "vybraná do ponuky", poslana: "poslaná klientovi", zaujem: "klient má záujem", obhliadka: "obhliadka", odmietnuta: "odmietnutá",
};
export const REJECT_REASONS = ["cena", "lokalita", "výmera", "stav / typ", "právne problémy", "predané / stiahnuté", "iné"];

/** Výber stavu zhody; pri „odmietnutá" sa pýta dôvod. Snapshot zhody sa ukladá pri výbere do ponuky. */
export function MatchStatusSelect({ requestId, hit, canEdit, onChange }: { requestId: number; hit: BuyerHit; canEdit: boolean; onChange: (st: string, reason: string | null) => void }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!canEdit) return <span className="text-[11px] text-muted">{MATCH_STATUS_SK[hit.status] ?? hit.status}</span>;
  async function set(st: string) {
    if (!token) return;
    let reason: string | undefined;
    if (st === "odmietnuta") {
      const r = window.prompt(`Prečo klient odmieta? (${REJECT_REASONS.join(", ")})`, REJECT_REASONS[0]);
      if (r == null) return;
      reason = r.trim().slice(0, 200) || "iné";
    }
    setBusy(true);
    try {
      const snap = st === "nova" || st === "odmietnuta" ? undefined : JSON.stringify({ ...hit, status: st }).slice(0, 6000);
      const r = await setBuyerMatchStatus({ data: { token, requestId, mkey: hit.key, status: st as never, reason, snapshot: snap } });
      if (r.ok) onChange(st, reason ?? null);
    } finally { setBusy(false); }
  }
  return (
    <select value={hit.status} disabled={busy} onChange={(e) => void set(e.target.value)} aria-label="Stav zhody"
      className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] text-fg max-md:py-1.5">
      {Object.entries(MATCH_STATUS_SK).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

/** „Kto by to kúpil" k inzerátu — dopyty so skóre, dopytové inzeráty, overení kupci, firmy z registra. */
export function ListingBuyersPanel({ url }: { url: string }) {
  const { token } = useAuth();
  const [d, setD] = useState<ListingBuyers | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    listingBuyers({ data: { token, url } }).then((r) => { if (alive) setD(r); }).catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, [token, url]);
  if (!token) return <p className="text-xs text-muted">Prihlás sa.</p>;
  if (!d) return <p className="text-xs text-muted">Hľadám, kto by to kúpil…</p>;
  if (!d.ok) return <p className="text-xs text-muted">{d.message ?? "Nepodarilo sa zistiť."}</p>;
  const masked = d.access !== "full";
  return (
    <div className="space-y-2 rounded-md border border-line bg-paper p-2 text-xs">
      {d.parcelMatches?.length ? (
        <div>
          <div className="font-medium text-fg">Pravdepodobne v katastri (zhoda obce a výmery — overiť)</div>
          <ul>{d.parcelMatches.map((m, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-line/40 py-0.5">
              <span>{m.kuName ?? m.datasetId} · {m.kind === "LV" ? `LV ${m.lvNo} (pozemky spolu)` : `parcela ${m.register ?? "C"} ${m.parcelNo}`}{m.areaM2 ? ` · ${Math.round(m.areaM2).toLocaleString("sk-SK")} m²` : ""}
                <span className="text-muted"> · istota {m.confidence === "vysoka" ? "vysoká" : m.confidence === "stredna" ? "stredná" : "nízka"}{(m.nCandidates ?? 1) > 1 ? ` (${m.nCandidates} kandidáti)` : ""}{m.via ? ` · ${m.via}` : ""}</span></span>
              {m.lvNo != null ? <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: m.datasetId, lvNo: String(m.lvNo) }} search={{ typ: "vypis" as const }} className="text-brand hover:underline">výpis LV</Link> : null}
            </li>))}</ul>
        </div>
      ) : null}
      <div>
        <div className="font-medium text-fg">Dopyty z evidencie ({d.requests.length})</div>
        {d.requests.length === 0 ? <p className="text-muted">Žiadny aktívny dopyt nesedí. <Link to="/kupci" className="text-brand hover:underline">Pridať záujemcu →</Link></p> : (
          <ul>{d.requests.map((r) => (
            <li key={r.id} className="border-b border-line/40 py-1">
              <ScorePill n={r.score} /> <b>{r.name}</b> <span className="text-muted">· {r.reasons.join(" · ")}</span>
              {r.checks.length ? <span className="text-warning"> · overiť: {r.checks.join(", ")}</span> : null}
            </li>))}</ul>
        )}
      </div>
      {d.demandAds.length ? (
        <div>
          <div className="font-medium text-fg">Inzeráty „hľadám / kúpim" v okrese {d.okres ?? ""} ({d.demandAds.length})</div>
          <ul>{d.demandAds.map((a, i) => (
            <li key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
              <span className="min-w-0">{a.title ?? "dopyt"}<span className="text-muted">{a.obec ? ` · ${a.obec}` : ""}{a.priceEur ? ` · do ${Math.round(a.priceEur).toLocaleString("sk-SK")} €` : ""}</span></span>
              {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-brand hover:underline">↗</a> : null}
            </li>))}</ul>
        </div>
      ) : null}
      <div>
        <div className="font-medium text-fg">Overení kupci v okrese — od {d.repeatFromYear} kúpili 2+ LV ({d.repeatBuyers.length})</div>
        {d.repeatBuyers.length === 0 ? <p className="text-muted">{masked ? "Osoby vidí len plný prístup; firmy s viacerými kúpami sa nenašli." : "Nikto s viacerými kúpami v okrese."}</p> : (
          <ul>{d.repeatBuyers.slice(0, 15).map((x, i) => (
            <li key={i} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
              <span className="min-w-0">{x.name}{x.isCompany ? <span className="ml-1 text-[10px] uppercase text-muted">firma</span> : null}</span>
              <span className="shrink-0 text-muted">{x.lvCount} LV{x.lastYear ? ` · ${x.lastYear}` : ""}{x.priceMed ? ` · ${Math.round((x.priceMin ?? 0) / 1000)}–${Math.round((x.priceMax ?? 0) / 1000)} tis. €` : ""}</span>
            </li>))}</ul>
        )}
      </div>
      {d.firms.length ? (
        <div>
          <div className="font-medium text-fg">Firmy z registra v okrese ({d.firms.length})</div>
          <ul>{d.firms.slice(0, 15).map((f) => (
            <li key={f.ico} className="flex justify-between gap-2 border-b border-line/40 py-0.5">
              <span className="min-w-0">{f.name}{f.category ? <span className="text-muted"> · {f.category}</span> : null}</span>
              <span className="shrink-0 text-muted">{finText(f.fin) ?? `IČO ${f.ico}`}</span>
            </li>))}</ul>
        </div>
      ) : null}
      <p className="text-[10px] text-muted">Odvodený záujem, nie potvrdený dopyt. Kontakty osôb appka nedohľadáva.</p>
    </div>
  );
}

/** Tlačidlo, ktoré rozbalí „Kto by to kúpil" pod riadkom inzerátu. */
export function ListingBuyersToggle({ url }: { url: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <div className="w-full">
      <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-brand hover:underline">{open ? "Skryť kupcov" : "Kto by to kúpil?"}</button>
      {open ? <div className="mt-1"><ListingBuyersPanel url={url} /></div> : null}
    </div>
  );
}

const SC_KIND: Record<string, string> = { kupa: "predaj / kúpa", zamena: "zámena", vecne_bremeno: "vecné bremeno", najom: "nájom" };
/** Štátne zmluvy o pozemkoch z CRZ (SPF, Lesy SR, SVP, ŽSR, NDS…) — kto od štátu kupuje a kde štát predáva. */
export function StateContractsCard() {
  const { token } = useAuth();
  const [rows, setRows] = useState<StateContract[] | null>(null);
  const [only, setOnly] = useState<"kupa" | "vsetko">("kupa");
  const [okres, setOkres] = useState("");
  useEffect(() => {
    if (!token) return;
    getStateContracts({ data: { token, days: 60 } }).then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [token]);
  if (!rows) return null;
  const okresy = [...new Set(rows.map((r) => r.okres).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "sk"));
  const list = rows.filter((r) => (only === "vsetko" || r.kind === "kupa" || r.kind === "zamena") && (!okres || r.okres === okres));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className="rounded-md border border-line bg-paper px-2 py-1 text-fg">
          <option value="kupa">predaje a zámeny</option><option value="vsetko">aj bremená a nájmy</option>
        </select>
        <select value={okres} onChange={(e) => setOkres(e.target.value)} className="rounded-md border border-line bg-paper px-2 py-1 text-fg">
          <option value="">celé SR</option>{okresy.map((o) => <option key={o} value={o}>okres {o}</option>)}
        </select>
        <span className="text-muted">posledných 60 dní · {list.length}</span>
      </div>
      {list.length === 0 ? <p className="text-xs text-muted">Žiadne zmluvy pre tento výber (zber beží denne ráno a večer).</p> : (
        <ul className="divide-y divide-line/60 text-xs">
          {list.slice(0, 60).map((r) => (
            <li key={r.crzId} className="flex flex-wrap items-baseline justify-between gap-2 py-1">
              <span className="min-w-0">
                <b className="text-fg">{SC_KIND[r.kind] ?? r.kind}</b> · {r.publisher}
                {r.kuName ? <span className="text-muted"> · k.ú. {r.kuName}{r.okres ? ` (okres ${r.okres})` : ""}</span> : null}
                {r.party ? <span className="text-muted"> · s: {r.party}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {r.amount ? `${Math.round(r.amount).toLocaleString("sk-SK")} € · ` : ""}{r.day.split("-").reverse().join(". ")}
                {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-brand hover:underline">CRZ ↗</a> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted">Zdroj: Centrálny register zmlúv (verejné dáta). Mená fyzických osôb sa neukladajú. Firma, ktorá kupuje pozemky od štátu, je možný kupec aj predávajúci.</p>
    </div>
  );
}

/** Zhoda → spis (a pri LV aj deal v pipeline). Bod 6, 2026-11-11. */
export function MatchToDealButton({ requestId, hit, onDone }: { requestId: number; hit: BuyerHit; onDone?: (msg: string) => void }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <Link to={done.includes("deal") ? "/deals" : "/cases"} className="text-[11px] text-green hover:underline">{done} →</Link>;
  async function go() {
    if (!token || !window.confirm(`Založiť spis „${hit.title}" pre tento dopyt${hit.lvNo != null ? " a obchod (oslovenie vlastníkov LV)" : ""}?`)) return;
    setBusy(true);
    try {
      const r = await buyerMatchToDeal({ data: { token, requestId, hit: JSON.stringify(hit).slice(0, 6000) } });
      const msg = r.ok ? (r.dealId ? "spis + deal založený" : "spis založený") : (r.message ?? "nepodarilo sa");
      setDone(msg); onDone?.(msg);
    } finally { setBusy(false); }
  }
  return <button onClick={() => void go()} disabled={busy} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-fg hover:border-ink disabled:opacity-50 max-md:py-1.5">{busy ? "…" : "Do obchodu"}</button>;
}
