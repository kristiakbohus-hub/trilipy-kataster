import { useEffect, useState } from "react";
import { getParcelSubdivision, type ParcelSubdivision } from "../lib/api/kataster.functions";
import { SketchSvg } from "./subdivision-sketch";
import { eur, m2, Muted, Sub, Table } from "./ps-ui";

// GOLD-12 na liste nehnuteľnosti (interná verzia, 2026-11-14): ak je parcela súčasťou celku, ktorý sa podľa mapy KN
// dá rozdeliť na stavebné pozemky, ukáže návrh (náčrt, varianty, orientačnú hodnotu) z predvoleného behu na Macu.
// Klientska verzia ho nedostáva — je to neoverený návrh, nie vlastnosť nehnuteľnosti.
export function SubdivisionProposal({ kodKu, parcels, datasetId, onFound }: {
  kodKu: string | null; parcels: string[]; datasetId: string | null; onFound?: (found: boolean) => void;
}) {
  const [items, setItems] = useState<ParcelSubdivision[] | null>(null);
  const key = parcels.join(",");
  useEffect(() => {
    const ps = parcels.filter((p) => /^\d{1,6}(\/\d{1,4})?$/.test(p)).slice(0, 12);
    if (!kodKu || !ps.length) { setItems([]); onFound?.(false); return; }
    let alive = true;
    getParcelSubdivision({ data: { kodKu, parcels: ps } })
      .then((r) => { if (alive) { setItems(r.items); onFound?.(r.items.length > 0); } })
      .catch(() => { if (alive) { setItems([]); onFound?.(false); } });
    return () => { alive = false; };
  }, [kodKu, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items?.length) return null;
  return (
    <>
      {items.map((it, i) => {
        const best = it.best as { label?: string; lots?: number; lotAreas?: number[] } | null;
        const v = it.value as { available?: boolean; valueAfter?: number; net?: number; valueNow?: number | null; uplift?: number | null; lotPpm2?: number; lotSrc?: string; lotN?: number } | null;
        return (
          <div key={i}>
            <Sub>Návrh delenia celku z mapy KN — {it.classification === "MATCH" ? "zhoda" : "na preskúmanie"}</Sub>
            <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr]">
              {it.sketch ? <SketchSvg s={it.sketch} label={`Náčrt delenia: ${best?.label ?? ""}`} /> : <div />}
              <div className="space-y-2 text-xs">
                <div>
                  Celok {m2(it.siteM2)} ({it.site.length} parciel): <b>{best?.lots ?? 0} pozemky {best?.label ?? ""}</b>
                  {best?.lotAreas?.length ? <> — {best.lotAreas.map((a) => m2(a)).join(" · ")}</> : null}
                </div>
                <Table head={["Variant", "Pozemky", "Nová cesta", "Zvyšok"]} rows={it.variants.map((x) => {
                  const o = x as { label?: string; lots?: number; roadM2?: number; remainderPct?: number | null };
                  return [o.label ?? "—", String(o.lots ?? 0), o.roadM2 ? m2(o.roadM2) : "—", o.remainderPct != null ? `${o.remainderPct} %` : "—"];
                })} />
                {v?.available ? (
                  <div>
                    Orientačne: pozemky po rozdelení {eur(v.valueAfter ?? null)} (medián {v.lotPpm2} €/m², {v.lotSrc}, {v.lotN} zmlúv), po nákladoch {eur(v.net ?? null)}
                    {v.valueNow != null ? <>; celok dnes {eur(v.valueNow)}, rozdiel <b style={{ color: (v.uplift ?? 0) >= 0 ? "#3f5a3c" : "#9c4a40" }}>{(v.uplift ?? 0) >= 0 ? "+" : "−"}{eur(Math.abs(v.uplift ?? 0))}</b></> : null}.
                  </div>
                ) : null}
                {it.notes.filter((n) => n.startsWith("Otvorené")).map((n, j) => <Muted key={j}>{n}</Muted>)}
                <div className="no-print">
                  <a className="text-brand underline" href="/delenie-celkov">Delenie celkov →</a>
                  {it.pt && datasetId ? <> · <a className="text-brand underline" href={`/mapa?ds=${encodeURIComponent(datasetId)}&ll=${it.pt[0]},${it.pt[1]}&delenie=1`}>na mape →</a></> : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <Muted>Návrh z mapy KN, pôdorysov ZBGIS a terénu — nie je potvrdením stavebnosti ani geometrickým plánom; delenie posúdi urbanista, geodet, obec a stavebný úrad.</Muted>
    </>
  );
}
