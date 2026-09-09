import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { nlQuery, saveSearch, listSavedSearches, deleteSavedSearch, setSavedAlert, runMyAlerts, type SavedSearchRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";
import { useAuth } from "../lib/auth-context";
import type { Role } from "../lib/domain";

export const Route = createFileRoute("/prieskum")({
  head: () => ({ meta: [{ title: "NL prieskum — TRI LIPY KATASTER CORE" }] }),
  component: PrieskumPage,
});

type Res = Awaited<ReturnType<typeof nlQuery>>;

const EXAMPLES = [
  "absentér nevysporiadané 5 spoluvlastníkov",
  "SPF štát stavebný potenciál",
  "dedičské bez tiarch nad 5000",
  "firmy dedičské",
  "s ťarchami SPF",
  "E-KN nevysporiadané",
  "zahraniční vlastníci dedičské",
  "stavebné bez zosuvu",
  "dedičské do 10 min k diaľnici",
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

  function exportShortlist() {
    if (!res) return;
    const he = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const brand = `<div style="border-bottom:2px solid #1E3A2F;padding-bottom:8px;margin-bottom:14px"><div style="font-size:20px;font-weight:bold;letter-spacing:3px;color:#1E3A2F">TRI LIPY</div><div style="font-size:9px;color:#5C8A6B;letter-spacing:2px">DEAL-SOURCING SHORTLIST</div></div>`;
    let body = brand + `<p style="color:#555;font-family:Georgia,serif">Dopyt: <b>${he(q)}</b> · ${new Date().toLocaleDateString("sk-SK")}</p>`;
    const T = (h: string[]) => `<tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr>`;
    if (res.lv.results.length) {
      body += `<h3 style="font-family:Georgia,serif">Listy vlastníctva — príležitosti (${res.lv.count})</h3>`;
      body += `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">` + T(["Skóre", "k.ú.", "LV", "Spoluvl.", "Výmera", "Signály"]);
      body += res.lv.results.map((r) => `<tr><td>${r.score}</td><td>${he(r.ku_name ?? "")}</td><td>${r.lv_no}</td><td>${r.co_owners}</td><td>${r.total_area.toLocaleString("sk-SK")} m²</td><td>${he(r.reasons.join(", "))}</td></tr>`).join("");
      body += `</table>`;
      if (res.lv.note) body += `<p style="font-size:10px;color:#888">${he(res.lv.note)}</p>`;
    }
    if (res.owners.results.length) {
      body += `<h3 style="font-family:Georgia,serif">Vlastníci (${res.owners.count})</h3><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">` + T(["Meno", "Typ", "Výskyt"]);
      body += res.owners.results.map((g) => `<tr><td>${he(g.name)}${g.ico ? ` (IČO ${he(g.ico)})` : ""}</td><td>${g.is_company ? "firma" : "osoba"}</td><td>${g.lvCount} LV v ${g.kuCount} k.ú.</td></tr>`).join("");
      body += `</table>`;
    }
    if (res.market.results.length) {
      body += `<h3 style="font-family:Georgia,serif">Trhové inzeráty (${res.market.count})</h3><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">` + T(["Titul", "Typ", "Lokalita", "Cena", "€/m²"]);
      body += res.market.results.map((m) => `<tr><td>${he(m.title ?? "")}</td><td>${he(m.ptype ?? "")}</td><td>${he(m.obec ?? m.okres ?? "")}</td><td>${eur(m.price_eur)}</td><td>${ppm(m.ppm2)}</td></tr>`).join("");
      body += `</table>`;
    }
    body += `<p style="font-size:10px;color:#888;margin-top:14px;border-top:1px solid #ccc;padding-top:6px">Interný pracovný podklad TRI LIPY KATASTER CORE · skóre = orientačný indikátor príležitosti, nie právny záver.</p>`;
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#333}</style></head><body>${body}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `shortlist_${Date.now()}.doc`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">NL prieskum katastra</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Jeden písateľný dopyt <b>naprieč všetkými dátami</b> — signály LV (nevysporiadané, SPF, dedičské,
          stavebný potenciál, spoluvlastníci, výmera, <b>ťarchy</b>), post-filtre <b>firemní / zahraniční vlastníci</b> a <b>E-KN/ROEP</b>,
          <b>vlastníci</b> naprieč k.ú. aj <b>trhové inzeráty</b>.
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

      <SavedSearches currentQuery={q} sort={sort} role={role} onRun={(query, srt) => { setQ(query); setSort(srt); void run(query, srt); }} />

      {empty ? (
        <Card className="p-4"><div className="py-6 text-center text-sm text-muted">Žiadne výsledky. Skús iné kľúčové slová, meno vlastníka (s veľkým písmenom) alebo trhový dopyt.</div></Card>
      ) : null}

      {res && !empty ? (
        <div className="flex justify-end">
          <button onClick={exportShortlist} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:border-ink" title="Branded prehľad nájdených LV / vlastníkov / inzerátov (.doc) na tlač / poradu">⬇ Export shortlist (.doc)</button>
        </div>
      ) : null}

      {/* ——— LV signály ——— */}
      {res && res.lv.count > 0 ? (
        <Card className="p-4">
          <SectionHeader title={`Listy vlastníctva — signály (${res.lv.count})`} hint={res.lv.count > 80 ? "top 80 podľa zoradenia" : undefined} />
          {res.lv.note ? <div className="mt-1 rounded-md border border-line bg-surface-2/40 px-2.5 py-1 text-[11px] text-muted">{res.lv.note}</div> : null}
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

function SavedSearches({ currentQuery, sort, role, onRun }: { currentQuery: string; sort: "score" | "area" | "owners"; role: Role; onRun: (query: string, sort: "score" | "area" | "owners") => void }) {
  const { token } = useAuth();
  const [list, setList] = useState<SavedSearchRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { if (token) listSavedSearches({ data: { token } }).then(setList).catch(() => {}); }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!token) return null;

  async function save() {
    if (!currentQuery.trim()) { setMsg("Najprv napíš dopyt."); return; }
    const name = window.prompt("Názov uloženého hľadania:", currentQuery.slice(0, 60));
    if (!name) return;
    const r = await saveSearch({ data: { token: token!, name, query: currentQuery, sort } });
    setMsg(r.ok ? "Uložené." : (r.message ?? "Zlyhalo.")); refresh();
  }
  async function toggle(s: SavedSearchRow) { await setSavedAlert({ data: { token: token!, id: s.id, alert: !s.alert } }); refresh(); }
  async function chan(s: SavedSearchRow, telegram: boolean) { await setSavedAlert({ data: { token: token!, id: s.id, alert: !!s.alert, channels: telegram ? "inapp,telegram" : "inapp" } }); refresh(); }
  async function del(id: number) { await deleteSavedSearch({ data: { token: token!, id } }); refresh(); }
  async function check() { setBusy(true); try { const r = await runMyAlerts({ data: { token: token!, role } }); setMsg(r.ok ? `Skontrolované: ${r.checked} alertov · ${r.newTotal} nových zhôd.` : (r.message ?? "Zlyhalo.")); refresh(); } finally { setBusy(false); } }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title={`Moje uložené hľadania (${list.length})`} hint="alerty in-app + Telegram" />
        <div className="flex gap-2">
          <button onClick={() => void save()} disabled={!currentQuery.trim()} className="rounded-md border border-line px-2.5 py-1 text-xs text-fg hover:border-ink disabled:opacity-50">＋ Uložiť toto hľadanie</button>
          {list.some((s) => s.alert) ? <button onClick={() => void check()} disabled={busy} className="rounded-md bg-ink px-2.5 py-1 text-xs text-cream disabled:opacity-50">{busy ? "…" : "Skontrolovať alerty"}</button> : null}
        </div>
      </div>
      {msg ? <div className="mt-1 text-[11px] text-muted">{msg}</div> : null}
      {list.length ? (
        <div className="mt-2 divide-y divide-line">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
              <button onClick={() => onRun(s.query, ((s.sort as "score" | "area" | "owners") || "score"))} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium text-fg">{s.name}</div>
                <div className="truncate text-[11px] text-muted">{s.query}{s.last_run ? ` · kontrola ${s.last_run.slice(0, 16)}` : ""}</div>
              </button>
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted" title="Sledovať zmeny (alert)">
                <input type="checkbox" checked={!!s.alert} onChange={() => void toggle(s)} className="accent-brand" /> alert
              </label>
              {s.alert ? (
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted" title="Aj cez Telegram (vyžaduje CF secret TG_BOT_TOKEN/TG_CHAT_ID)">
                  <input type="checkbox" checked={s.channels.includes("telegram")} onChange={(e) => void chan(s, e.target.checked)} className="accent-brand" /> TG
                </label>
              ) : null}
              <button onClick={() => void del(s.id)} className="shrink-0 text-[11px] text-muted hover:text-fg" title="Zmazať">✕</button>
            </div>
          ))}
        </div>
      ) : <div className="mt-2 text-[12px] text-muted">Zatiaľ žiadne uložené hľadania. Napíš dopyt a klikni „Uložiť toto hľadanie".</div>}
    </Card>
  );
}
