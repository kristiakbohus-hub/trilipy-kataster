import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getDatasets, importDataset, importEknParcels, runReadinessRecheck } from "../lib/api/kataster.functions";
import { STATUS_META, canRunPipeline } from "../lib/domain";
import type { ImportParcel } from "../lib/vgi-import";
import { Badge, Card, Disclaimer, Icon, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "Import & intake — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getDatasets(),
  component: ImportPage,
});

const SOURCES = [
  { code: "SPI", label: "Popisné informácie", desc: "Parcely, LV, vlastníci, podiely (DBF)." },
  { code: "SGI", label: "Grafické informácie", desc: "Hranice a kresba parciel (VGI/SHP)." },
  { code: "VGI", label: "Výmenný formát", desc: "Objekty a geometria katastra." },
  { code: "DBF/FPT", label: "dBASE + memo", desc: "Zdrojové tabuľky a memo bloky." },
  { code: "ÚP", label: "Územný plán", desc: "Regulatívy a funkčné využitie." },
];

const PIPELINE = [
  "SPI/SGI intake — read-only snapshot raw súborov",
  "DBF/FPT quality gate — schéma, čitateľnosť, memo",
  "VGI parse — parcelná geometria a texty",
  "Canonical linkage — owners / LV / shares",
  "Geometry recovery — pokrytie a validácia hraníc",
  "Readiness audit — ready / warnings / blocked",
];

function ImportPage() {
  const datasets = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  async function recheck(id: string) {
    setBusy(id);
    try {
      const r = await runReadinessRecheck({ data: { datasetId: id, role } });
      setMsg((m) => ({ ...m, [id]: r.message ?? (r.ok ? "Hotovo." : "Neúspešné.") }));
      router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  // ——— Nahrať nové k.ú. (VGI) ———
  const [parsed, setParsed] = useState<{ name: string; parcels: ImportParcel[]; total: number } | null>(null);
  const [code, setCode] = useState("");
  const [kuName, setKuName] = useState("");
  const [region, setRegion] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);

  async function onFile(f: File) {
    setParsing(true); setImpMsg(null); setNewId(null); setParsed(null);
    try {
      const text = await f.text();
      const { parseVgi } = await import("../lib/vgi-import");
      const r = parseVgi(text);
      if (r.parcels.length === 0) {
        setImpMsg("Nepodarilo sa vyparsovať parcely — skontroluj, že ide o KN VGI súbor (register KLADPAR).");
      } else {
        setParsed({ name: f.name, parcels: r.parcels, total: r.total });
        const m = f.name.match(/(\d{6})/);
        if (m && !code) setCode(m[1]);
      }
    } catch {
      setImpMsg("Chyba pri čítaní súboru.");
    } finally {
      setParsing(false);
    }
  }

  async function doImport() {
    if (!parsed || code.trim().length < 3 || kuName.trim().length < 2) {
      setImpMsg("Zadaj kód (min. 3 znaky) a názov katastrálneho územia.");
      return;
    }
    setImporting(true); setImpMsg(null);
    try {
      const r = await importDataset({
        data: { code: code.trim(), name: kuName.trim(), region: region.trim() || undefined, role, parcels: parsed.parcels },
      });
      if (r.ok) {
        setImpMsg(`Dataset vytvorený — ${r.count} parciel. Geometria georeferencovaná (Krovák→WGS84).`);
        setNewId(r.datasetId ?? null);
        setParsed(null); setCode(""); setKuName(""); setRegion("");
        router.invalidate();
      } else {
        setImpMsg(r.message ?? "Import neúspešný.");
      }
    } finally {
      setImporting(false);
    }
  }

  // ——— Doplniť E-KN (UO*.vgi) k existujúcemu k.ú. ———
  const [eknDs, setEknDs] = useState("");
  const [eknParsed, setEknParsed] = useState<{ name: string; parcels: ImportParcel[]; total: number } | null>(null);
  const [eknBusy, setEknBusy] = useState(false);
  const [eknMsg, setEknMsg] = useState<string | null>(null);

  async function onEknFile(f: File) {
    setEknBusy(true); setEknMsg(null); setEknParsed(null);
    try {
      const text = await f.text();
      const { parseVgi } = await import("../lib/vgi-import");
      const r = parseVgi(text, 20000);
      if (r.parcels.length === 0) setEknMsg("Nepodarilo sa vyparsovať E-KN parcely — skontroluj, že ide o UO*.vgi (register E / určený operát).");
      else setEknParsed({ name: f.name, parcels: r.parcels, total: r.total });
    } catch { setEknMsg("Chyba pri čítaní súboru."); }
    finally { setEknBusy(false); }
  }
  async function doEknImport() {
    if (!eknDs) { setEknMsg("Vyber k.ú. (dataset), ku ktorému doplniť E-KN."); return; }
    if (!eknParsed) return;
    setEknBusy(true); setEknMsg(null);
    try {
      const all = eknParsed.parcels; const CH = 1500; let done = 0;
      for (let i = 0; i < all.length; i += CH) {
        const chunk = all.slice(i, i + CH);
        const r = await importEknParcels({ data: { datasetId: eknDs, role, append: i > 0, parcels: chunk } });
        if (!r.ok) { setEknMsg(r.message ?? "Import E-KN zlyhal."); setEknBusy(false); return; }
        done += r.count ?? 0; setEknMsg(`Importujem E-KN… ${done}/${all.length}`);
      }
      setEknMsg(`Hotovo — ${done} E-KN parciel doplnených. Otvor mapu a zapni/izoluj vrstvu „E-KN" (zelená).`);
      setEknParsed(null);
      router.invalidate();
    } catch (e) { setEknMsg(e instanceof Error ? e.message : "Chyba pri importe E-KN."); }
    finally { setEknBusy(false); }
  }

  const inputCls =
    "rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-ink disabled:opacity-50";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Import & intake</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Každý dataset prechádza manifestom, quality gate a auditom. Raw vstupy ostávajú nemeniteľné;
          opravy sa robia iba vo working vrstve.
        </p>
      </div>

      {/* Nahrať nové k.ú. z VGI — self-service import */}
      <Card className="p-5">
        <SectionHeader
          title="Nahrať nové katastrálne územie (VGI)"
          hint={
            canRunPipeline(role)
              ? "Klient sparsuje VGI a georeferencuje geometriu (S-JTSK/EPSG:5514 → WGS84); dataset sa vytvorí v D1."
              : "Rola nemá oprávnenie spúšťať import (potrebný admin / manager / geodet)."
          }
        />

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            VGI súbor (KLADPAR)
            <input
              type="file"
              accept=".vgi,.txt,text/plain"
              disabled={!canRunPipeline(role) || parsing}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
              className="text-fg file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:text-cream disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Kód k.ú.
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="napr. 851388"
              disabled={!canRunPipeline(role)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Názov k.ú.
            <input value={kuName} onChange={(e) => setKuName(e.target.value)} placeholder="napr. Raková"
              disabled={!canRunPipeline(role)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Región (voliteľné)
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="napr. Žilinský kraj"
              disabled={!canRunPipeline(role)} className={inputCls} />
          </label>
        </div>

        {parsing ? (
          <div className="mt-3 text-sm text-muted">Parsujem VGI a georeferencujem geometriu…</div>
        ) : parsed ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-2/40 px-3 py-2.5 text-sm">
            <Icon name="upload" className="text-green" />
            <span className="text-fg">
              <b>{parsed.parcels.length}</b> parciel pripravených{parsed.total > parsed.parcels.length ? ` (z ${parsed.total} v súbore)` : ""} · {parsed.name}
            </span>
            <button
              onClick={() => void doImport()}
              disabled={importing || !canRunPipeline(role)}
              className="ml-auto rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-cream disabled:opacity-50"
            >
              {importing ? "Vytváram dataset…" : "Vytvoriť dataset"}
            </button>
          </div>
        ) : null}

        {impMsg ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fg">
            <span>{impMsg}</span>
            {newId ? (
              <>
                <Link to="/mapa" className="font-medium text-green hover:underline">Otvoriť v mape →</Link>
                <Link to="/datasety/$id" params={{ id: newId }} className="text-muted hover:text-fg">Detail datasetu</Link>
              </>
            ) : null}
          </div>
        ) : null}

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Import z VGI vytvorí parcelnú geometriu s reálnymi číslami a výmerami. Väzba na vlastníkov (SPI/LV) sa
          neodvodzuje automaticky — ostáva <b className="text-fg">needs_review</b>, kým sa nenapojí zodpovedajúci SPI.
          Raw súbor sa neukladá; do D1 ide iba odvodená geometria.
        </p>
      </Card>

      {/* Doplniť E-KN (UO*.vgi) k existujúcemu k.ú. */}
      <Card className="p-5">
        <SectionHeader
          title="Doplniť E-KN parcely (UO*.vgi)"
          hint={canRunPipeline(role)
            ? "Register E (určený operát) býva v samostatnom UO*.vgi. Doplní sa k vybranému k.ú. ako zelená vrstva E-KN (C-KN ostane čierna)."
            : "Rola nemá oprávnenie (potrebný admin / manager / geodet)."}
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            k.ú. (existujúci dataset)
            <select value={eknDs} onChange={(e) => setEknDs(e.target.value)} disabled={!canRunPipeline(role)} className={inputCls}>
              <option value="">— vyber k.ú. —</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.ku_name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            UO*.vgi súbor (register E)
            <input type="file" accept=".vgi,.txt,text/plain" disabled={!canRunPipeline(role) || eknBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onEknFile(f); }}
              className="text-fg file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:text-cream disabled:opacity-50" />
          </label>
        </div>
        {eknBusy && !eknParsed ? (
          <div className="mt-3 text-sm text-muted">Parsujem UO*.vgi a georeferencujem geometriu…</div>
        ) : eknParsed ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-2/40 px-3 py-2.5 text-sm">
            <Icon name="upload" className="text-green" />
            <span className="text-fg"><b>{eknParsed.parcels.length}</b> E-KN parciel pripravených{eknParsed.total > eknParsed.parcels.length ? ` (z ${eknParsed.total})` : ""} · {eknParsed.name}</span>
            <button onClick={() => void doEknImport()} disabled={eknBusy || !eknDs || !canRunPipeline(role)}
              className="ml-auto rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-cream disabled:opacity-50">
              {eknBusy ? "Dopĺňam E-KN…" : "Doplniť E-KN k vybranému k.ú."}
            </button>
          </div>
        ) : null}
        {eknMsg ? <div className="mt-2 text-sm text-fg">{eknMsg}</div> : null}
      </Card>

      <div>
        <SectionHeader title="Zdrojové typy" hint="Read-only prijatie do kontrolovaného lokálneho intake." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((s) => (
            <Card key={s.code} className="p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-brand">{s.code}</span>
                <span className="text-sm font-medium text-fg">{s.label}</span>
              </div>
              <p className="mt-2 text-xs text-muted">{s.desc}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                <Icon name="shield" size={13} /> read-only · lineage evidovaná
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader title="Kanonická pipeline" hint="Poradie krokov intake → readiness." />
          <Card className="divide-y divide-line">
            {PIPELINE.map((step, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-xs text-brand">{i + 1}</span>
                <span className="text-sm text-fg">{step}</span>
              </div>
            ))}
          </Card>
        </div>

        <div>
          <SectionHeader title="Datasety & readiness" hint={canRunPipeline(role) ? "Spusti re-check pre aktuálny stav." : "Rola nemá oprávnenie spúšťať pipeline."} />
          <Card className="divide-y divide-line">
            {datasets.map((d) => {
              const meta = STATUS_META[d.status];
              return (
                <div key={d.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/datasety/$id" params={{ id: d.id }} className="text-sm font-medium text-fg hover:underline">
                      {d.ku_name}
                    </Link>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">coverage {d.geometry_coverage} % · {d.import_version}</span>
                    {canRunPipeline(role) ? (
                      <button
                        onClick={() => recheck(d.id)}
                        disabled={busy === d.id}
                        className="rounded-md border border-line px-2.5 py-1 text-xs text-fg hover:bg-surface-2 disabled:opacity-60"
                      >
                        {busy === d.id ? "…" : "Re-check"}
                      </button>
                    ) : null}
                  </div>
                  {msg[d.id] ? <div className="mt-1 text-xs text-brand">{msg[d.id]}</div> : null}
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      <Disclaimer>
        Chybný alebo neúplný import vytvára len pracovný kontext — nesmie sa interpretovať ako úplný
        kataster. Ak systém niečo nevie overiť, vráti review alebo blocked stav s evidenciou pre ďalší krok.
      </Disclaimer>
    </div>
  );
}
