// OBHLIADKA V TERÉNE (2026-11-13) — kontrolný zoznam do mobilu: odpovede (v poriadku / pozor / problém / neviem) +
// poznámky + fotky. Fotky sa uložia ako dokumenty (druh „foto") k LV, zápis obhliadky ako komentár — obe sa objavia
// v liste nehnuteľnosti (fotky aj v klientskej verzii, ak ich maklér pridá). BEZ `loader` (dáta až po prihlásení).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { addComment, getDeclaration, saveDeclaration, uploadDocument } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { useRole } from "../lib/role-context";

type Search = { ds?: string; lv?: string; p?: string };
export const Route = createFileRoute("/obhliadka")({
  head: () => ({ meta: [{ title: "Obhliadka — TRI LIPY" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ds: typeof s.ds === "string" ? s.ds : undefined,
    lv: typeof s.lv === "string" || typeof s.lv === "number" ? String(s.lv) : undefined,
    p: typeof s.p === "string" || typeof s.p === "number" ? String(s.p) : undefined,
  }),
  component: InspectionPage,
});

const GROUPS: [string, string[]][] = [
  ["Prístup a okolie", ["Príjazd autom (šírka, povrch, zima)", "Vjazd na pozemok a parkovanie", "Hluk (cesta, železnica, prevádzky)", "Zápach, prach, susedné prevádzky", "Výhľad a tienenie od susedov"]],
  ["Pozemok", ["Hranice v teréne (kolíky, ploty) sedia s mapou", "Svah, terasy, oporné múry", "Mokré miesta, stojatá voda, pramene", "Stromy, porasty, oplotenie", "Odpad, navážky, staré základy"]],
  ["Siete", ["Elektrina (stĺp, skriňa, trafostanica)", "Voda (šachta, studňa)", "Kanalizácia (šachta, žumpa, ČOV)", "Plyn (HUP, skrinka)", "Signál mobilu / internet"]],
  ["Stavba", ["Strecha a klampiarske prvky", "Statika — praskliny v murive", "Vlhkosť, pleseň, zatekanie", "Okná a dvere", "Kúrenie a zdroj tepla", "Elektroinštalácia a rozvádzač", "Rozsah rekonštrukcie (odhad)"]],
  ["Právne a dohoda", ["Kto je na obhliadke (vlastník / splnomocnenec)", "Užívanie tretími osobami (nájomca, sused)", "Dôvod predaja a časový rámec", "Cenová predstava predávajúceho"]],
];
const OPTS: [string, string][] = [["ok", "v poriadku"], ["pozor", "pozor"], ["problem", "problém"], ["?", "neviem"]];

function InspectionPage() {
  const s = Route.useSearch();
  const { token } = useAuth();
  const { role } = useRole();
  const [ans, setAns] = useState<Record<string, { v?: string; n?: string }>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa.</div>;
  if (!s.ds || !s.lv) return <div className="p-6 text-sm text-muted">Obhliadka sa otvára z listu nehnuteľnosti. <Link to="/nehnutelnost" className="text-brand underline">List nehnuteľnosti</Link></div>;
  const set = (k: string, p: { v?: string; n?: string }) => setAns((a) => ({ ...a, [k]: { ...a[k], ...p } }));
  async function save() {
    if (!token || !s.ds || !s.lv) return;
    setBusy(true); setMsg(null);
    try {
      let up = 0;
      for (const f of files.slice(0, 12)) {
        const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
        const r = await uploadDocument({ data: { datasetId: s.ds, subjectType: "lv", subjectRef: s.lv, name: `Obhliadka ${new Date().toLocaleDateString("sk-SK")} — ${f.name}`.slice(0, 200), kind: "foto", mime: f.type || "image/jpeg", sizeBytes: f.size, dataBase64: b64, role, token } });
        if (r.ok) up++;
      }
      const lines = GROUPS.flatMap(([g, items]) => items.map((it) => { const a = ans[`${g}|${it}`]; return a?.v || a?.n ? `• ${it}: ${OPTS.find((o) => o[0] === a.v)?.[1] ?? "—"}${a.n ? ` — ${a.n}` : ""}` : null; }).filter(Boolean));
      const body = `OBHLIADKA ${new Date().toLocaleDateString("sk-SK")}${s.p ? ` (parcela ${s.p})` : ""}\n${lines.join("\n") || "bez poznámok"}${up ? `\nFotky: ${up}` : ""}`;
      const c = await addComment({ data: { token, subjectType: "lv", subjectId: `${s.ds}:${s.lv}`, body: body.slice(0, 4000) } });
      // technický stav → údaje od predávajúceho (štruktúrovane, 1–3), zlúčené s existujúcimi
      const MAP: Record<string, string> = { "Strecha a klampiarske prvky": "tech_strecha", "Statika — praskliny v murive": "tech_statika", "Vlhkosť, pleseň, zatekanie": "tech_vlhkost", "Okná a dvere": "tech_okna", "Kúrenie a zdroj tepla": "tech_kurenie", "Elektroinštalácia a rozvádzač": "tech_elektro" };
      const VAL: Record<string, string> = { ok: "1 — bez vád", pozor: "2 — opravy v budúcnosti", problem: "3 — vážne / naliehavé", "?": "neprezerané" };
      const tech: Record<string, string> = {};
      for (const [it, key] of Object.entries(MAP)) { const a = ans[`Stavba|${it}`]; if (a?.v) tech[key] = VAL[a.v]; }
      if (Object.keys(tech).length) {
        const prev = await getDeclaration({ data: { token, datasetId: s.ds, subjectType: "lv", subjectRef: s.lv } }).catch(() => null);
        let base: Record<string, string | number | boolean | null> = {};
        try { base = prev?.decl ? (JSON.parse(prev.decl) as Record<string, string | number | boolean | null>) : {}; } catch { base = {}; }
        await saveDeclaration({ data: { token, datasetId: s.ds, subjectType: "lv", subjectRef: s.lv, decl: { ...base, ...tech, obhliadka_datum: new Date().toLocaleDateString("sk-SK") } } }).catch(() => null);
      }
      setMsg(c.ok ? `Uložené: zápis obhliadky${up ? ` a ${up} fotiek` : ""}. Nájdete ich v liste nehnuteľnosti (Signály a práca).` : c.message ?? "Uloženie zlyhalo.");
    } catch { setMsg("Uloženie zlyhalo — skúste znova."); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-xl space-y-4 px-3 py-4 text-sm">
      <h1 className="text-lg font-semibold">Obhliadka — LV {s.lv}{s.p ? `, parcela ${s.p}` : ""}</h1>
      {GROUPS.map(([g, items]) => (
        <section key={g} className="space-y-2 rounded-lg border border-line p-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</h2>
          {items.map((it) => { const k = `${g}|${it}`; const a = ans[k] ?? {}; return (
            <div key={k} className="space-y-1 border-b border-line/50 pb-2">
              <div>{it}</div>
              <div className="flex flex-wrap gap-1">{OPTS.map(([v, l]) => <button key={v} type="button" onClick={() => set(k, { v })} className={`rounded-full border px-2.5 py-1 text-xs ${a.v === v ? "border-ink bg-ink text-cream" : "border-line"}`}>{l}</button>)}</div>
              <input className="w-full rounded border border-line bg-surface px-2 py-1 text-xs" placeholder="poznámka" value={a.n ?? ""} onChange={(e) => set(k, { n: e.target.value })} />
            </div>
          ); })}
        </section>
      ))}
      <section className="space-y-2 rounded-lg border border-line p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Fotky</h2>
        <p className="text-xs text-muted">Fotografujte bez ľudí a čitateľných EČV áut (osobné údaje); ideálne denné svetlo, všetky miestnosti, pozemok z rohov a príjazd.</p>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        {files.length ? <div className="text-xs text-muted">{files.length} fotiek pripravených (max 12)</div> : null}
      </section>
      <button onClick={() => void save()} disabled={busy} className="w-full rounded-md bg-ink px-3 py-2 font-medium text-cream disabled:opacity-50">{busy ? "Ukladám…" : "Uložiť obhliadku"}</button>
      {msg ? <p className="text-xs text-muted">{msg}</p> : null}
      <Link to="/nehnutelnost" search={s.p ? { ds: s.ds, p: s.p } : { ds: s.ds, lv: s.lv }} className="block text-center text-xs text-brand underline">Späť na list nehnuteľnosti</Link>
    </div>
  );
}
