import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { BuyerHit, PublicOffer } from "../lib/api/kataster.functions";

// VEREJNÁ PONUKA PRE KLIENTA (bod 10, 2026-11-11): /p/<token> bez prihlásenia. Dáta z /api/offer (platnosť
// a zrušenie stráži server). Len položky ponuky — žiadne mená vlastníkov ani klienta. Neindexovať.
export const Route = createFileRoute("/p/$token")({
  head: () => ({ meta: [{ title: "Ponuka nehnuteľností — TRI LIPY" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PublicOfferPage,
});

const SRC_SK: Record<string, string> = { inzerat: "Inzerát na trhu", parcela: "Pozemok (nie je v predaji, vlastníka oslovíme)", mimo_trhu: "Mimo trhu (vlastníka oslovíme)", prilezitost: "Pozemková príležitosť" };
const eur = (n: number | null | undefined) => (n == null ? null : `${Math.round(n).toLocaleString("sk-SK")} €`);

function PublicOfferPage() {
  const { token } = Route.useParams();
  const [d, setD] = useState<PublicOffer | null>(null);
  useEffect(() => {
    fetch(`/api/offer?t=${encodeURIComponent(token)}`).then((r) => r.json() as Promise<PublicOffer>).then(setD)
      .catch(() => setD({ ok: false, message: "Ponuku sa nepodarilo načítať." }));
  }, [token]);
  return (
    <div className="min-h-dvh bg-cream px-4 py-8 text-fg">
      <div className="mx-auto max-w-[860px] space-y-5">
        {!d ? <p className="text-sm text-muted">Načítavam ponuku…</p> : !d.ok ? (
          <div className="rounded-xl border border-line bg-paper p-6 text-sm">{d.message}</div>
        ) : (
          <section className="rounded-xl border border-line bg-paper p-6 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 pb-3" style={{ borderColor: "#333" }}>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted">TRI LIPY</div>
                <h1 className="mt-1 text-xl font-bold">{d.heading}</h1>
                <div className="text-xs text-muted">{d.summary}</div>
              </div>
              <button onClick={() => window.print()} className="no-print rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream">Tlačiť / PDF</button>
            </div>
            {!d.items?.length ? <p className="mt-4 text-muted">Ponuka zatiaľ neobsahuje žiadne položky.</p> : (
              <ol className="mt-4 space-y-5">
                {d.items.map((h: BuyerHit, i: number) => (
                  <li key={h.key} className="break-inside-avoid space-y-1.5 border-b border-line pb-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-base font-semibold">{i + 1}. {h.title}</h2>
                      <span className="text-[11px] text-muted">{SRC_SK[h.src] ?? h.src}</span>
                    </div>
                    <div className="text-xs text-muted">{[h.sub, h.areaM2 ? `${Math.round(h.areaM2).toLocaleString("sk-SK")} m²` : null, eur(h.priceEur), h.ppm2 ? `${Math.round(h.ppm2)} €/m²` : null, h.estEur ? `orientačne ~${eur(h.estEur)}` : null].filter(Boolean).join(" · ")}</div>
                    {h.reasons.length ? <p className="text-xs"><b>Prečo:</b> {h.reasons.join(" · ")}</p> : null}
                    {h.checks.length ? <p className="text-xs"><b>Treba overiť:</b> {h.checks.join(" · ")}</p> : null}
                    {h.url ? <p className="text-xs"><a href={h.url} target="_blank" rel="noopener noreferrer" className="break-all underline">Pôvodný inzerát</a></p> : null}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-[10px] text-muted">
              Podklad na rozhodovanie, nie znalecký posudok ani záväzná ponuka. Pozemky a položky mimo trhu nie sú v predaji —
              vlastníkov oslovujeme až na váš pokyn. Ceny z inzerátov sú ponukové, odhady orientačné. Odkaz platí do {d.expiresAt?.slice(0, 10).split("-").reverse().join(". ")}.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
