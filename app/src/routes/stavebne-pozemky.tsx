import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getLandsearchBrowse, type LandsearchRow } from "../lib/api/kataster.functions";
import { m2, parseAccessTimes, durationSk, reasonSk, decSk } from "../lib/domain";
import { Card, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/stavebne-pozemky")({
  head: () => ({ meta: [{ title: "Stavebné pozemky — TRI LIPY KATASTER CORE" }] }),
  component: LandPage,
});

const PURPOSE_LABEL: Record<string, string> = { residential: "bývanie", retail: "retail", industrial: "priemysel" };
const BUILD_LABEL: Record<string, string> = { empty: "prázdny", demolishable: "na demoláciu", built: "zastavaný" };
const PURPOSE_LIMITS: Record<string, string> = { residential: "škola ≤10 min · obchod ≤5 min autom" };


function LandPage() {
  const { role } = useRole();
  const { token } = useAuth();
  const [purpose, setPurpose] = useState<"residential" | "retail" | "industrial">("residential");
  const [kuFilter, setKuFilter] = useState("");
  const [verdict, setVerdict] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [limit, setLimit] = useState(30);
  const [rows, setRows] = useState<LandsearchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLandsearchBrowse({ data: { purpose, role, token: token ?? undefined } })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [purpose, role, token]);

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.kod_ku, r.ku_name ?? r.kod_ku);
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);

  const nMatch = rows.filter((r) => r.verdict === "MATCH").length;
  const nProv = rows.filter((r) => r.verdict === "PROVISIONAL").length;
  const nPpf = rows.filter((r) => r.verdict === "MATCH" && r.ppf).length;

  const shownAll = useMemo(
    () => rows.filter((r) => r.verdict === verdict && (!kuFilter || r.kod_ku === kuFilter)),
    [rows, verdict, kuFilter],
  );
  const shown = shownAll.slice(0, limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Stavebné pozemky</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Celky vyhodnotené na výstavbu (geometria, zoning, limity, svah, prístup) — pri bývaní aj{" "}
          <b>jazdný čas do školy/obchodu</b> (sieťový router, nie vzdušná čiara). Predpočítané z Mac
          enginu (GOLD-LI/GOLD-BU), nie právny posudok.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Vyhovuje (MATCH)" value={nMatch} />
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label="Záber PPF" value={nPpf} />
        <Stat label="Katastre" value={katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader
          title="Kandidátske celky"
          hint={PURPOSE_LIMITS[purpose] ?? "fyzická zastavateľnosť + zoning + limity"}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-xs">
            {(["residential", "retail", "industrial"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setPurpose(p); setLimit(30); }}
                className={`px-3 py-1 ${purpose === p ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
              >{PURPOSE_LABEL[p]}</button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line text-xs">
            <button
              onClick={() => { setVerdict("MATCH"); setLimit(30); }}
              className={`px-3 py-1 ${verdict === "MATCH" ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
            >Vyhovuje ({nMatch})</button>
            <button
              onClick={() => { setVerdict("PROVISIONAL"); setLimit(30); }}
              className={`px-3 py-1 ${verdict === "PROVISIONAL" ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
            >Na preskúmanie ({nProv})</button>
          </div>
          <select
            value={kuFilter}
            onChange={(e) => { setKuFilter(e.target.value); setLimit(30); }}
            className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg"
          >
            <option value="">Všetky k.ú.</option>
            {katastre.map((k) => <option key={k.kod} value={k.kod}>{k.name}</option>)}
          </select>
          {/* Klientsky report (dok. 16 §3 A–H) sa robí vždy za JEDNO k.ú. — bez filtra nie je čo zadať. */}
          {kuFilter ? (
            <Link
              to="/klient-report/$scenario/$kodKu"
              params={{ scenario: "landsearch", kodKu: kuFilter }}
              className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2"
            >Klientsky report</Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">Načítavam…</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Žiadne celky v tejto kategórii. Dáta plní Mac engine cez <code>/api/ingest-landsearch</code>.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => {
            const times = parseAccessTimes(r.access_times);
            return (
              <Card key={`${r.kod_ku}-${r.parcels}-${i}`} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-fg">{m2(r.area_m2)}{r.druh ? ` · ${r.druh}` : ""}</div>
                    <div className="text-xs text-muted">{r.ku_name ?? r.kod_ku}{r.shape ? ` · ${r.shape}` : ""}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
                    {r.n_parcels} {r.n_parcels === 1 ? "parcela" : "parciel"} · kv. {r.quality != null ? Math.round(r.quality) : "—"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.zone ? (
                    <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">{r.zone}</span>
                  ) : null}
                  {times.map((t) => (
                    <span key={t.label} className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#5b7a58" }}>
                      {t.label} {durationSk(t.seconds)}
                    </span>
                  ))}
                  {r.ppf ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>záber PPF</span>
                  ) : null}
                  {r.n_owners ? (
                    <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
                      {r.n_owners} {r.n_owners === 1 ? "vlastník" : "vlastníkov"}
                    </span>
                  ) : null}
                  {/* svah, prístup a zastavanosť engine počíta a posiela, ale karta ich nezobrazovala —
                      pri stavebnom pozemku sú to pritom tri z najdôležitejších vecí. */}
                  {r.slope != null ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px]"
                      style={r.slope > 12 ? { color: "#9a7b3e" } : { color: "#5b7a58" }}>
                      svah {decSk(r.slope)} %
                    </span>
                  ) : null}
                  {r.frontage === 0 ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>
                      bez priameho prístupu z cesty
                    </span>
                  ) : null}
                  {BUILD_LABEL[r.build ?? ""] ? (
                    <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
                      {BUILD_LABEL[r.build ?? ""]}
                    </span>
                  ) : null}
                </div>

                {r.owners ? <p className="mt-2 text-xs text-muted">{r.owners}</p> : null}
                {r.reason ? <p className="mt-3 text-xs leading-relaxed text-muted">{reasonSk(r.reason)}</p> : null}
                {r.parcels ? <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">parcely: {r.parcels}</p> : null}
              </Card>
            );
          })}
        </div>
      )}

      {shown.length < shownAll.length ? (
        <button onClick={() => setLimit((l) => l + 30)} className="mx-auto block rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-surface-2">
          Zobraziť viac ({shownAll.length - shown.length})
        </button>
      ) : null}

      <Disclaimer>
        Kandidáti sú odvodení z lokálneho SPI importu + OSM siete (geometria, zoning ÚP, limity
        záplava/zosuv, svahovitosť, pri bývaní aj jazdný čas do školy/obchodu po reálnej ceste — nie
        vzdušná čiara). „Vyhovuje" je pracovný indikátor na preskúmanie, nie právny ani stavebný posudok.
      </Disclaimer>
    </div>
  );
}
