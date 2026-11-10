import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getClientReport, logReportExport, listReportExports, type ClientReport, type ReportExportRow } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { csvDocument, csvLine } from "../lib/csv";
import { Card, CriteriaMatrix, Disclaimer } from "../components/kit";
import { critLabel, critLabelKnown, reasonSk, type AppPath } from "../lib/domain";

// Klientsky report A–H podľa dok. 16 §3. BEZ `loader` (viď pamäť cf_app_ssr_loader_leak).
export const Route = createFileRoute("/klient-report/$scenario/$kodKu")({
  head: () => ({ meta: [{ title: "Klientsky report — TRI LIPY KATASTER CORE" }] }),
  component: ClientReportPage,
});

const SCENARIO_LABEL: Record<string, string> = {
  up: "Pôda na bývanie — územný plán dovoľuje bývanie, kataster vedie poľnohospodársku pôdu",
  settlement: "Vysporiadanie pozemkov pod stavbami — vlastník stavby nie je vlastníkom pozemku",
  za: "Zdedené byty — podiel zdedený v rokoch 2025–2026, vlastník má inú evidovanú adresu",
  landsearch: "Stavebné pozemky — súvislé zastavateľné celky v zadanej výmere a dostupnosti",
};
const EFFECT_LABEL: Record<string, string> = {
  MUST: "Povinná podmienka", MUST_NOT: "Zákaz", PREFER: "Preferencia", AVOID: "Nežiaduce", INFO: "Informatívne",
};
// Metodika a poznámky boli písané pre scenár „pôda na bývanie" a zobrazovali sa aj pri ostatných —
// klient tak čítal o náklade vyňatia aj v reporte o zdedených bytoch. Každý scenár má svoje vlastné.
type ScenarioMeta = { back: AppPath; method: [string, string][]; scope: string; sortNote: string };
const SCENARIO_META: Record<string, ScenarioMeta> = {
  up: {
    back: "/poda-na-byvanie",
    method: [["Vlastníctvo a druh pozemku", "SPI import (register C/E)"],
             ["Náklad vyňatia", "sadzba BPEJ × výmera podľa NV 58/2013"]],
    scope: "Prehľadané bolo celé uvedené k.ú. v rozsahu dostupných dát. Katastre bez zdroja územného plánu sa v tomto scenári nedajú vyhodnotiť vôbec.",
    sortNote: "zoradené podľa nákladu vyňatia",
  },
  settlement: {
    back: "/vysporiadanie",
    method: [["Vlastníctvo a druh pozemku", "SPI import (register C/E)"],
             ["Párovanie stavba ↔ pozemok", "zhodné parcelné číslo C↔E (geometria E-parciel nie je k dispozícii)"],
             ["Odhad odkupu", "trhová cena obce × výmera podielu"]],
    scope: "Prehľadané boli stavby evidované v uvedenom k.ú. Pozemky pod stavbami bez dohľadateľnej E-parcely sa spárovať nedajú.",
    sortNote: "zoradené podľa skóre",
  },
  za: {
    back: "/zdedene-byty",
    method: [["Vlastníctvo a nadobudnutie", "SPI import — titul nadobudnutia (dedičstvo) a rok"],
             ["Podlažie", "z popisu bytu a rozsahu podlaží budovy"],
             ["Adresa vlastníka", "obec evidovaná pri vlastníkovi vs. obec bytu"]],
    scope: "Prehľadané boli byty evidované v uvedenom k.ú. Byty bez uvedeného podlažia alebo bez roku nadobudnutia sa vyhodnotiť nedajú.",
    sortNote: "zoradené podľa roku dedičstva",
  },
  landsearch: {
    back: "/stavebne-pozemky",
    method: [["Vlastníctvo a druh pozemku", "SPI import (register C/E)"],
             ["Súvislosť a tvar celku", "zlučovanie susedných parciel cez bounding-boxy S-JTSK"],
             ["Zastavanosť a využitie", "OSM budovy a existujúce využitie v mieste celku"],
             ["Dostupnosť", "cestná sieť OSM — čas jazdy k zadanému cieľu"],
             ["Svahovitosť", "digitálny model terénu"]],
    scope: "Prehľadané boli celky poskladané zo susediacich parciel uvedeného k.ú. Celky bez geometrie v spracovaní nie sú.",
    sortNote: "zoradené podľa skóre kvality",
  },
};
const DEFAULT_META: ScenarioMeta = { back: "/prilezitosti", method: [["Vlastníctvo a druh pozemku", "SPI import (register C/E)"]], scope: "Prehľadané bolo celé uvedené k.ú. v rozsahu dostupných dát.", sortNote: "zoradené podľa poradia behu" };
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sk-SK"));

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 border-b border-line pb-1 text-sm font-semibold uppercase tracking-wide text-fg">
        <span className="mr-2 text-muted">{id}</span>{title}
      </h2>
      <div className="text-sm">{children}</div>
    </section>
  );
}
const M = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;

type ExportFormat = "json" | "csv" | "print";
const FORMAT_LABEL: Record<ExportFormat, string> = { json: "JSON", csv: "CSV (Excel)", print: "tlač / PDF" };

// Tabuľkový export (dok. 16 + dok. 10 E06): tie isté hodnoty a statusy ako tlač a JSON, vrátane revízie.
function reportCsv(r: ClientReport): string {
  const head: (string | number | null)[][] = [
    ["Zákazka", SCENARIO_LABEL[r.scenario] ?? r.scenario],
    ["Územie", `${r.kuName ?? r.kodKu} (kód ${r.kodKu})`],
    ["Stav dát (as_of)", r.asOf],
    ["Revízia výsledku", r.revision],
    ["Preukázané zhody", r.nMatch], ["Podmienené", r.nProvisional],
    ["Úplnosť", r.completeness.truncated
      ? `orezané: ${r.completeness.shown} z ${r.completeness.found} nájdených`
      : r.completeness.found != null ? `všetky nájdené (${r.completeness.shown})` : "neevidované"],
    ["Povaha", "Informatívny analytický podklad z dostupných zdrojov — nie úradný výpis, znalecký posudok ani právne stanovisko."],
  ];
  const cols = ["ID", "Klasifikácia", ...r.colLabels, "Dôvod"];
  const ordered = [...r.shortlist.filter((x) => x.classification === "MATCH"), ...r.shortlist.filter((x) => x.classification !== "MATCH")];
  const body = ordered.map((x) => [x.id, x.classification === "MATCH" ? "zhoda" : "podmienené", ...x.cols.map((c) => c.value), reasonSk(x.reason ?? "")]);
  return csvDocument([...head.map(csvLine), "", csvLine(cols), ...body.map(csvLine)]);
}

function ClientReportPage() {
  const { scenario, kodKu } = Route.useParams();
  const [r, setR] = useState<ClientReport | null>(null);
  const [ready, setReady] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const { token } = useAuth();
  // Vydanie reportu = komu a na aký účel (dok. 16). Bez toho sa export nespustí.
  const [dlg, setDlg] = useState<ExportFormat | null>(null);
  const [recipient, setRecipient] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busyExp, setBusyExp] = useState(false);
  const [exports, setExports] = useState<ReportExportRow[]>([]);
  useEffect(() => {
    if (!token) return;
    listReportExports({ data: { token, scenario, kodKu } }).then(setExports).catch(() => {});
  }, [token, scenario, kodKu]);
  useEffect(() => {
    getClientReport({ data: { scenario, kodKu } }).then(setR).catch(() => {}).finally(() => setReady(true));
  }, [scenario, kodKu]);

  if (!ready) return <Card className="p-6 text-center text-sm text-muted">Načítavam report…</Card>;
  if (!r) return <Card className="p-6 text-center text-sm text-muted">Report sa nepodarilo zostaviť.</Card>;

  const run = r.run;
  const reasons: { reason: string; n: number }[] = (() => {
    try { return run?.reasons_json ? JSON.parse(run.reasons_json) : []; } catch { return []; }
  })();
  const meta = SCENARIO_META[r.scenario] ?? DEFAULT_META;

  // POZOR: `r` je zúžené cez `if (!r) return` VYŠŠIE, ale deklarácia funkcie je hoistovaná, takže
  // TypeScript to zúženie dovnútra neprenesie (TS18047). Preto lokálna kópia — rovnaká pasca ako
  // pri `const cc = c` v dossieri.
  const rep = r;
  function download(content: string, mime: string, ext: string) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `klient-report-${rep.scenario}-${rep.kodKu}-${rep.resultHash}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function confirmExport() {
    if (!dlg || !token) return;
    if (recipient.trim().length < 2 || purpose.trim().length < 3) { setExportErr("Vyplň, komu report ide a na aký účel."); return; }
    setBusyExp(true); setExportErr(null);
    try {
      // Najprv záznam, potom export — vydanie bez stopy nevznikne.
      const lr = await logReportExport({ data: { token, scenario: rep.scenario, kodKu: rep.kodKu, format: dlg, resultHash: rep.resultHash, recipient: recipient.trim(), purpose: purpose.trim() } });
      if (!lr.ok) { setExportErr(lr.message ?? "Vydanie sa nepodarilo zaevidovať — export neprebehol."); return; }
      const fmt = dlg;
      setDlg(null);
      listReportExports({ data: { token, scenario: rep.scenario, kodKu: rep.kodKu } }).then(setExports).catch(() => {});
      if (fmt === "json") download(JSON.stringify(rep, null, 2), "application/json", "json");
      else if (fmt === "csv") download(reportCsv(rep), "text/csv;charset=utf-8", "csv");
      else setTimeout(() => window.print(), 50);
    } catch (e) {
      // Dok. 16: „Export sa označí ako neúspešný, ak príslušný finálny formát nevznikol."
      setExportErr(e instanceof Error ? e.message : "Export zlyhal.");
    } finally { setBusyExp(false); }
  }
  const match = r.shortlist.filter((x) => x.classification === "MATCH");
  const prov = r.shortlist.filter((x) => x.classification === "PROVISIONAL");

  return (
    <div className="mx-auto max-w-[900px] space-y-7 print:max-w-none">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <Link to={meta.back} className="text-xs text-muted hover:text-fg">← Späť na kartu</Link>
        <span className="flex items-center gap-2">
          {/* Dok. 16 žiada aj STROJOVO čitateľný výstup, nie len stránku na tlač. JSON nesie ten
              istý `result_hash` ako vytlačená verzia, takže sa dá dokázať, že ide o ten istý
              výsledok — a ak sa súbor nevytvorí, povieme to, nie aby to vyzeralo ako hotové. */}
          <button onClick={() => setDlg("csv")} className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2">
            Stiahnuť CSV
          </button>
          <button onClick={() => setDlg("json")} className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2">
            Stiahnuť JSON
          </button>
          <button onClick={() => setDlg("print")} className="rounded-md border border-line px-3 py-1 text-xs text-fg hover:bg-surface-2">
            Tlačiť / uložiť PDF
          </button>
        </span>
      </div>

      {dlg ? (
        <Card className="space-y-2 p-4 print:hidden">
          <div className="text-sm font-medium text-fg">Vydanie reportu — {FORMAT_LABEL[dlg]}</div>
          <p className="text-xs text-muted">Každé vydanie sa eviduje: komu report ide a na aký účel (aj pri internom použití). Záznam nesie revíziu {rep.resultHash}, takže sa dá dohľadať, ktorú verziu výsledku kto dostal.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted">Komu
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="napr. klient s.r.o. / interné" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-fg" />
            </label>
            <label className="text-xs text-muted">Účel
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="napr. podklad k ponuke pozemkov" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-fg" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void confirmExport()} disabled={busyExp} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream disabled:opacity-50">{busyExp ? "…" : "Zaevidovať a vydať"}</button>
            <button onClick={() => { setDlg(null); setExportErr(null); }} className="text-xs text-muted hover:text-fg">Zrušiť</button>
            {exportErr ? <span className="text-xs" style={{ color: "#9c4a40" }}>{exportErr}</span> : null}
          </div>
        </Card>
      ) : null}

      <Sec id="A." title="Identifikácia a zhrnutie">
        <table className="w-full"><tbody>
          <tr><td className="py-0.5 pr-3 text-muted">Zákazka</td><td>{SCENARIO_LABEL[r.scenario] ?? r.scenario}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Územie</td><td>{r.kuName ?? r.kodKu} (kód {r.kodKu})</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Stav dát (as_of)</td><td className="tabular-nums">{r.asOf ?? "—"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Preukázané zhody</td><td className="tabular-nums">{num(r.nMatch)}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Podmienené (na preskúmanie)</td><td className="tabular-nums">{num(r.nProvisional)}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Vylúčené</td><td className="tabular-nums">{run ? num(run.n_rejected) : "neevidované pre tento beh"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Úplnosť zoznamu</td><td>{r.completeness.truncated
            ? <b style={{ color: "#a4553a" }}>orezaný — v reporte {num(r.completeness.shown)} z {num(r.completeness.found)} nájdených</b>
            : r.completeness.found != null ? `všetky nájdené (${num(r.completeness.shown)})` : "neevidované — úplnosť sa nedá potvrdiť"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Revízia výsledku</td>
              <td className="font-mono text-xs">{r.revision}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Vykreslené</td>
              <td className="tabular-nums text-xs">{r.generatedAt}</td></tr>
        </tbody></table>
        {r.completeness.truncated ? (
          <p className="mt-1 text-xs" style={{ color: "#a4553a" }}>
            Zoznam <b>nie je úplný</b>: do appky sa zapisuje len najlepších {num(r.completeness.shown)} celkov
            (podľa skóre) z {num(r.completeness.found)} nájdených. Výsledky platia v tomto rozsahu, nie ako všetky možnosti v území.
          </p>
        ) : null}
        {r.emptyReason ? <p className="mt-1 text-xs" style={{ color: "#a4553a" }}><b>Prečo je zoznam prázdny:</b> {r.emptyReason}</p> : null}
        <p className="mt-1 text-xs text-muted">
          Revízia je kontrolný súčet <b>analytického obsahu</b> — čas vykreslenia doň nevstupuje.
          Vytlačená aj strojová (JSON) verzia preto nesú ten istý súčet; ak sa líšia, nie je to
          ten istý výsledok.
        </p>
        <p className="mt-2 text-xs text-muted">
          Najdôležitejšie obmedzenie: výsledok platí pre deklarované územie a snapshot dát uvedený vyššie.
          Nejde o právny ani znalecký záver.
        </p>
        {!r.hasDataset ? (
          <p className="mt-1 text-xs" style={{ color: "#a4553a" }}>
            Toto k.ú. <b>nie je v appke importované ako dataset</b> (parcely, LV, vlastníci). Kandidáti
            vyššie pochádzajú z analýzy nad lokálnymi dátami, ale nedajú sa otvoriť v dossieri ani z nich
            založiť deal, a snapshot dát sa nedá uviesť.
          </p>
        ) : null}
      </Sec>

      <Sec id="B." title="Zadanie a interpretácia">
        {r.brief.length === 0 ? <M>Normalizovaný brief sa nedá zobraziť — beh neuložil maticu kritérií.</M> : (
          <table className="w-full"><tbody>
            {r.brief.map((c, i) => (
              <tr key={i} className="border-b border-line/40">
                <td className="py-0.5 pr-3 text-muted">{EFFECT_LABEL[c.effect] ?? c.effect}</td>
                <td className="py-0.5">{critLabel(c.key)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        <p className="mt-2 text-xs text-muted">
          Podmienky sú vypísané tak, ako ich beh reálne vyhodnocoval — nie prepisom zo zadania.
        </p>
      </Sec>

      <Sec id="C." title="Rozsah a metodika">
        <table className="w-full"><tbody>
          <tr><td className="py-0.5 pr-3 text-muted">Preverených kandidátov</td><td className="tabular-nums">{run ? num(run.examined) : "—"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Zdroj funkčného využitia</td><td>
            {r.zoningSources.length === 0 ? "—" : r.zoningSources.map((z) => (
              z.src === "WMS" ? `presný WMS výkres (${z.n})` : `georeferencovaný raster — orientačný (${z.n})`
            )).join(" · ")}
          </td></tr>
          {meta.method.map(([k, v]) => (
            <tr key={k}><td className="py-0.5 pr-3 text-muted">{k}</td><td>{v}</td></tr>
          ))}
          {run?.params_json ? <tr><td className="py-0.5 pr-3 text-muted">Parametre behu</td><td className="break-all text-xs">{run.params_json}</td></tr> : null}
        </tbody></table>
        {/* Retail a priemysel bežia na testovacom profile. Report ide klientovi do ruky, takže
            to musí byť uvedené TU, nie len v dokumentácii (OI-07/OI-08, dok. 05 §3). */}
        {r.scenario === "landsearch" && r.shortlist.some((x) =>
          x.cols.some((c) => c.label === "Účel" && (c.value === "retail" || c.value === "priemysel"))) ? (
          <p className="mt-2 rounded border px-2 py-1.5 text-xs leading-relaxed"
            style={{ borderColor: "#9a7b3e55", background: "rgba(154,123,62,0.07)", color: "#6b5324" }}>
            <b>Rozsah platnosti:</b> celky pre účel „retail" a „priemysel" sú vyhodnotené na
            <b> testovacom profile</b> (plocha bez kritérií dostupnosti), nie podľa požiadaviek
            konkrétneho zadávateľa — tie zatiaľ nie sú schválené. Pre tieto účely ide o fyzickú
            vhodnosť pozemku, <b>nie o kvalifikáciu pre klientsky dopyt</b>.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Úplnosť: {meta.scope}
        </p>
      </Sec>

      <Sec id="D." title={`Shortlist — preukázané zhody (${match.length})`}>
        {match.length === 0 ? <M>Žiadne preukázané zhody.{r.emptyReason ? ` ${r.emptyReason}` : prov.length ? " Podmienení kandidáti sú uvedení nižšie." : ""}</M> : (
          <table className="w-full text-xs"><thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-1 pr-2">ID</th>
              {r.colLabels.map((l) => <th key={l} className="pr-2">{l}</th>)}
            </tr></thead>
            <tbody>
              {match.slice(0, 60).map((x) => (
                <tr key={x.id} className="border-b border-line/40">
                  <td className="py-1 pr-2 tabular-nums text-muted">{x.id}</td>
                  {x.cols.map((c, j) => <td key={j} className="pr-2">{c.value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {match.length > 60 ? <p className="mt-1 text-xs text-muted">Zobrazených prvých 60 z {match.length} — {meta.sortNote}.</p> : null}
        {prov.length > 0 ? <p className="mt-2 text-xs text-muted">Podmienených kandidátov (na preskúmanie): {prov.length} — uvedené oddelene, nie sú zamieňané so zhodami.</p> : null}
      </Sec>

      <Sec id="E." title="Detail kandidátov">
        {match.length === 0 ? <M>—</M> : (
          <div className="space-y-3">
            {match.slice(0, 3).map((x) => (
              <div key={x.id} className="border border-line p-2">
                <div className="text-sm font-medium">{x.id} · {x.title}</div>
                {x.subtitle ? <div className="text-xs text-muted">{x.subtitle}</div> : null}
                {x.reason ? <p className="mt-1 text-xs leading-relaxed text-muted">{reasonSk(x.reason)}</p> : null}
                <CriteriaMatrix json={x.criteriaJson} />
                {x.datasetId && x.parcelNo ? (
                  <Link to="/report/$datasetId/$parcelNo" params={{ datasetId: x.datasetId, parcelNo: x.parcelNo }}
                    className="mt-1 inline-block text-xs text-green hover:underline print:hidden">
                    Otvoriť dossier parcely →
                  </Link>
                ) : x.datasetId && x.lvNo ? (
                  <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: x.datasetId, lvNo: String(x.lvNo) }}
                    search={{ typ: "vypis" }}
                    className="mt-1 inline-block text-xs text-green hover:underline print:hidden">
                    Otvoriť výpis LV →
                  </Link>
                ) : null}
              </div>
            ))}
            {match.length > 3 ? <p className="text-xs text-muted">Detail prvých 3; zvyšok je v shortliste vyššie a v dossieroch jednotlivých parciel.</p> : null}
          </div>
        )}
      </Sec>

      <Sec id="F." title="Prečo iné kandidáty neprešli">
        {!run ? (
          <M>
            Pre tento beh nemáme uloženú štatistiku vylúčení. <b>Neznamená to, že nič nebolo vylúčené</b> —
            znamená to, že počty a dôvody neboli zaznamenané, takže ich tu neuvádzame ani odhadom.
          </M>
        ) : (
          <>
            <table className="w-full"><tbody>
              <tr><td className="py-0.5 pr-3 text-muted">Preverených</td><td className="tabular-nums">{num(run.examined)}</td></tr>
              <tr><td className="py-0.5 pr-3 text-muted">Vylúčených</td><td className="tabular-nums">{num(run.n_rejected)}</td></tr>
              <tr><td className="py-0.5 pr-3 text-muted">Zapísaných do appky</td><td className="tabular-nums">{num(run.n_pushed)}</td></tr>
            </tbody></table>
            {reasons.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-xs">
                {reasons.slice(0, 12).map((x, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-line/40 py-0.5">
                    <span>{x.reason}</span><span className="shrink-0 tabular-nums text-muted">{num(x.n)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-muted">Rozpis dôvodov nie je k dispozícii.</p>}
          </>
        )}
      </Sec>

      <Sec id="G." title="Podmienky a ďalšie overenia">
        {r.uncertainties.length === 0 ? (
          <M>Pri preukázaných zhodách neostali nevyhodnotené povinné podmienky.</M>
        ) : (
          <ul className="space-y-0.5">
            {r.uncertainties.map((u, i) => {
              // candidate.py posiela „<kluc>: NOT VERIFIED" — v klientskom reporte to musí byť veta.
              const key = u.text.split(":")[0].trim();
              const label = critLabelKnown(key);
              return (
                <li key={i} className="flex justify-between gap-3 border-b border-line/40 py-0.5">
                  <span>{label ? `Nepodarilo sa overiť: ${label.charAt(0).toLowerCase()}${label.slice(1)}` : u.text}</span>
                  <span className="shrink-0 tabular-nums text-muted">{u.n}×</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Vyplýva to z hraníc dostupných dôkazov, nie z ručného doplnenia. Ťarchy a tituly overte na
          úradnom výpise z listu vlastníctva.
        </p>
      </Sec>

      <Sec id="H." title="Dôkazová príloha">
        <table className="w-full"><tbody>
          <tr><td className="py-0.5 pr-3 text-muted">Kataster (vlastníctvo, druh, výmera)</td><td>lokálny SPI import, snapshot {r.asOf ?? "—"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Územný plán</td><td>{r.zoningSources.map((z) => z.src === "WMS" ? "WMS výkres obce" : "georeferencovaný raster výkresu").join(" · ") || "—"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Pôda a odvod</td><td>BPEJ podľa NV 58/2013</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Beh scenára</td><td className="tabular-nums">{run?.as_of ?? "—"}</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Rozsah exportu</td><td>bez osobných údajov vlastníkov (iba počty)</td></tr>
          <tr><td className="py-0.5 pr-3 text-muted">Kontrola formulácií</td><td>{r.phraseIssues.length === 0
            ? "texty kandidátov neobsahujú zakázané tvrdenia (dok. 16 §4)"
            : <b style={{ color: "#9c4a40" }}>{r.phraseIssues.length} typ(y) tvrdení bez dôkazu — pred vydaním opraviť</b>}</td></tr>
        </tbody></table>
        {r.phraseIssues.length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {r.phraseIssues.map((p) => (
              <li key={p.id} className="border-b border-line/40 pb-1">
                <b>„{p.claim}"</b> — {p.n}× (napr. {p.sample}). Správne: {p.use}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 print:hidden">
          <div className="text-xs font-medium text-fg">Vydania tohto reportu</div>
          {exports.length === 0 ? <p className="text-xs text-muted">Zatiaľ nevydaný.</p> : (
            <table className="mt-1 w-full text-xs"><tbody>
              {exports.map((e) => (
                <tr key={e.id} className="border-b border-line/40">
                  <td className="py-0.5 pr-2 tabular-nums text-muted">{e.created_at.slice(0, 16)}</td>
                  <td className="pr-2">{FORMAT_LABEL[e.format as ExportFormat] ?? e.format}</td>
                  <td className="pr-2">{e.recipient}</td>
                  <td className="pr-2 text-muted">{e.purpose}</td>
                  <td className="pr-2 font-mono text-muted">{e.result_hash}</td>
                  <td className="text-muted">{e.author ?? ""}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </Sec>

      <Disclaimer>
        Informatívny analytický podklad z dostupných zdrojov — nie úradný výpis, znalecký posudok ani
        právne stanovisko. Funkčné využitie z georeferencovaného rastra je orientačné. Neprítomnosť
        záznamu (ťarchy, titul, územný plán) neznamená jeho neexistenciu.
      </Disclaimer>
    </div>
  );
}
