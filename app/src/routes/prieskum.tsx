import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { nlQuery } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/prieskum")({
  head: () => ({ meta: [{ title: "NL prieskum — TRI LIPY KATASTER CORE" }] }),
  component: PrieskumPage,
});

type Res = Awaited<ReturnType<typeof nlQuery>>;

const EXAMPLES = [
  "absentér nevysporiadané 5 spoluvlastníkov",
  "SPF štát stavebný potenciál",
  "dedičské bez tiarch nad 5000",
  "Novák",
  "pozemok Čadca do 30000",
  "byt Žilina predaj",
];

const eur = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €");
const ppm = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK", { maximumFractionDigits: 0 }) + " €/m²");

function PrieskumPage() {
  const { role } = useRole();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"score" | "area" | "owners">("score");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(query = q, s = sort) {
    if (!query.trim()) return;
    setBusy(true);
    try { setRes(await nlQuery({ data: { query: query.trim(), role, sort: s } })); }
    finally { setBusy(false); }
  }

  const empty = res && res.lv.count === 0 && res.owners.count === 0 && res.market.count === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">NL prieskum katastra</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Jeden písateľný dopyt <b>naprieč všetkými dátami</b> — signály LV (nevysporiadané, SPF, dedičské,
          stavebný potenciál, spoluvlastníci, výmera), <b>vlastníci</b> naprieč k.ú. aj <b>trhové inzeráty</b>.
          Systém sám rozpozná zámer: kľúčové slová → LV skóre; meno s veľkým písmenom / IČO → vlastník;
          „predaj / byt / pozemok / do 30000" → trh. Skóre je pracovný indikátor príležitosti, nie právny záver.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            placeholder="napr. absentér nevysporiadané 5 spoluvlastníkov · Novák · pozemok Čadca do 30000…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand"
          />
          <select
            value={sort}
            onChange={(e) => { const v = e.target.value as "score" | "area" | "owners"; setSort(v); void run(q, v); }}
            title="Zoradenie sekcie LV"
            className="rounded-lg border border-line bg-paper px-2 py-2 text-sm text-fg outline-none focus:border-brand"
          >
            <option value="score">LV: skóre</option>
            <option value="area">LV: výmera</option>
            <option value="owners">LV: spoluvlastníci</option>
          </select>
          <button onClick={() => void run()} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {busy ? "…" : "Hľadať"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setQ(ex); void run(ex); }} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:border-ink hover:text-fg">
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {empty ? (
        <Card className="p-4"><div className="py-6 text-center text-sm text-muted">Žiadne výsledky. Skús iné kľúčové slová, meno vlastníka (s veľkým písmenom) alebo trhový dopyt.</div></Card>
      ) : null}

      {/* ——— LV signály ——— */}
      {res && res.lv.count > 0 ? (
        <Card className="p-4">
          <SectionHeader title={`Listy vlastníctva — signály (${res.lv.count})`} hint={res.lv.count > 80 ? "top 80 podľa zoradenia" : undefined} />
          <div className="mt-2 divide-y divide-line">
            {res.lv.results.map((r) => (
              <div key={`${r.dataset_id}-${r.lv_no}`} className="flex items-center gap-3 py-2">
                <div className="w-10 shrink-0 text-center"><div className="text-lg font-bold tabular-nums text-fg">{r.score}</div></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">LV {r.lv_no} · {r.ku_name}</div>
                  <div className="truncate text-[12px] text-muted">
                    {r.reasons.join(" · ") || "—"} · {r.co_owners} vlastníkov · {r.total_area.toLocaleString("sk-SK")} m²
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: r.dataset_id, lvNo: String(r.lv_no) }} search={{ typ: "vypis" as const }} className="rounded-md border border-line px-2 py-1 text-fg hover:border-ink">Výpis</Link>
                  <a href={`/mapa?ds=${encodeURIComponent(r.dataset_id)}`} className="rounded-md border border-line px-2 py-1 text-fg hover:border-ink">Mapa</a>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ——— Vlastníci ——— */}
      {res && res.owners.count > 0 ? (
        <Card className="p-4">
          <SectionHeader title={`Vlastníci naprieč k.ú. (${res.owners.count})`} hint="zoskupené podľa identity (meno + dát. nar. / IČO)" />
          <div className="mt-2 divide-y divide-line">
            {res.owners.results.map((g, i) => (
              <div key={`${g.name}-${i}`} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">{g.name}</span>
                  <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">{g.is_company ? "firma" : "osoba"}</span>
                  {g.ico ? <span className="text-[11px] text-muted">IČO {g.ico}</span> : null}
                  {g.birth_date && !g.is_company ? <span className="text-[11px] text-muted">*{String(g.birth_date).slice(0, 4)}</span> : null}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {g.lvCount} LV v {g.kuCount} k.ú. ·{" "}
                  {g.occurrences.slice(0, 6).map((o, j) => (
                    <Link key={j} to="/vypis/$datasetId/$lvNo" params={{ datasetId: o.dataset_id, lvNo: String(o.lv_no) }} search={{ typ: "vypis" as const }} className="mr-1 underline decoration-line hover:text-fg">
                      {o.ku_name} LV{o.lv_no}
                    </Link>
                  ))}
                  {g.occurrences.length > 6 ? <span>+{g.occurrences.length - 6}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {res && res.owners.access !== "full" && res.owners.count === 0 && /[A-ZÁ-Ž]/.test(q) ? (
        <Card className="p-3"><div className="text-[12px] text-muted">Vlastníci: tvoja rola nemá plný prístup k owner detailu — sekcia je skrytá.</div></Card>
      ) : null}

      {/* ——— Trhové inzeráty ——— */}
      {res && res.market.count > 0 ? (
        <Card className="p-4">
          <SectionHeader title={`Trhové inzeráty (${res.market.count})`} hint="verejná inzercia, zoradené od najlacnejších €/m²" />
          <div className="mt-2 divide-y divide-line">
            {res.market.results.map((m, i) => (
              <div key={`${m.source}-${m.ext_id}-${i}`} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">{m.title || "—"}</div>
                  <div className="truncate text-[12px] text-muted">
                    {[m.ptype, m.deal, m.obec || m.okres].filter(Boolean).join(" · ")}
                    {m.area_m2 ? ` · ${m.area_m2.toLocaleString("sk-SK")} m²` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-fg">{eur(m.price_eur)}</div>
                  <div className="text-[11px] tabular-nums text-muted">{ppm(m.ppm2)}</div>
                </div>
                {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-fg hover:border-ink">Inzerát</a> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
