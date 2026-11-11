import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listingBuyers, setBuyerMatchStatus, type BuyerHit, type ListingBuyers } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";

// Spoločné prvky kupcov (2026-11-11): skóre zhody, stav zhody a panel „Kto by to kúpil" k inzerátu.
export function ScorePill({ n }: { n: number }) {
  const cls = n >= 70 ? "bg-green/15 text-green" : n >= 50 ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted";
  return <span className={`inline-block min-w-[2.2rem] rounded px-1 text-center text-[11px] font-semibold tabular-nums ${cls}`} title="skóre zhody 0–100 (odvodené, nie ocenenie)">{n}</span>;
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
              <span className="shrink-0 text-muted">{x.lvCount} LV{x.lastYear ? ` · ${x.lastYear}` : ""}</span>
            </li>))}</ul>
        )}
      </div>
      {d.firms.length ? (
        <div>
          <div className="font-medium text-fg">Firmy z registra v okrese ({d.firms.length})</div>
          <p className="text-muted">{d.firms.slice(0, 12).map((f) => `${f.name}${f.category ? ` (${f.category})` : ""}`).join(" · ")}</p>
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
