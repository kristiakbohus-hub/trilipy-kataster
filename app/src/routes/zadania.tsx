import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth-context";
import {
  BRIEF_DESTS, createSearchBrief, getDatasets, listSearchBriefs, setSearchBriefState, type SearchBrief,
} from "../lib/api/kataster.functions";
import { ACCESS_DEST, BRIEF_PURPOSE_SK as PURPOSE_SK, BRIEF_STATUS, plural } from "../lib/domain";
import { Card, SectionHeader } from "../components/kit";

// ZADANIA HĽADANIA POZEMKOV (OI-07/OI-08). Rozhodnutie vlastníka 2026-11-11: požiadavky zadáva vlastník
// pri KAŽDOM hľadaní (žiadna pevná retail šablóna). Zadanie sa uloží, Mac engine ho spracuje a výsledok
// je na /zadanie/$id. Zadanie sa po uložení nemení — úprava = kópia do nového zadania.
// BEZ `loader` (pamäť cf_app_ssr_loader_leak) — dáta až po prihlásení v useEffect.
export const Route = createFileRoute("/zadania")({
  head: () => ({ meta: [{ title: "Zadania hľadania — TRI LIPY KATASTER CORE" }] }),
  validateSearch: (s: Record<string, unknown>): { copy?: number } => {
    const n = Number(s.copy);
    return Number.isInteger(n) && n > 0 ? { copy: n } : {};
  },
  component: ZadaniaPage,
});


type AccessRow = { dest: string; profile: "car" | "foot"; minutes: string };
type Form = {
  title: string; client: string; purpose: "retail" | "residential" | "industrial"; kus: string[];
  areaMin: string; areaMax: string; access: AccessRow[]; maxSlope: string;
  excludePpf: boolean; requireFrontage: boolean; otherReq: string;
};
const EMPTY: Form = {
  title: "", client: "", purpose: "retail", kus: [], areaMin: "", areaMax: "", access: [], maxSlope: "",
  excludePpf: false, requireFrontage: false, otherReq: "",
};
const num = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return s.trim() === "" || !Number.isFinite(n) ? undefined : n; };
const m2 = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} m²`;
const okresOf = (region: string | null | undefined) => {
  const m = String(region ?? "").match(/okres\s+([^·,]+)/i);
  return m ? m[1].trim() : "iné";
};

function fromBrief(b: SearchBrief): Form {
  let kus: string[] = []; let acc: { dest: string; profile: "car" | "foot"; limit_s: number }[] = [];
  try { kus = JSON.parse(b.kus_json) as string[]; } catch { /* nič */ }
  try { acc = b.access_json ? JSON.parse(b.access_json) : []; } catch { /* nič */ }
  return {
    title: `${b.title} (kópia)`, client: b.client ?? "", purpose: b.purpose as Form["purpose"], kus,
    areaMin: String(b.area_min), areaMax: String(b.area_max),
    access: acc.map((a) => ({ dest: a.dest, profile: a.profile, minutes: String(Math.round(a.limit_s / 60)) })),
    maxSlope: b.max_slope == null ? "" : String(b.max_slope), excludePpf: !!b.exclude_ppf,
    requireFrontage: !!b.require_frontage, otherReq: b.other_req ?? "",
  };
}

function ZadaniaPage() {
  const { token } = useAuth();
  const { copy } = Route.useSearch();
  const navigate = useNavigate();
  const [briefs, setBriefs] = useState<SearchBrief[]>([]);
  const [access, setAccess] = useState(true);
  const [datasets, setDatasets] = useState<{ ku_code: string; ku_name: string; region: string }[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    listSearchBriefs({ data: { token } }).then((r) => { setAccess(r.access); setBriefs(r.briefs); }).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getDatasets().then((d) => setDatasets(d as never)).catch(() => {}); }, []);
  // kým niečo čaká alebo beží, obnovuj stav
  useEffect(() => {
    if (!briefs.some((b) => b.status === "pending" || b.status === "running")) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [briefs, load]);
  // „Kopírovať do nového zadania" z detailu
  useEffect(() => {
    if (!copy) return;
    const b = briefs.find((x) => x.id === copy);
    if (b) { setForm(fromBrief(b)); setShowForm(true); }
  }, [copy, briefs]);

  const byOkres = useMemo(() => {
    const m = new Map<string, { ku_code: string; ku_name: string }[]>();
    for (const d of datasets) {
      const k = okresOf(d.region);
      if (!m.has(k)) m.set(k, []);
      if (!m.get(k)!.some((x) => x.ku_code === d.ku_code)) m.get(k)!.push({ ku_code: d.ku_code, ku_name: d.ku_name });
    }
    for (const v of m.values()) v.sort((a, b) => a.ku_name.localeCompare(b.ku_name, "sk"));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "sk"));
  }, [datasets]);
  const kuName = useMemo(() => Object.fromEntries(datasets.map((d) => [d.ku_code, d.ku_name])), [datasets]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleKu = (k: string) => set("kus", form.kus.includes(k) ? form.kus.filter((x) => x !== k) : [...form.kus, k]);
  const toggleOkres = (list: { ku_code: string }[]) => {
    const codes = list.map((x) => x.ku_code);
    const all = codes.every((c) => form.kus.includes(c));
    set("kus", all ? form.kus.filter((k) => !codes.includes(k)) : [...new Set([...form.kus, ...codes])]);
  };

  async function save() {
    if (!token) return;
    setMsg(null);
    const areaMin = num(form.areaMin), areaMax = num(form.areaMax);
    if (!form.title.trim()) return setMsg("Doplň názov zadania.");
    if (!form.kus.length) return setMsg("Vyber aspoň jedno katastrálne územie (okolie).");
    if (areaMin == null || areaMax == null) return setMsg("Doplň výmeru celku od – do.");
    const acc: { dest: (typeof BRIEF_DESTS)[number]; profile: "car" | "foot"; limitS: number }[] = [];
    for (const a of form.access) {
      const min = num(a.minutes);
      if (min == null || min < 1 || min > 60) return setMsg("Dostupnosť: zadaj čas 1–60 minút.");
      acc.push({ dest: a.dest as (typeof BRIEF_DESTS)[number], profile: a.profile, limitS: Math.round(min * 60) });
    }
    setBusy(true);
    try {
      const r = await createSearchBrief({ data: {
        token, title: form.title.trim(), client: form.client.trim() || undefined, purpose: form.purpose, kus: form.kus,
        areaMin: Math.round(areaMin), areaMax: Math.round(areaMax), access: acc,
        maxSlope: num(form.maxSlope) ?? null, excludePpf: form.excludePpf, requireFrontage: form.requireFrontage,
        otherReq: form.otherReq.trim() || undefined,
      } });
      if (!r.ok || !r.id) { setMsg(r.message ?? "Zadanie sa nepodarilo uložiť."); return; }
      setForm(EMPTY); setShowForm(false);
      void navigate({ to: "/zadanie/$id", params: { id: String(r.id) } });
    } catch {
      setMsg("Zadanie sa nepodarilo uložiť — skontroluj hodnoty (výmera 100 – 1 000 000 m², svah 0–60 %).");
    } finally { setBusy(false); }
  }

  async function act(id: number, action: "cancel" | "rerun") {
    if (!token) return;
    const r = await setSearchBriefState({ data: { token, id, action } }).catch(() => ({ ok: false, message: "Nepodarilo sa." }));
    if (!r.ok) setMsg(r.message ?? "Nepodarilo sa.");
    load();
  }

  const inp = "mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-fg";

  if (!access) return <Card className="p-6 text-sm text-muted">Zadania hľadania sú dostupné po prihlásení.</Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Zadania hľadania</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Hľadanie pozemkov podľa konkrétnych požiadaviek — napríklad pre supermarket: okolie, výmera,
            dojazd, svah, prístup z cesty. Zadanie sa uloží a engine na Macu ho prejde nad všetkými
            vybranými katastrami; výsledok sa ukáže pri zadaní.
          </p>
        </div>
        {!showForm ? (
          <button onClick={() => { setForm(EMPTY); setShowForm(true); setMsg(null); }}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream">Nové zadanie</button>
        ) : null}
      </div>

      {showForm ? (
        <Card className="space-y-4 p-4">
          <SectionHeader title="Nové zadanie" hint="Po uložení sa zadanie nemení; úprava = kópia do nového zadania (staré výsledky ostanú platné)." />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted sm:col-span-2">Názov zadania
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="napr. Supermarket — okolie Ružomberka" className={inp} />
            </label>
            <label className="text-xs text-muted">Pre koho (voliteľné)
              <input value={form.client} onChange={(e) => set("client", e.target.value)} className={inp} />
            </label>
            <label className="text-xs text-muted">Účel
              <select value={form.purpose} onChange={(e) => set("purpose", e.target.value as Form["purpose"])} className={inp}>
                {Object.entries(PURPOSE_SK).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">Výmera celku od (m²)
              <input inputMode="numeric" value={form.areaMin} onChange={(e) => set("areaMin", e.target.value)} className={inp} />
            </label>
            <label className="text-xs text-muted">Výmera celku do (m²)
              <input inputMode="numeric" value={form.areaMax} onChange={(e) => set("areaMax", e.target.value)} className={inp} />
            </label>
          </div>

          <div>
            <div className="text-xs text-muted">Okolie — katastrálne územia ({form.kus.length} vybraných)</div>
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              {byOkres.map(([okres, list]) => (
                <div key={okres} className="rounded-md border border-line p-2">
                  <button type="button" onClick={() => toggleOkres(list)} className="text-xs font-medium text-fg hover:underline">
                    okres {okres} · {list.every((x) => form.kus.includes(x.ku_code)) ? "zrušiť všetky" : "vybrať všetky"}
                  </button>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {list.map((k) => (
                      <button key={k.ku_code} type="button" onClick={() => toggleKu(k.ku_code)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${form.kus.includes(k.ku_code) ? "border-ink bg-ink text-cream" : "border-line text-fg hover:bg-surface-2"}`}>
                        {k.ku_name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs text-muted">
              Dostupnosť (voliteľné, najviac 4)
              {form.access.length < 4 ? (
                <button type="button" onClick={() => set("access", [...form.access, { dest: "center", profile: "car", minutes: "10" }])}
                  className="rounded border border-line px-2 py-0.5 text-[11px] text-fg hover:bg-surface-2">+ pridať</button>
              ) : null}
            </div>
            <div className="mt-1 space-y-1">
              {form.access.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <select value={a.dest} onChange={(e) => set("access", form.access.map((x, j) => j === i ? { ...x, dest: e.target.value } : x))}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg">
                    {BRIEF_DESTS.map((d) => <option key={d} value={d}>{ACCESS_DEST[d] ?? d}</option>)}
                  </select>
                  <select value={a.profile} onChange={(e) => set("access", form.access.map((x, j) => j === i ? { ...x, profile: e.target.value as "car" | "foot" } : x))}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg">
                    <option value="car">autom</option><option value="foot">pešo</option>
                  </select>
                  <span className="text-xs text-muted">najviac</span>
                  <input inputMode="numeric" value={a.minutes} onChange={(e) => set("access", form.access.map((x, j) => j === i ? { ...x, minutes: e.target.value } : x))}
                    className="w-16 rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg" />
                  <span className="text-xs text-muted">min</span>
                  <button type="button" onClick={() => set("access", form.access.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-fg">odstrániť</button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* Engine má prahy podľa účelu (mäkký → na preskúmanie / tvrdý → vylúčené); zadanie ich vie len sprísniť. */}
            <label className="text-xs text-muted">Max. svah (%) — len prísnejší než engine
              <input inputMode="decimal" value={form.maxSlope} onChange={(e) => set("maxSlope", e.target.value)}
                placeholder={form.purpose === "residential" ? "engine: 15 % / 30 %" : "engine: 8 % / 15 %"} className={inp} />
            </label>
            <label className="flex items-center gap-2 text-sm text-fg sm:pt-5">
              <input type="checkbox" checked={form.excludePpf} onChange={(e) => set("excludePpf", e.target.checked)} />
              Vylúčiť poľnohospodársku pôdu (PPF)
            </label>
            <label className="flex items-center gap-2 text-sm text-fg sm:pt-5">
              <input type="checkbox" checked={form.requireFrontage} onChange={(e) => set("requireFrontage", e.target.checked)} />
              Vyžadovať priamy prístup z cesty
            </label>
          </div>
          <label className="block text-xs text-muted">Ďalšie požiadavky — parkovanie, zásobovanie, viditeľnosť… (uložia sa k zadaniu, automaticky sa NEoverujú)
            <textarea value={form.otherReq} onChange={(e) => set("otherReq", e.target.value)} rows={3} className={inp} />
          </label>

          <p className="rounded-md border border-line bg-surface-2/50 px-3 py-2 text-xs leading-relaxed text-muted">
            Engine vždy vyradí: záplavové územie Q100, aktívne zosuvy, skládky, pozemky zastavané veľkou
            budovou, roztiahnuté tvary a funkčné využitie z územného plánu, ktoré účel nepripúšťa. Právny
            prístup (vjazd po verejnom pozemku alebo vecné bremeno) neoveruje — pri každom výsledku bude
            „overiť vjazd“. Pri veľkom okolí môže beh trvať desiatky minút.
          </p>

          {msg ? <p className="text-sm" style={{ color: "#9b3b2f" }}>{msg}</p> : null}
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-50">
              {busy ? "Ukladám…" : "Uložiť a spustiť hľadanie"}
            </button>
            <button onClick={() => { setShowForm(false); setMsg(null); }} className="rounded-md border border-line px-3 py-1.5 text-sm text-fg">Zrušiť</button>
          </div>
        </Card>
      ) : msg ? <p className="text-sm" style={{ color: "#9b3b2f" }}>{msg}</p> : null}

      <div>
        <SectionHeader title={`Zadania (${briefs.length})`} hint="Najnovšie hore. Stav sa obnovuje sám, kým niečo beží." />
        {briefs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">Zatiaľ žiadne zadanie. Začni tlačidlom „Nové zadanie“.</Card>
        ) : (
          <div className="space-y-2">
            {briefs.map((b) => {
              const st = BRIEF_STATUS[b.status] ?? { label: b.status, color: "#6b6b6b" };
              let kus: string[] = [];
              try { kus = JSON.parse(b.kus_json) as string[]; } catch { /* nič */ }
              return (
                <Card key={b.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <Link to="/zadanie/$id" params={{ id: String(b.id) }} className="text-sm font-semibold text-fg hover:underline">
                      #{b.id} {b.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {PURPOSE_SK[b.purpose] ?? b.purpose} · {m2(b.area_min)}–{m2(b.area_max)} ·{" "}
                      {kus.length === 1 ? (kuName[kus[0]] ?? kus[0]) : plural(kus.length, "katastrálne územie", "katastrálne územia", "katastrálnych území")}
                      {b.client ? ` · pre ${b.client}` : ""} · {b.author ?? "—"}, {b.created_at.slice(0, 10)}
                    </div>
                  </div>
                  <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: st.color + "55", color: st.color }}>
                    {st.label}{b.status === "running" && b.progress ? ` · ${b.progress}` : ""}
                  </span>
                  {b.status === "done" ? (
                    <span className="text-xs tabular-nums text-fg">{b.n_match ?? 0} zhôd · {b.n_prov ?? 0} na preskúmanie</span>
                  ) : null}
                  <div className="flex gap-2 text-xs">
                    <Link to="/zadania" search={{ copy: b.id }} className="text-muted hover:text-fg">kopírovať</Link>
                    {b.status === "pending" ? <button onClick={() => void act(b.id, "cancel")} className="text-muted hover:text-fg">zrušiť</button> : null}
                    {b.status === "failed" || b.status === "cancelled" ? <button onClick={() => void act(b.id, "rerun")} className="text-muted hover:text-fg">spustiť znova</button> : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
