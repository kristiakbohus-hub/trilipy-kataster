import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ownerStatement, type OwnerStatement } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";

// VÝPIS PODĽA VLASTNÍKA (2026-11-13, zadanie vlastníka): všetko, čo osoba alebo firma vlastní v našich k.ú. —
// po LV podiel, parcely (výmera, druh), stavby, ťarchy, problémy; súčty; pri každom k.ú. „otvoriť ako vlastný
// celok" (spojený list). Len plný prístup (server), interný dokument s osobnými údajmi — nezdieľať s klientom.
// BEZ `loader` (pamäť cf_app_ssr_loader_leak): dáta až po prihlásení.
type Search = { ds?: string; lv?: string; o?: string };
export const Route = createFileRoute("/vlastnik")({
  head: () => ({ meta: [{ title: "Výpis podľa vlastníka — TRI LIPY" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ds: typeof s.ds === "string" ? s.ds : undefined,
    lv: typeof s.lv === "string" || typeof s.lv === "number" ? String(s.lv) : undefined,
    o: typeof s.o === "string" && /^[0-9a-f]{8}$/.test(s.o) ? s.o : undefined,
  }),
  component: OwnerStatementPage,
});

const m2 = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);
const ha = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString("sk-SK", { maximumFractionDigits: 2 })} ha` : m2(n));

function OwnerStatementPage() {
  const s = Route.useSearch();
  const { token } = useAuth();
  const [r, setR] = useState<OwnerStatement | null>(null);
  useEffect(() => {
    if (!token || !s.ds || !s.lv || !s.o) return;
    ownerStatement({ data: { token, datasetId: s.ds, lvNo: Number(s.lv), owner: s.o } }).then(setR).catch(() => setR({ ok: false, lvs: [], message: "Výpis sa nepodarilo načítať." }));
  }, [token, s.ds, s.lv, s.o]);
  const groups = useMemo(() => {
    const g = new Map<string, OwnerStatement["lvs"]>();
    for (const l of r?.lvs ?? []) g.set(l.datasetId, [...(g.get(l.datasetId) ?? []), l]);
    return [...g.entries()];
  }, [r]);

  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa.</div>;
  if (!s.ds || !s.lv || !s.o) return <div className="p-6 text-sm text-muted">Výpis podľa vlastníka sa otvára z mena vlastníka v liste nehnuteľnosti alebo vo výpise LV.</div>;
  if (!r) return <div className="p-6 text-sm text-muted">Zostavujem výpis…</div>;
  if (!r.ok) return <div className="p-6 text-sm text-muted">{r.message}</div>;
  const t = r.totals!;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 print:p-0">
      <style>{`@media print { .no-print, nav, aside, header.app { display: none !important; } @page { size: A4; margin: 14mm; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Výpis podľa vlastníka · interný dokument s osobnými údajmi</div>
          <h1 className="mt-1 text-xl font-semibold text-fg">{r.name}</h1>
          <p className="mt-1 text-xs text-muted">
            {r.birthKnown ? "Zhoda podľa mena a dátumu narodenia zo zápisu v katastri." : "Zhoda len podľa mena (dátum narodenia nie je zapísaný) — pri bežnom mene môže ísť o viac osôb, overte."}
            {r.truncated ? " Zobrazených prvých 120 listov vlastníctva." : ""}
          </p>
        </div>
        <button onClick={() => window.print()} className="no-print rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream">Tlačiť / uložiť PDF</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Listy vlastníctva", `${t.lvs}`, `${t.kus} ${t.kus === 1 ? "katastrálne územie" : t.kus <= 4 ? "katastrálne územia" : "katastrálnych území"}`], ["Parcely", `${t.parcels}`, t.buildings === 1 ? "1 stavba" : t.buildings >= 2 && t.buildings <= 4 ? `${t.buildings} stavby` : `${t.buildings} stavieb`],
          ["Výmera spolu", ha(t.areaM2), "celé parcely LV"], ["Výmera podľa podielu", ha(t.shareAreaM2), "výmera × spoluvlastnícky podiel"]].map(([a, b, c]) => (
          <div key={a} className="rounded-xl border border-line bg-surface p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted">{a}</div><div className="mt-1 text-lg font-semibold tabular-nums">{b}</div><div className="text-[11px] text-muted">{c}</div>
          </div>
        ))}
      </div>

      {t.byDruh.length ? (
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Podľa druhu pozemku</div>
          <table className="w-full text-sm"><tbody>
            {t.byDruh.map((d) => <tr key={d.druh} className="border-t border-line/50"><td className="py-1">{d.druh}</td><td className="py-1 text-right tabular-nums">{ha(d.areaM2)}</td><td className="py-1 text-right tabular-nums text-muted">podiel {ha(d.shareAreaM2)}</td></tr>)}
          </tbody></table>
        </div>
      ) : null}

      {groups.map(([ds, lvs]) => {
        const ku = lvs[0].kuName;
        const chunks: (typeof lvs)[] = [];
        for (let i = 0; i < lvs.length; i += 10) chunks.push(lvs.slice(i, i + 10));
        return (
          <section key={ds} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">{ku}{lvs[0].okres ? <span className="font-normal text-muted"> · okres {lvs[0].okres}</span> : null}</h2>
              <div className="no-print flex flex-wrap gap-2 text-xs">
                {chunks.map((c, i) => (
                  <Link key={i} to="/nehnutelnost" search={{ ds, vyber: c.map((l) => `lv:${l.lvNo}`).join(";") }} className="rounded-md border border-line px-2 py-1 hover:border-ink">
                    Otvoriť ako vlastný celok{chunks.length > 1 ? ` (${i * 10 + 1}–${i * 10 + c.length})` : ""}
                  </Link>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="py-1">LV</th><th>Podiel</th><th>Parcely</th><th className="text-right">Výmera</th><th className="text-right">Podľa podielu</th><th>Stavby</th><th>Ťarchy a problémy</th></tr></thead>
                <tbody>
                  {lvs.map((l) => (
                    <Fragment key={l.lvNo}>
                      <tr className="border-t border-line align-top">
                        <td className="py-1.5"><Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: l.datasetId, lvNo: String(l.lvNo) }} search={{ typ: "vypis" as const }} className="text-brand underline">{l.lvNo}</Link></td>
                        <td className="py-1.5 tabular-nums">{l.share ?? "—"}{l.coOwners > 1 ? <div className="text-[11px] text-muted">{l.coOwners} spoluvlastníkov</div> : null}</td>
                        <td className="max-w-[260px] py-1.5 text-xs">{l.parcels.slice(0, 12).map((p) => `${p.register === "E" ? "E " : ""}${p.parcelNo}${p.druh ? ` (${p.druh})` : ""}`).join(", ")}{l.parcels.length > 12 ? ` a ďalších ${l.parcels.length - 12}` : ""}</td>
                        <td className="py-1.5 text-right tabular-nums">{m2(l.areaM2)}</td>
                        <td className="py-1.5 text-right tabular-nums">{m2(l.shareAreaM2)}</td>
                        <td className="max-w-[200px] py-1.5 text-xs">{l.buildings.length ? l.buildings.slice(0, 4).map((b) => b.descr).join("; ") : "—"}</td>
                        <td className="max-w-[200px] py-1.5 text-xs">{[l.tarchy ? `${l.tarchy}× ťarcha / poznámka` : "", ...l.flags].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="text-[11px] text-muted">
        Zdroj: kataster (SPI) k dátumu importu katastrálneho územia — len územia, ktoré máme importované. Výmera „podľa podielu" = výmera parciel LV × spoluvlastnícky podiel.
        Interný dokument s osobnými údajmi: nezdieľať, používať len na oprávnený účel (GDPR); prístup sa zaznamenáva.
      </p>
    </div>
  );
}
