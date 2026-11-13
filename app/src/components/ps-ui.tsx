// Spoločné stavebné bloky listu nehnuteľnosti (obrazovka aj tlač) — používa property-sheet aj property-finance.
import { createContext, useContext, type ReactNode } from "react";

/** Kapitoly skryté v klientskej verzii (výber kapitol pri zdieľaní). */
export const HideCtx = createContext<Set<string>>(new Set());

export const nf = (n: number, d = 0) => n.toLocaleString("sk-SK", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const eur = (n: number | null | undefined) => (n == null ? "—" : `${nf(Math.round(n))}\u00a0€`);
export const m2 = (n: number | null | undefined) => (n == null ? "—" : `${nf(Math.round(n))}\u00a0m²`);
export const dist = (m: number | null | undefined) => (m == null ? "—" : m < 1000 ? `${Math.round(m / 10) * 10}\u00a0m` : `${nf(m / 1000, 1)}\u00a0km`);
/** „šport/ihriská" → „Šport / ihriská" (rodiny zón z enginu sú technické názvy) */
export const prettyZone = (z: string | null | undefined) => (z ? z.replace(/\s*\/\s*/g, " / ").replace(/^./, (x) => x.toUpperCase()) : z ?? null);
export const date = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join(". ") : "—");


// ——— stavebné bloky ———
/** Vek údaju v dňoch (null = neznámy dátum). */
export function ageDays(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso.length === 7 ? `${iso}-01` : iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 864e5)) : null;
}
/** „Čo to pre vás znamená" — vysvetlenie pre laika na začiatku kapitoly. */
export function Explain({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="ps-explain rounded-md border border-line/70 bg-surface-2/60 px-3 py-2">
      <div className="ps-explain-h mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Čo to pre vás znamená</div>
      {lines.map((t, i) => <p key={i} className="text-[13px] leading-relaxed text-fg/90">{t}</p>)}
    </div>
  );
}
export function Sec({ id, n, title, source, children, explain, asOf, staleDays }: { id: string; n?: string; title: string; source?: ReactNode; children: ReactNode;
  explain?: string[]; asOf?: string | null; staleDays?: number }) {
  const hidden = useContext(HideCtx);
  const age = ageDays(asOf);
  if (hidden.has(id)) return null;
  const stale = age != null && staleDays != null && age > staleDays;
  return (
    <section id={id} className="ps-sec scroll-mt-16 border-t border-line pt-4">
      <h2 className="ps-h2 mb-2 flex items-baseline gap-2 text-base font-semibold text-fg">{n ? <span className="ps-num font-light text-muted">{n}</span> : null}<span>{title}</span>
        {asOf ? <span className={`ps-asof ml-auto text-[10px] font-normal tracking-normal ${stale ? "ps-stale" : "text-muted"}`} style={stale ? { color: "#9c4a40" } : undefined}>stav k {date(asOf)}{stale ? " · starší údaj" : ""}</span> : null}</h2>
      <div className="ps-body space-y-3 text-sm">{explain?.length ? <Explain lines={explain} /> : null}{children}</div>
      {source ? <div className="ps-source mt-2 text-[10px] leading-snug text-muted">Zdroj: {source}</div> : null}
    </section>
  );
}
export function Muted({ children }: { children: ReactNode }) { return <p className="ps-muted text-xs text-muted">{children}</p>; }
export function Sub({ children }: { children: ReactNode }) { return <h3 className="ps-sub text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</h3>; }
export function Grid({ rows }: { rows: [ReactNode, ReactNode][] }) {
  const r = rows.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (!r.length) return null;
  return (
    <dl className="ps-grid grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {r.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-line/40 py-0.5">
          <dt className="text-muted">{k}</dt><dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return null;
  return (
    <div className="ps-tablewrap overflow-x-auto">
      <table className="ps-table w-full text-xs">
        <thead><tr className="border-b border-line text-left text-muted">{head.map((h, i) => <th key={i} className="py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/40 align-top">{r.map((c, j) => <td key={j} className="py-1 pr-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

