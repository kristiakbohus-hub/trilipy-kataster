import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDataSanity, type SanityCheck } from "../lib/api/kataster.functions";
import { Card, Disclaimer, SectionHeader, Stat } from "../components/kit";

// BEZ `loader` — beží počas SSR pred prihlasovacou bránou (viď pamäť cf_app_ssr_loader_leak).
export const Route = createFileRoute("/kontrola")({
  head: () => ({ meta: [{ title: "Kontrola dát — TRI LIPY KATASTER CORE" }] }),
  component: KontrolaPage,
});

const META: Record<string, { label: string; color: string }> = {
  ok: { label: "v poriadku", color: "#5b7a58" },
  warn: { label: "pozrieť", color: "#9a7b3e" },
  fail: { label: "rozpor", color: "#9c4a40" },
};

function KontrolaPage() {
  const [rows, setRows] = useState<SanityCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDataSanity().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const nFail = rows.filter((r) => r.level === "fail").length;
  const nWarn = rows.filter((r) => r.level === "warn").length;
  const nOk = rows.filter((r) => r.level === "ok").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Kontrola dát</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Hľadá miesta, kde si appka <b>protirečí</b> — dve hodnoty, ktoré nemôžu byť obe správne.
          Nie je to kontrola, či sú dáta pravdivé; to z vnútra zistiť nejde. Je to kontrola, či sú
          <b> konzistentné</b>.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Rozpory" value={nFail} />
        <Stat label="Pozrieť" value={nWarn} />
        <Stat label="V poriadku" value={nOk} />
      </div>

      <SectionHeader title="Kontroly" hint="každá vznikla z chyby, ktorá raz naozaj prešla" />

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">Prebieha kontrola…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">Kontroly sa nepodarilo spustiť.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {[...rows].sort((a, b) =>
            (b.level === "fail" ? 2 : b.level === "warn" ? 1 : 0) -
            (a.level === "fail" ? 2 : a.level === "warn" ? 1 : 0)
          ).map((r) => {
            const m = META[r.level];
            return (
              <div key={r.key} className="flex flex-wrap items-start gap-3 p-4">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">{r.title}</span>
                    <span className="rounded-full border px-2 py-0.5 text-[11px]"
                      style={{ color: m.color, borderColor: m.color + "55" }}>{m.label}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{r.detail}</p>
                  {r.sample ? (
                    <p className="mt-1 break-words font-mono text-[11px] text-muted">{r.sample}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums"
                  style={{ color: r.n > 0 ? m.color : "#8a8a8a" }}>{r.n}</span>
              </div>
            );
          })}
        </Card>
      )}

      <Disclaimer>
        Nula pri kontrole znamená, že tento konkrétny rozpor sa nenašel — nie že sú dáta správne.
        Kontroly vidia len to, čo je v databáze appky; či raster územného plánu súhlasí so skutočnosťou
        alebo či import zachytil celé k.ú., odtiaľ zistiť nejde.
      </Disclaimer>
    </div>
  );
}
