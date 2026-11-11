import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getLvVypis } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { useRole } from "../lib/role-context";
import { LvMapSnapshot } from "../components/lv-map";

// HROMADNÝ VÝPIS (zadanie vlastníka 2026-11-11): výber parciel na mape → všetky ich LV v jednom
// dokumente na tlač / PDF, každý LV na novej strane s kópiou z mapy. ?lv=kn-866083:1352,kn-866083:4045
// &print=1 → po načítaní všetkého sa hneď otvorí tlač. Mená a listiny len pri plnom prístupe (server).
// BEZ `loader` (pamäť cf_app_ssr_loader_leak).
type Item = { datasetId: string; lvNo: number };
export const Route = createFileRoute("/vypis-hromadne")({
  head: () => ({ meta: [{ title: "Hromadný výpis LV — TRI LIPY KATASTER CORE" }] }),
  validateSearch: (s: Record<string, unknown>): { lv: string; print?: boolean } => ({
    lv: typeof s.lv === "string" ? s.lv.slice(0, 2000) : "",
    ...(s.print === true || s.print === 1 || s.print === "1" ? { print: true } : {}),
  }),
  component: BulkPage,
});

function parseItems(lv: string): Item[] {
  const out: Item[] = []; const seen = new Set<string>();
  for (const part of lv.split(",")) {
    const m = part.trim().match(/^([A-Za-z0-9_-]{2,40}):(\d{1,7})$/);
    if (!m || seen.has(part)) continue;
    seen.add(part); out.push({ datasetId: m[1], lvNo: Number(m[2]) });
  }
  return out.slice(0, 40);
}

function BulkPage() {
  const { lv, print } = Route.useSearch();
  const items = parseItems(lv);
  const ready = useRef(new Set<string>());
  const [nReady, setNReady] = useState(0);
  const [waitOver, setWaitOver] = useState(false);
  const printed = useRef(false);
  const mark = (k: string) => { if (!ready.current.has(k)) { ready.current.add(k); setNReady(ready.current.size); } };
  useEffect(() => { if (!print) return; const t = setTimeout(() => setWaitOver(true), 20000); return () => clearTimeout(t); }, [print]);
  useEffect(() => {
    // každý LV hlási 2 veci: text výpisu a kópiu z mapy
    if (!print || printed.current || !items.length || !(nReady >= items.length * 2 || waitOver)) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [print, nReady, waitOver, items.length]);

  if (!items.length) return <div className="p-8 text-sm text-muted">Žiadne LV na výpis — vyber parcely na mape a použi „Tlačiť LV výberu“.</div>;
  return (
    <div className="mx-auto max-w-[900px] space-y-8 print:max-w-none">
      <div className="no-print flex items-center justify-between gap-3">
        <div className="text-sm text-muted">Hromadný výpis: <b className="text-fg">{items.length}</b> LV · načítané {Math.min(nReady, items.length * 2)}/{items.length * 2}</div>
        <button onClick={() => window.print()} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream">🖨️ Tlačiť / uložiť PDF</button>
      </div>
      {items.map((it, i) => (
        <BulkLv key={`${it.datasetId}:${it.lvNo}`} item={it} last={i === items.length - 1}
          onText={() => mark(`t:${it.datasetId}:${it.lvNo}`)} onMap={() => mark(`m:${it.datasetId}:${it.lvNo}`)} />
      ))}
    </div>
  );
}

type Vypis = Awaited<ReturnType<typeof getLvVypis>>;
function BulkLv({ item, last, onText, onMap }: { item: Item; last: boolean; onText: () => void; onMap: () => void }) {
  const { token } = useAuth();
  const { role } = useRole();
  const [v, setV] = useState<Vypis | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    getLvVypis({ data: { datasetId: item.datasetId, lvNo: item.lvNo, role, token: token ?? undefined } })
      .then((r) => { if (alive) { setV(r); onText(); } })
      .catch(() => { if (alive) { setErr(true); onText(); onMap(); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.datasetId, item.lvNo, role, token]);
  const m2 = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("sk-SK"));
  const th = "border-b border-line py-1 pr-2 text-left font-medium";
  const td = "border-b border-line/50 py-0.5 pr-2 align-top";
  return (
    <section className="print-doc rounded-xl border border-line bg-paper p-6 text-sm" style={last ? undefined : { breakAfter: "page" }}>
      <div className="flex items-start justify-between border-b-2 pb-3" style={{ borderColor: "#333" }}>
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted">TRI LIPY · Kataster Core · pracovný výpis</div>
          <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-fg">List vlastníctva č. {item.lvNo}</h2>
          <div className="text-xs text-muted">k.ú. {v?.dataset?.ku_name ?? "—"} (kód {v?.dataset?.ku_code ?? "—"}) · {v?.dataset?.region ?? ""}</div>
        </div>
        <div className="text-right text-[11px] text-muted">Stav dát: {v?.dataset?.updated_at ?? "—"}</div>
      </div>
      {err ? <p className="mt-3 text-muted">Výpis LV sa nepodarilo načítať.</p> : !v ? <p className="mt-3 text-muted">Načítavam…</p> : (
        <div className="mt-3 space-y-4">
          <LvMapSnapshot datasetId={item.datasetId} lvNo={item.lvNo} hasE={v.parcelsE.length > 0} onReady={onMap} />
          <div>
            <h3 className="mb-1 font-semibold text-fg">Časť A — Majetková podstata</h3>
            <table className="w-full text-xs"><thead><tr>
              <th className={th}>Register</th><th className={th}>Parcelné číslo</th><th className={th}>Výmera (m²)</th><th className={th}>Druh pozemku</th><th className={th}>Umiestnenie</th>
            </tr></thead><tbody>
              {[...v.parcelsC.map((p) => ({ ...p, reg: "C-KN" })), ...v.parcelsE.map((p) => ({ ...p, reg: "E-KN" }))].map((p) => (
                <tr key={`${p.reg}-${p.parcel_no}`}><td className={td}>{p.reg}</td><td className={td}>{p.parcel_no}</td><td className={td}>{m2(p.area_m2)}</td><td className={td}>{p.drp_text ?? "—"}</td><td className={td}>{p.placement ?? "—"}</td></tr>
              ))}
            </tbody></table>
            {v.buildings.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">{v.buildings.map((b, i) => <li key={i}>Stavba: {b.descr}{b.on_parcel ? ` — na parcele ${b.on_parcel}` : ""}</li>)}</ul>
            ) : null}
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-fg">Časť B — Vlastníci a iné oprávnené osoby</h3>
            {v.access === "full" ? (
              <table className="w-full text-xs"><thead><tr><th className={th}>Vlastník</th><th className={th}>Podiel</th></tr></thead><tbody>
                {v.owners.map((o) => <tr key={o.id}><td className={td}>{o.name}{o.birth_date ? `, nar. ${o.birth_date}` : ""}</td><td className={td}>{o.share ?? "—"}</td></tr>)}
              </tbody></table>
            ) : <p className="text-xs text-muted">{v.count} vlastníkov — mená len pri plnom prístupe.</p>}
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-fg">Časť C — Ťarchy</h3>
            {v.access === "full" ? (v.tarchy.length ? <ul className="list-disc pl-5 text-xs">{v.tarchy.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-xs text-muted">Bez zápisu.</p>)
              : <p className="text-xs text-muted">{v.tarchyCount} zápisov — texty len pri plnom prístupe.</p>}
          </div>
          <p className="text-[10px] text-muted">Interný pracovný podklad — nie je to úradný výpis z katastra nehnuteľností ani právne potvrdenie vlastníctva.</p>
        </div>
      )}
    </section>
  );
}
