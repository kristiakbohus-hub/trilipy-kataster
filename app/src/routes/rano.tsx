import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMorningBriefing } from "../lib/api/kataster.functions";
import { Badge, Card, Icon, Stat } from "../components/kit";

type Brief = Awaited<ReturnType<typeof getMorningBriefing>>;
const eur = (n: number | null) => (n == null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €");

export const Route = createFileRoute("/rano")({
  head: () => ({ meta: [{ title: "Dobré ráno — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getMorningBriefing({ data: { limit: 15 } }).catch((): Brief => ({ today: null, summary: { newToday: 0, drops: 0, upDeals: 0, privateOpps: 0 }, listings: [], gone: [], up: [], okresy: [], ptypes: [], parsed: { ptype: null, okres: null, maxPrice: null, keywords: [] } })),
  component: RanoPage,
});

function RanoPage() {
  const initial = Route.useLoaderData();
  const [b, setB] = useState<Brief>(initial);
  const [okres, setOkres] = useState("");
  const [ptype, setPtype] = useState("");
  const [onlyPrivate, setOnlyPrivate] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [promptApplied, setPromptApplied] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true; setBusy(true);
    getMorningBriefing({ data: { okres: okres || undefined, ptype: ptype || undefined, onlyPrivate, prompt: promptApplied || undefined, limit: 15 } })
      .then((r) => { if (alive) { setB(r); setBusy(false); } })
      .catch(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [okres, ptype, onlyPrivate, promptApplied]);
  const pz = b.parsed;
  const parsedTxt = pz ? [pz.ptype, pz.okres, pz.maxPrice ? `do ${pz.maxPrice.toLocaleString("sk-SK")} €` : null, ...(pz.keywords ?? [])].filter(Boolean).join(" · ") : "";

  const dnes = b.today ? new Date(b.today).toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" }) : "";
  const greet = (() => { const h = new Date().getHours(); return h < 10 ? "Dobré ráno" : h < 18 ? "Dobrý deň" : "Dobrý večer"; })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">{greet} 👋</h1>
        <p className="mt-1 text-sm text-muted">Dnes {dnes} — čo je dôležité, koho zavolať, kde je príležitosť. Všetko na jednom mieste.</p>
      </div>

      {/* Dnes dôležité — súhrn */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Nové inzeráty dnes" value={String(b.summary.newToday)} />
        <Stat label="Cenové poklesy" value={String(b.summary.drops)} />
        <Stat label="Súkromné príležitosti" value={String(b.summary.privateOpps)} />
        <Stat label="Naše ÚP deals (MATCH)" value={String(b.summary.upDeals)} />
      </div>

      {/* Free-text prompt — „dnes hľadám…" */}
      <form onSubmit={(e) => { e.preventDefault(); setPromptApplied(prompt.trim()); }} className="rounded-lg border border-line bg-surface/60 p-3">
        <div className="flex gap-2">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="napr. hľadám chatu do 30k v Kysuciach s výhľadom…"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted" />
          <button type="submit" className="shrink-0 rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream">Hľadať</button>
          {promptApplied ? <button type="button" onClick={() => { setPrompt(""); setPromptApplied(""); }} className="shrink-0 rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-fg" aria-label="Vyčistiť">×</button> : null}
        </div>
        {promptApplied ? (
          <div className="mt-1.5 text-[12px] text-muted">
            {parsedTxt ? <>Rozumiem: <span className="font-medium text-fg">{parsedTxt}</span></> : "Nerozpoznal som konkrétne parametre — skús napr.: chata do 30000 v okrese Čadca s výhľadom."}
          </div>
        ) : null}
      </form>

      {/* Nastaviteľné podľa lokality + typu */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/60 p-3">
        <span className="text-[11px] uppercase tracking-wide text-muted">Hľadám</span>
        <select value={ptype} onChange={(e) => setPtype(e.target.value)} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg">
          <option value="">— akýkoľvek typ —</option>
          {b.ptypes.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="text-[11px] uppercase tracking-wide text-muted">v okrese</span>
        <select value={okres} onChange={(e) => setOkres(e.target.value)} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg">
          <option value="">— celé SR —</option>
          {b.okresy.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="ml-1 flex items-center gap-1.5 text-sm text-fg">
          <input type="checkbox" checked={onlyPrivate} onChange={(e) => setOnlyPrivate(e.target.checked)} />
          len súkromná inzercia
        </label>
        {busy ? <span className="text-xs text-muted">načítavam…</span> : null}
      </div>

      {/* Scorovaná (súkromná) inzercia dňa — koho zavolať */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <Icon name="target" />
          <h2 className="text-sm font-bold text-fg">Inzercia dňa — koho zavolať {onlyPrivate ? "(súkromní predajcovia)" : ""}</h2>
        </div>
        {b.listings.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">Pre zvolený filter dnes žiadne scorované príležitosti.</p>
        ) : (
          <div className="divide-y divide-line">
            {b.listings.map((l, i) => (
              <div key={`${l.url}-${i}`} className="flex items-start gap-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: l.score >= 40 ? "#1E7A3E" : l.score >= 20 ? "#B8860B" : "#6b7280" }}>{l.score}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-fg">{l.title ?? "—"}</span>
                    {l.privatny ? <Badge color="#1E7A3E">súkromný</Badge> : <Badge color="#6b7280">agentúra</Badge>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {l.obec ?? l.okres ?? ""}{l.area_m2 ? ` · ${l.area_m2.toLocaleString("sk-SK")} m²` : ""} · {eur(l.price_eur)}{l.price_per_m2 ? ` (${Math.round(l.price_per_m2)} €/m²)` : ""}
                    {l.price_drop_pct ? ` · ▼ ${Math.round(l.price_drop_pct)} %` : ""}{l.below_market_pct ? ` · pod trhom ${Math.round(l.below_market_pct)} %` : ""}{l.days_on_market ? ` · ${l.days_on_market} dní` : ""}
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium text-fg/80">→ {l.step}</div>
                </div>
                {l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-fg hover:border-ink">Inzerát ↗</a> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Naše ÚP-development príležitosti */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <Icon name="zone" />
          <h2 className="text-sm font-bold text-fg">Naše ÚP-development príležitosti (overené)</h2>
        </div>
        {b.up.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">Pre zvolený okres žiadne overené ÚP príležitosti.</p>
        ) : (
          <div className="divide-y divide-line">
            {b.up.map((o, i) => (
              <div key={`${o.kod_ku}-${o.parcels}-${i}`} className="flex items-center gap-3 py-2">
                <div className="text-sm font-bold tabular-nums text-fg">{o.quality ?? "—"}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{o.area_m2 ? `${o.area_m2.toLocaleString("sk-SK")} m²` : ""} · {o.parcels ?? ""} · {o.ku_name ?? o.kod_ku}</div>
                  <div className="text-[12px] text-muted">{o.zone ?? ""}{o.ppf ? " · ⚠ PPF" : ""}{o.market_ppm2 ? ` · trh v obci ~${o.market_ppm2} €/m²${o.area_m2 ? ` (odhad ~${Math.round(o.area_m2 * o.market_ppm2).toLocaleString("sk-SK")} €)` : ""}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Zmizli z trhu (predané/stiahnuté — odhad) — zachovaný snapshot, sold-comps + trhový pulz */}
      {b.gone.length > 0 ? (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Icon name="target" />
            <h2 className="text-sm font-bold text-fg">Zmizli z trhu · posledná cena = odhad predajnej</h2>
          </div>
          <div className="divide-y divide-line">
            {b.gone.map((g, i) => (
              <div key={`${g.url}-${i}`} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-fg">{g.title ?? "—"}</span>
                  {g.privatny ? <Badge color="#1E7A3E">súkromný</Badge> : <Badge color="#6b7280">agentúra</Badge>}
                  <Badge color="#8a6d3b">stiahnutý</Badge>
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {g.obec ?? g.okres ?? ""}{g.area_m2 ? ` · ${g.area_m2.toLocaleString("sk-SK")} m²` : ""} · {eur(g.price_eur)}
                  {g.drop_pct ? ` · ▼ ${Math.round(g.drop_pct)} % z ${eur(g.first_price)}` : ""}
                  {g.days_listed ? ` · ${g.days_listed} dní v ponuke` : ""}
                  {g.removed_at ? ` · zmizol ${new Date(g.removed_at).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" })}` : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="text-[11px] text-muted">Orientačné — inzeráty z verejných portálov (bazos = súkromní, reality = agentúry), skóre = pokles ceny + pod trhom + čas v ponuke. „Zmizli z trhu" = inzerát bol stiahnutý (re-verify), posledná cena je len odhad. ÚP príležitosti z nášho land-search enginu. Nie je to právne ani územnoplánovacie stanovisko.</p>
    </div>
  );
}
