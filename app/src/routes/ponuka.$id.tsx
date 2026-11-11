import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createOfferShare, getBuyerOffer, listOfferShares, revokeOfferShare, setBuyerMatchStatus, type BuyerOfferItem, type BuyerRequest } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { LvMapSnapshot } from "../components/lv-map";

// PONUKA PRE KLIENTA (rozhodnutie vlastníka 2026-11-11): zhody dopytu označené „vybraná do ponuky"
// (a neskôr poslané / záujem / obhliadka) v jednom dokumente na tlač alebo „Uložiť ako PDF". Obsah je
// snapshot zhody z času výberu. Bez mien vlastníkov — klient dostane parcelu, LV, dôvody a čo overiť.
// BEZ `loader` (pamäť cf_app_ssr_loader_leak).
export const Route = createFileRoute("/ponuka/$id")({
  head: () => ({ meta: [{ title: "Ponuka pre klienta — TRI LIPY KATASTER CORE" }] }),
  component: OfferPage,
});

const PTYPE: Record<string, string> = { pozemok: "pozemok", byt: "byt", dom: "dom", chata: "chata / chalupa", komercne: "komerčný priestor" };
const SRC_SK: Record<string, string> = { inzerat: "Inzerát na trhu", parcela: "Pozemok z katastra (nie je v predaji)", mimo_trhu: "Mimo trhu", prilezitost: "Naša príležitosť" };
const eur = (n: number | null | undefined) => (n == null ? null : `${Math.round(n).toLocaleString("sk-SK")} €`);

function OfferPage() {
  const { id } = Route.useParams();
  const { token } = useAuth();
  const [d, setD] = useState<{ ok: boolean; message?: string; request: (BuyerRequest & { label: string }) | null; items: BuyerOfferItem[] } | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    getBuyerOffer({ data: { token, id: Number(id) } }).then(setD).catch(() => setD({ ok: false, message: "Ponuku sa nepodarilo načítať.", request: null, items: [] }));
  }, [token, id]);
  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa.</div>;
  if (!d) return <div className="p-6 text-sm text-muted">Načítavam ponuku…</div>;
  if (!d.ok || !d.request) return <div className="p-6 text-sm text-muted">{d.message ?? "Ponuka nie je dostupná."}</div>;
  const r = d.request;
  const items = d.items.filter((x) => x.hit);
  async function markSent() {
    if (!token) return;
    const todo = items.filter((x) => x.status === "vybrana" && x.hit);
    for (const x of todo) await setBuyerMatchStatus({ data: { token, requestId: r.id, mkey: x.mkey, status: "poslana" } });
    setMarked(`${todo.length} položiek označených ako poslané klientovi.`);
  }
  const today = new Date().toLocaleDateString("sk-SK");
  return (
    <div className="mx-auto max-w-[900px] space-y-5 print:max-w-none">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to="/kupci" className="text-sm text-muted hover:text-fg">← Kupci a dopyt</Link>
        <div className="flex items-center gap-2">
          {marked ? <span className="text-xs text-green">{marked}</span> : null}
          <button onClick={() => void markSent()} disabled={!items.some((x) => x.status === "vybrana")} className="rounded-md border border-line px-3 py-1.5 text-sm text-fg hover:border-ink disabled:opacity-40">Označiť ako poslané</button>
          <button onClick={() => window.print()} disabled={!items.length} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-40">🖨️ Tlačiť / uložiť PDF</button>
        </div>
      </div>
      <ShareBox requestId={r.id} />
      <section className="print-doc rounded-xl border border-line bg-paper p-6 text-sm">
        <div className="flex items-start justify-between border-b-2 pb-3" style={{ borderColor: "#333" }}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted">TRI LIPY · ponuka nehnuteľností</div>
            <h1 className="mt-1 text-xl font-bold text-fg">Ponuka pre: {r.label}</h1>
            <div className="text-xs text-muted">
              Hľadá: {PTYPE[r.ptype] ?? r.ptype}
              {r.area_min != null || r.area_max != null ? ` · ${r.area_min ?? ""}–${r.area_max ?? ""} m²` : ""}
              {r.budget_max != null ? ` · do ${eur(r.budget_max)}` : ""}{r.locations ? ` · ${r.locations}` : ""}
            </div>
          </div>
          <div className="text-right text-[11px] text-muted">{today}<br />{items.length} {items.length === 1 ? "položka" : items.length < 5 ? "položky" : "položiek"}</div>
        </div>
        {items.length === 0 ? (
          <p className="mt-4 text-muted">Zatiaľ nie je nič vybrané. V zhodách dopytu nastav pri položkách stav „vybraná do ponuky".</p>
        ) : (
          <ol className="mt-4 space-y-6">
            {items.map((x, i) => {
              const h = x.hit!;
              return (
                <li key={x.mkey} className="break-inside-avoid space-y-2 border-b border-line pb-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-base font-semibold text-fg">{i + 1}. {h.title}</h2>
                    <span className="shrink-0 text-[11px] text-muted">{SRC_SK[h.src] ?? h.src}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {[h.sub, h.areaM2 ? `${Math.round(h.areaM2).toLocaleString("sk-SK")} m²` : null, eur(h.priceEur), h.ppm2 ? `${Math.round(h.ppm2)} €/m²` : null,
                      h.estEur ? `orientačný odhad ~${eur(h.estEur)} (podľa ponúk v okrese)` : null].filter(Boolean).join(" · ")}
                  </div>
                  {h.reasons.length ? <p className="text-xs"><b>Prečo:</b> {h.reasons.join(" · ")}</p> : null}
                  {h.checks.length ? <p className="text-xs"><b>Treba overiť:</b> {h.checks.join(" · ")}</p> : null}
                  {x.note ? <p className="text-xs"><b>Poznámka:</b> {x.note}</p> : null}
                  {h.url ? <p className="text-xs">Inzerát: <a href={h.url} className="break-all text-brand underline">{h.url}</a></p> : null}
                  {h.datasetId && h.lvNo != null && h.src !== "inzerat" ? <LvMapSnapshot datasetId={h.datasetId} lvNo={h.lvNo} hasE={false} /> : null}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-4 text-[10px] text-muted">
          Podklad na rozhodovanie, nie znalecký posudok ani záväzná ponuka. Pozemky z katastra a položky mimo trhu nie sú
          v predaji — vlastníkov oslovujeme až na pokyn klienta. Ceny z inzerátov sú ponukové; odhady sú orientačné.
          Údaje: ÚGKK SR (kataster), verejná inzercia. Stav k {today}.
        </p>
      </section>
    </div>
  );
}

/** Odkaz pre klienta bez prihlásenia (bod 10): vytvoriť, skopírovať, zrušiť; počet otvorení. */
function ShareBox({ requestId }: { requestId: number }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listOfferShares>>["rows"]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => { if (token) listOfferShares({ data: { token, requestId } }).then((r) => setRows(r.rows)).catch(() => {}); };
  useEffect(load, [token, requestId]);
  async function make() {
    if (!token) return;
    const r = await createOfferShare({ data: { token, requestId, days: 14 } });
    if (r.ok && r.path) {
      const url = `${window.location.origin}${r.path}`;
      try { await navigator.clipboard.writeText(url); setMsg(`Odkaz skopírovaný: ${url}`); } catch { setMsg(`Odkaz: ${url}`); }
      load();
    } else setMsg(r.message ?? "Odkaz sa nepodarilo vytvoriť.");
  }
  async function revoke(share: string) { if (token) { await revokeOfferShare({ data: { token, share } }); load(); } }
  const live = rows.filter((x) => !x.revoked);
  return (
    <div className="no-print rounded-lg border border-line bg-paper p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted">Odkaz pre klienta bez prihlásenia — vidí len položky ponuky, bez mien. Platí 14 dní.</span>
        <button onClick={() => void make()} className="rounded-md border border-line px-3 py-1 text-fg hover:border-ink max-md:py-2">Vytvoriť a skopírovať odkaz</button>
      </div>
      {msg ? <p className="mt-1 break-all text-green">{msg}</p> : null}
      {live.length ? (
        <ul className="mt-1 divide-y divide-line/60">
          {live.map((x) => (
            <li key={x.token} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="break-all text-muted">/p/{x.token.slice(0, 8)}… · platí do {x.expiresAt.slice(0, 10).split("-").reverse().join(". ")} · otvorené {x.views}×{x.lastView ? ` (naposledy ${x.lastView.slice(0, 16)})` : ""}</span>
              <button onClick={() => void revoke(x.token)} className="text-muted hover:text-fg">Zrušiť</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
