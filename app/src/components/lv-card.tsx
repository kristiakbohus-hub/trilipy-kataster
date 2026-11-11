import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getLvVypis } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { useRole } from "../lib/role-context";

// Skrátený výpis z LV do panela na mape (zadanie vlastníka 2026-11-11: „oboje" — v paneli skrátený
// výpis s Tlačiť/PDF a tlačidlo na celý výpis). Tlač otvorí celý výpis v novom okne s print=1 →
// prehliadač hneď ponúkne tlač alebo „Uložiť ako PDF". Mená a texty listín len pri plnom prístupe
// (rozhoduje server podľa session).
type Vypis = Awaited<ReturnType<typeof getLvVypis>>;

export function LvCard({ datasetId, lvNo, note }: { datasetId: string; lvNo: number; note?: string }) {
  const { token } = useAuth();
  const { role } = useRole();
  const [v, setV] = useState<Vypis | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setV(null); setErr(false);
    getLvVypis({ data: { datasetId, lvNo, role, token: token ?? undefined } })
      .then((r) => { if (alive) setV(r); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [datasetId, lvNo, role, token]);

  const printUrl = `/vypis/${encodeURIComponent(datasetId)}/${lvNo}?typ=vypis&print=1`;
  const m2 = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);

  return (
    <div className="space-y-1.5 rounded-lg border border-ink/30 bg-paper p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-fg">LV č. {lvNo}{v?.dataset?.ku_name ? ` · ${v.dataset.ku_name}` : ""}</span>
        {note ? <span className="text-[10px] text-muted">{note}</span> : null}
      </div>
      {err ? <div className="text-muted">Výpis sa nepodarilo načítať.</div> : !v ? <div className="text-muted">Načítavam výpis…</div> : (
        <>
          <div className="text-muted">
            <b className="text-fg">A</b> · parcely C {v.parcelsC.length}{v.parcelsE.length ? ` · E ${v.parcelsE.length}` : ""}
            {v.buildings.length ? ` · stavby ${v.buildings.length}` : ""}
          </div>
          <ul className="space-y-0.5 pl-2 text-[11px] text-fg">
            {[...v.parcelsC.map((p) => ({ ...p, reg: "C" })), ...v.parcelsE.map((p) => ({ ...p, reg: "E" }))].slice(0, 6).map((p) => (
              <li key={`${p.reg}-${p.parcel_no}`}>{p.reg} {p.parcel_no} · {m2(p.area_m2)}{p.drp_text ? ` · ${p.drp_text}` : ""}</li>
            ))}
            {v.parcelsC.length + v.parcelsE.length > 6 ? <li className="text-muted">… a ďalšie ({v.parcelsC.length + v.parcelsE.length - 6})</li> : null}
            {v.buildings.slice(0, 2).map((b, i) => <li key={`b${i}`}>stavba: {b.descr}{b.on_parcel ? ` (parc. ${b.on_parcel})` : ""}</li>)}
          </ul>
          <div className="text-muted">
            <b className="text-fg">B</b> · {v.access === "full" && v.owners.length
              ? v.owners.slice(0, 4).map((o) => `${o.name}${o.share ? ` (${o.share})` : ""}`).join("; ") + (v.owners.length > 4 ? ` … (+${v.owners.length - 4})` : "")
              : `${v.count} vlastníkov${v.access === "full" ? "" : " (mená len pri plnom prístupe)"}`}
          </div>
          <div className="text-muted"><b className="text-fg">C</b> · ťarchy {v.tarchyCount}</div>
        </>
      )}
      <div className="flex gap-1.5 pt-1">
        <a href={printUrl} target="_blank" rel="noopener"
          className="flex-1 rounded-md bg-ink px-2 py-1.5 text-center font-medium text-cream hover:opacity-90 max-md:py-2.5 max-md:text-sm">🖨️ Tlačiť / PDF</a>
        <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId, lvNo: String(lvNo) }} search={{ typ: "vypis" as const }}
          className="flex-1 rounded-md border border-line px-2 py-1.5 text-center text-fg hover:bg-surface-2 max-md:py-2.5 max-md:text-sm">Celý výpis →</Link>
      </div>
    </div>
  );
}
