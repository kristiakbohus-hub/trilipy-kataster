import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { searchOwnersGlobal, lookupRpo, lookupRpvs } from "../lib/api/kataster.functions";
import { useRole } from "../lib/role-context";
import { Badge, Card, Disclaimer, SectionHeader } from "../components/kit";

type SearchRes = Awaited<ReturnType<typeof searchOwnersGlobal>>;
type RpoRes = Awaited<ReturnType<typeof lookupRpo>>;

// Search-assist odkazy na osobu — otvoria vyhľadávanie, nič sa neukladá (žiadny profilovač).
function personLinks(name: string, locality: string): { label: string; url: string }[] {
  const full = encodeURIComponent(`"${name}" ${locality}`.trim());
  const nm = encodeURIComponent(name);
  return [
    { label: "Web / zmienky", url: `https://www.google.com/search?q=${full}` },
    { label: "Obchodný vestník", url: `https://www.google.com/search?q=${encodeURIComponent(`site:ov.justice.gov.sk "${name}"`)}` },
    { label: "Facebook", url: `https://www.facebook.com/search/top?q=${nm}` },
    { label: "LinkedIn", url: `https://www.linkedin.com/search/results/all/?keywords=${nm}` },
    { label: "Telefón / e-mail", url: `https://www.zlatestranky.sk/hladaj/${nm}/` },
  ];
}

// Registrové odkazy na firmu (IČO) — otvoria verejný register v novom tabe, nič sa neukladá.
function companyLinks(name: string, ico: string): { label: string; url: string }[] {
  const nm = encodeURIComponent(name);
  return [
    { label: "RPVS (koneční užívatelia výhod)", url: `https://rpvs.gov.sk/rpvs/Partner/Partner/VyhladavaniePartnera?meno=${nm}` },
    { label: "RÚZ / účtovné závierky", url: `https://www.registeruz.sk/cruz-public/domain/accountingentity/simplesearch?text=${encodeURIComponent(ico)}` },
    { label: "Obchodný register", url: `https://www.orsr.sk/hladaj_ico.asp?ICO=${encodeURIComponent(ico)}&SID=0` },
    { label: "Obchodný vestník (dražby/konkurzy)", url: `https://www.google.com/search?q=${encodeURIComponent(`site:ov.justice.gov.sk "${name}"`)}` },
  ];
}

export const Route = createFileRoute("/vlastnici")({
  head: () => ({ meta: [{ title: "Vlastníci — TRI LIPY KATASTER CORE" }] }),
  component: VlastniciPage,
});

function VlastniciPage() {
  const { role } = useRole();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [rpo, setRpo] = useState<Record<string, RpoRes>>({});
  const [rpoBusy, setRpoBusy] = useState<string | null>(null);
  type RpvsRes = Awaited<ReturnType<typeof lookupRpvs>>;
  const [rpvs, setRpvs] = useState<Record<string, RpvsRes>>({});
  const [rpvsBusy, setRpvsBusy] = useState<string | null>(null);
  async function enrichRpvs(ico: string, refresh = false) {
    setRpvsBusy(ico);
    try { const r = await lookupRpvs({ data: { ico, role, refresh } }); setRpvs((m) => ({ ...m, [ico]: r })); }
    finally { setRpvsBusy(null); }
  }

  async function search() {
    if (q.trim().length < 2) return;
    setLoading(true);
    try { setRes(await searchOwnersGlobal({ data: { q: q.trim(), role } })); }
    finally { setLoading(false); }
  }
  async function enrich(ico: string) {
    setRpoBusy(ico);
    try { const r = await lookupRpo({ data: { q: ico, role } }); setRpo((m) => ({ ...m, [ico]: r })); }
    finally { setRpoBusy(null); }
  }

  const results = res?.results ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Vlastníci — hľadať všetko</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Vyhľadaj vlastníka (meno alebo IČO) <b>naprieč všetkými k.ú.</b> Uvidíš, na koľkých LV a katastroch figuruje
          (dedup na jednu identitu), spoluvlastnícke podiely a pri firmách živé prepojenie na <b>RPO</b> (register právnických osôb).
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="Meno vlastníka alebo IČO (napr. Heglas / 17335345)"
            className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand"
          />
          <button onClick={() => void search()} disabled={loading} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {loading ? "Hľadám…" : "Hľadať"}
          </button>
        </div>

        {res && res.access !== "full" ? (
          <div className="mt-3 rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">
            Rola <b className="text-fg">{role}</b> nemá plný prístup k menám vlastníkov — vyhľadávanie podľa mena je vypnuté
            (owner-masking na serveri). Prepni na rolu s plným prístupom.
          </div>
        ) : null}

        {res && res.access === "full" ? (
          <div className="mt-3 text-xs text-muted">{results.length} identít vlastníkov {q ? `pre „${q}"` : ""}.</div>
        ) : null}
      </Card>

      {results.map((g, gi) => {
        const rr = g.ico ? rpo[g.ico] : undefined;
        return (
          <Card key={gi} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{g.name}</span>
              {g.is_company ? <Badge color="#6b6f86">PO · IČO {g.ico ?? "—"}</Badge> : <Badge color="#8a8a8a">FO{g.birth_date ? ` · nar. ${g.birth_date}` : ""}</Badge>}
              {g.kuCount > 1 ? <Badge color="#9a7b3e">{g.kuCount} k.ú.</Badge> : null}
              <Badge color="#5b7a58">{g.lvCount}× LV</Badge>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-1.5 font-medium">Katastrálne územie</th>
                    <th className="px-2 py-1.5 font-medium">LV</th>
                    <th className="px-2 py-1.5 font-medium">Podiel</th>
                    <th className="px-2 py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {g.occurrences.map((o, oi) => (
                    <tr key={oi}>
                      <td className="px-2 py-1.5 text-fg">{o.ku_name}</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-fg">{o.lv_no}</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-fg">{o.share || "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: o.dataset_id, lvNo: String(o.lv_no) }} search={{ typ: "vypis" }} className="text-xs text-green hover:underline">Výpis LV →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {g.is_company && g.ico ? (
              <div className="mt-3 border-t border-line pt-2">
                {!rr ? (
                  <button onClick={() => void enrich(g.ico!)} disabled={rpoBusy === g.ico} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:border-ink disabled:opacity-50">
                    {rpoBusy === g.ico ? "RPO…" : "Doplniť z RPO (register právnických osôb)"}
                  </button>
                ) : rr.ok && rr.results.length ? (
                  <div className="space-y-1 text-xs">
                    <div className="text-[10px] uppercase tracking-wide text-muted">RPO / ŠÚ SR — živý záznam</div>
                    {rr.results.slice(0, 3).map((c, ci) => (
                      <div key={ci} className="rounded-md bg-surface-2/40 px-2.5 py-1.5">
                        <div className="font-medium text-fg">{c.name ?? "—"} {c.ico ? <span className="text-muted">· IČO {c.ico}</span> : null}</div>
                        {c.address ? <div className="text-muted">{c.address}</div> : null}
                        <div className="text-muted">
                          {c.legal_form ? <span>{c.legal_form}</span> : null}
                          {c.established ? <span> · vznik {c.established}</span> : null}
                          {c.terminated ? <span style={{ color: "#9c4a40" }}> · zánik {c.terminated}</span> : null}
                        </div>
                        {c.statutory && c.statutory.length ? (
                          <div className="mt-1 border-t border-line/50 pt-1">
                            <div className="text-[10px] uppercase tracking-wide text-muted">Štatutári (koho osloviť)</div>
                            {c.statutory.map((s, si) => (
                              <div key={si} className="text-fg">{s.name} <span className="text-muted">· {s.role}</span></div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted">RPO: {rr.message ?? "bez výsledku"}.</div>
                )}
                {/* RPVS — koneční užívatelia výhod (živý register, cache 7 dní) */}
                <div className="mt-2">
                  {(() => {
                    const rv = rpvs[g.ico!];
                    return !rv ? (
                      <button onClick={() => void enrichRpvs(g.ico!)} disabled={rpvsBusy === g.ico} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:border-ink disabled:opacity-50">
                        {rpvsBusy === g.ico ? "RPVS…" : "Koneční užívatelia výhod (RPVS)"}
                      </button>
                    ) : (
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-wide text-muted">RPVS {rv.cached ? `· cache ${rv.ageDays}d` : "· živé"}</div>
                          <button onClick={() => void enrichRpvs(g.ico!, true)} className="text-[10px] text-muted hover:text-fg">obnoviť ↻</button>
                        </div>
                        {!rv.found ? (
                          <div className="text-muted">{rv.message ? `RPVS: ${rv.message}` : "Firma nie je v RPVS (nie je partnerom verejného sektora)."}</div>
                        ) : (
                          <>
                            <div className="text-muted">{rv.name ?? ""}{rv.vlozka ? ` · vložka ${rv.vlozka}` : ""}</div>
                            <div className="font-medium text-fg">Koneční užívatelia výhod ({rv.kuv.filter((k) => k.current).length} aktuálnych)</div>
                            <ul className="space-y-0.5">
                              {rv.kuv.filter((k) => k.current).slice(0, 8).map((k, ki) => (
                                <li key={ki} className="flex items-center justify-between gap-2 rounded bg-surface-2/40 px-2 py-1">
                                  <span className="text-fg">{k.name}{k.birth ? ` · nar. ${k.birth}` : ""}</span>
                                  {k.pep ? <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "#9c4a4022", color: "#9c4a40" }}>PEP</span> : null}
                                </li>
                              ))}
                            </ul>
                            {rv.kuv.filter((k) => !k.current).length ? <div className="text-[10px] text-muted">+ {rv.kuv.filter((k) => !k.current).length} historických KÚV</div> : null}
                            {rv.funkcionari.length ? <div className="text-[10px] text-muted">Verejní funkcionári: {rv.funkcionari.slice(0, 3).join(", ")}</div> : null}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="mt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Registre (otvorí sa vyhľadávanie — nič sa neukladá)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {companyLinks(g.name, g.ico!).map((l) => (
                      <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-fg hover:border-ink">{l.label} ↗</a>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {!g.is_company ? (
              <div className="mt-3 border-t border-line pt-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Vyhľadať kontakt / zmienky (otvorí sa vyhľadávanie — nič sa neukladá)</div>
                <div className="flex flex-wrap gap-1.5">
                  {personLinks(g.name, g.occurrences[0]?.ku_name ?? "").map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-fg hover:border-ink">{l.label} ↗</a>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}

      <Disclaimer>
        Dedup je odvodený (meno + dátum narodenia / IČO) — pri zhode mien bez dátumu môže spájať rôzne osoby, over v LV.
        RPO údaje sú živé z verejného registra ŠÚ SR. Owner-sensitive údaje vidí len rola s plným prístupom; interný pracovný nástroj, nie úradný výstup.
      </Disclaimer>
    </div>
  );
}
