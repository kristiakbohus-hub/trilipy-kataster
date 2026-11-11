import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { getSearchBrief, setSearchBriefState, type BriefResult, type SearchBrief } from "../lib/api/kataster.functions";
import {
  ACCESS_DEST, BRIEF_PURPOSE_SK, BRIEF_STATUS, decSk, durationSk, kuLabel, m2, parseAccessTimes, plural, reasonSk,
  zoneLabel, zoneUnknown,
} from "../lib/domain";
import { Card, Disclaimer, SectionHeader, Stat } from "../components/kit";

// Detail zadania hľadania: parametre (tak, ako boli uložené — nemenia sa), stav behu, štatistika
// po k.ú. a výsledky. Mená vlastníkov len pre rolu s plným prístupom a len po zapnutí; do tlače
// nejdú nikdy (klientsky výstup s menami len cez klientsky report s výslovným povolením — OI-14).
// BEZ `loader` (pamäť cf_app_ssr_loader_leak).
export const Route = createFileRoute("/zadanie/$id")({
  head: () => ({ meta: [{ title: "Zadanie hľadania — TRI LIPY KATASTER CORE" }] }),
  component: ZadaniePage,
});

type KuStat = {
  kod_ku: string; ku_name?: string; examined?: number; match?: number; prov?: number; rejected?: number;
  rejected_brief?: number; reasons?: Record<string, number>; capped?: boolean; shown?: number; error?: string;
};
const BUILD_LABEL: Record<string, string> = { empty: "prázdny", demolishable: "na demoláciu", built: "zastavaný" };

function ZadaniePage() {
  const { id } = Route.useParams();
  const { token } = useAuth();
  const [brief, setBrief] = useState<SearchBrief | null>(null);
  const [results, setResults] = useState<BriefResult[]>([]);
  const [owners, setOwners] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [kuNames, setKuNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [limit, setLimit] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    getSearchBrief({ data: { token, id: Number(id) } })
      .then((r) => { setBrief(r.brief); setResults(r.results); setOwners(r.owners); setKuNames(r.kuNames); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!brief || (brief.status !== "pending" && brief.status !== "running")) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [brief, load]);

  const kus = useMemo(() => { try { return brief ? (JSON.parse(brief.kus_json) as string[]) : []; } catch { return []; } }, [brief]);
  const access = useMemo(() => {
    try { return brief?.access_json ? (JSON.parse(brief.access_json) as { dest: string; profile: string; limit_s: number }[]) : []; } catch { return []; }
  }, [brief]);
  const stats = useMemo(() => { try { return brief?.stats_json ? (JSON.parse(brief.stats_json) as KuStat[]) : []; } catch { return []; } }, [brief]);
  const nMatch = results.filter((r) => r.verdict === "MATCH").length;
  const nProv = results.filter((r) => r.verdict === "PROVISIONAL").length;
  const shownAll = results.filter((r) => r.verdict === tab);
  const shown = shownAll.slice(0, limit);
  const examined = stats.reduce((a, s) => a + (s.examined ?? 0), 0);
  const capped = stats.some((s) => s.capped);

  async function act(action: "cancel" | "rerun") {
    if (!token || !brief) return;
    const r = await setSearchBriefState({ data: { token, id: brief.id, action } }).catch(() => ({ ok: false, message: "Nepodarilo sa." }));
    setMsg(r.ok ? null : r.message ?? "Nepodarilo sa.");
    load();
  }

  if (loading) return <Card className="p-6 text-center text-sm text-muted">Načítavam zadanie…</Card>;
  if (!brief) return <Card className="p-6 text-sm text-muted">Zadanie neexistuje alebo nie si prihlásený. <Link to="/zadania" className="text-brand underline">Späť na zadania</Link></Card>;
  const st = BRIEF_STATUS[brief.status] ?? { label: brief.status, color: "#6b6b6b" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/zadania" className="no-print text-xs text-muted hover:text-fg">← Zadania hľadania</Link>
          <h1 className="text-xl font-semibold tracking-tight text-fg">#{brief.id} {brief.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {brief.client ? `Pre: ${brief.client} · ` : ""}zadal {brief.author ?? "—"} {brief.created_at.slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: st.color + "55", color: st.color }}>
            {st.label}{brief.status === "running" && brief.progress ? ` · ${brief.progress}` : ""}
          </span>
          {brief.status === "pending" ? <button onClick={() => void act("cancel")} className="rounded-md border border-line px-3 py-1 text-xs text-fg">Zrušiť</button> : null}
          {brief.status === "failed" || brief.status === "cancelled" ? <button onClick={() => void act("rerun")} className="rounded-md border border-line px-3 py-1 text-xs text-fg">Spustiť znova</button> : null}
          <Link to="/zadania" search={{ copy: brief.id }} className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2">Kopírovať do nového zadania</Link>
          {brief.status === "done" ? <button onClick={() => window.print()} className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-cream">Tlačiť / PDF</button> : null}
        </div>
      </div>
      {msg ? <p className="text-sm" style={{ color: "#9b3b2f" }}>{msg}</p> : null}
      {brief.status === "failed" && brief.error ? (
        <Card className="p-3 text-sm" style={{ borderColor: "#9b3b2f55" }}>Beh zlyhal: {brief.error}</Card>
      ) : null}
      {brief.status === "pending" ? (
        <Card className="p-3 text-sm text-muted">
          Zadanie čaká, kým ho prevezme engine na Macu. Ak Mac nebeží alebo spí, spracuje sa po jeho prebudení.
        </Card>
      ) : null}

      <Card className="p-4">
        <SectionHeader title="Zadanie" hint="Parametre tak, ako boli uložené. Výsledok platí len pre ne." />
        <table className="w-full text-sm"><tbody>
          <tr><td className="w-48 py-0.5 pr-3 align-top text-muted">Účel</td><td>{BRIEF_PURPOSE_SK[brief.purpose] ?? brief.purpose}</td></tr>
          <tr><td className="py-0.5 pr-3 align-top text-muted">Výmera celku</td><td>{m2(brief.area_min)} – {m2(brief.area_max)}</td></tr>
          <tr><td className="py-0.5 pr-3 align-top text-muted">Okolie</td><td>{kus.map((k) => kuNames[k] ?? k).join(", ") || "—"}</td></tr>
          <tr><td className="py-0.5 pr-3 align-top text-muted">Dostupnosť</td><td>
            {access.length ? access.map((a) => `${ACCESS_DEST[a.dest] ?? a.dest} ${a.profile === "foot" ? "pešo" : "autom"} do ${durationSk(a.limit_s)}`).join(" · ") : "bez požiadavky"}
          </td></tr>
          <tr><td className="py-0.5 pr-3 align-top text-muted">Svah</td><td>{brief.max_slope != null ? `najviac ${decSk(brief.max_slope)} %` : "prahy podľa účelu"}</td></tr>
          <tr><td className="py-0.5 pr-3 align-top text-muted">Poľnohospodárska pôda</td><td>{brief.exclude_ppf ? "vylúčiť" : "povoliť (označí sa)"}</td></tr>
          <tr><td className="py-0.5 pr-3 align-top text-muted">Prístup z cesty</td><td>{brief.require_frontage ? "povinný priamy prístup" : "bez priameho prístupu → na preskúmanie"}</td></tr>
          {brief.other_req ? (
            <tr><td className="py-0.5 pr-3 align-top text-muted">Ďalšie požiadavky</td><td>
              <span className="whitespace-pre-wrap">{brief.other_req}</span>
              <span className="mt-1 block text-xs" style={{ color: "#9a7b3e" }}>Tieto požiadavky engine automaticky neoveruje — treba ich preveriť pri každom výsledku.</span>
            </td></tr>
          ) : null}
        </tbody></table>
      </Card>

      {stats.length ? (
        <Card className="p-4">
          <SectionHeader title="Beh" hint={`${brief.started_at ? `spustený ${brief.started_at.slice(0, 16)}` : ""}${brief.finished_at ? ` · dokončený ${brief.finished_at.slice(0, 16)}` : ""}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead><tr className="border-b border-line text-left text-muted">
                <th className="py-1 pr-2">Katastrálne územie</th><th className="pr-2">preverené celky</th><th className="pr-2">zhody</th>
                <th className="pr-2">na preskúmanie</th><th className="pr-2">vylúčené</th><th className="pr-2">vylúčené zadaním</th><th>najčastejší dôvod vylúčenia</th>
              </tr></thead>
              <tbody>
                {stats.map((s) => {
                  const top = Object.entries(s.reasons ?? {}).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <tr key={s.kod_ku} className="border-b border-line/40">
                      <td className="py-1 pr-2">{kuNames[s.kod_ku] ?? s.ku_name ?? s.kod_ku}{s.capped ? " *" : ""}</td>
                      {s.error ? <td colSpan={6} style={{ color: "#9b3b2f" }}>chyba: {s.error}</td> : (<>
                        <td className="pr-2">{s.examined ?? "—"}</td><td className="pr-2">{s.match ?? "—"}</td><td className="pr-2">{s.prov ?? "—"}</td>
                        <td className="pr-2">{s.rejected ?? "—"}</td><td className="pr-2">{s.rejected_brief ?? 0}</td>
                        <td className="text-muted">{top ? `${top[0]} (${top[1]})` : "—"}</td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {capped ? <p className="mt-2 text-xs text-muted">* V tomto k.ú. engine zostavil viac celkov, ako preveruje naraz (strop) — zoznam nemusí byť úplný.</p> : null}
        </Card>
      ) : null}

      {brief.status === "done" || results.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Zhody" value={nMatch} />
            <Stat label="Na preskúmanie" value={nProv} />
            <Stat label="Preverené celky" value={examined || "—"} />
            <Stat label="Katastre" value={kus.length} />
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-line text-xs">
              <button onClick={() => { setTab("MATCH"); setLimit(30); }} className={`px-3 py-1 ${tab === "MATCH" ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}>Zhody ({nMatch})</button>
              <button onClick={() => { setTab("PROVISIONAL"); setLimit(30); }} className={`px-3 py-1 ${tab === "PROVISIONAL" ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}>Na preskúmanie ({nProv})</button>
            </div>
            {owners ? (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
                Zobraziť mená vlastníkov (nikdy sa netlačia)
              </label>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted">
              {tab === "MATCH" ? "Žiadna zhoda so všetkými požiadavkami." : "Nič na preskúmanie."}
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((r, i) => {
                const times = parseAccessTimes(r.access_times);
                const first = (r.parcels ?? "").split(",")[0].trim();
                return (
                  <Card key={`${r.kod_ku}-${r.parcels}-${i}`} className="flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-fg">{m2(r.area_m2)}{r.druh ? ` · ${r.druh}` : ""}</div>
                        <div className="text-xs text-muted">{kuLabel(r.ku_name, r.kod_ku)}{r.shape ? ` · ${r.shape}` : ""}</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                        {plural(r.n_parcels ?? 0, "parcela", "parcely", "parciel")} · kv. {r.quality != null ? Math.round(r.quality) : "—"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full border px-2 py-0.5 text-[11px]"
                        style={zoneUnknown(r.zone) ? { color: "#9a7b3e", borderColor: "#9a7b3e55", borderStyle: "dashed" } : { color: "#5b7a58" }}>
                        {zoneLabel(r.zone)}
                      </span>
                      {times.map((t) => (
                        <span key={t.label} className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#5b7a58" }}>
                          {t.label} {durationSk(t.seconds)}
                        </span>
                      ))}
                      {r.slope != null ? <span className="rounded-full border border-line px-2 py-0.5 text-[11px]">svah {decSk(r.slope)} %</span> : null}
                      {r.ppf ? <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>záber PPF</span> : null}
                      {r.frontage === 0 ? <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>bez priameho prístupu z cesty</span> : null}
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}
                        title="Právny prístup z cesty (vjazd po verejnom pozemku alebo vecné bremeno) appka neoveruje — skontrolovať LV prístupovej parcely a ťarchy.">
                        overiť vjazd
                      </span>
                      {BUILD_LABEL[r.build ?? ""] ? <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px]">{BUILD_LABEL[r.build ?? ""]}</span> : null}
                      {r.n_owners ? <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px]">{plural(r.n_owners, "vlastník", "vlastníci", "vlastníkov")}</span> : null}
                    </div>
                    {showNames && r.owners ? <p className="no-print mt-2 text-xs text-muted">{r.owners}</p> : null}
                    {r.reason ? <p className="mt-3 text-xs leading-relaxed text-muted">{reasonSk(r.reason)}</p> : null}
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted">
                      <span>parcely: {r.parcels ?? "—"}</span>
                      {r.dataset_id && first ? (
                        <Link to="/report/$datasetId/$parcelNo" params={{ datasetId: r.dataset_id, parcelNo: first }} className="no-print shrink-0 text-brand hover:underline">dossier →</Link>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {shown.length < shownAll.length ? (
            <button onClick={() => setLimit((l) => l + 30)} className="no-print mx-auto block rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-surface-2">
              Zobraziť viac ({shownAll.length - shown.length})
            </button>
          ) : null}
        </>
      ) : null}

      <Disclaimer>
        Výsledok platí pre parametre zadania a dáta k dátumu behu. Ide o fyzickú vhodnosť pozemku podľa
        katastra, územného plánu, OpenStreetMap a terénu — nie o právne posúdenie ani kvalifikáciu pre
        klienta bez kontroly. Právny prístup (vjazd) a požiadavky z poznámky treba overiť pri každom celku.
      </Disclaimer>
    </div>
  );
}
