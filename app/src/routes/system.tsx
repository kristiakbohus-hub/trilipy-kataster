import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { exportBackup, getSystemStatus, egressSelfTest } from "../lib/api/kataster.functions";
import { Badge, Card, Disclaimer, Icon, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/system")({
  head: () => ({ meta: [{ title: "System Status — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getSystemStatus(),
  component: SystemPage,
});

function SystemPage() {
  const s = Route.useLoaderData();
  const { role } = useRole();
  const [bkBusy, setBkBusy] = useState(false);
  const [bkMsg, setBkMsg] = useState<string | null>(null);
  const canBackup = role === "admin" || role === "manager";

  type EgRes = Awaited<ReturnType<typeof egressSelfTest>>;
  const [egBusy, setEgBusy] = useState(false);
  const [egRes, setEgRes] = useState<EgRes | null>(null);
  async function runEgress() {
    setEgBusy(true); setEgRes(null);
    try { setEgRes(await egressSelfTest({ data: { role } })); }
    catch (e) { setEgRes({ allowed: true, anyOk: false, probes: [{ id: "err", label: "Chyba volania", ok: false, status: null, ms: 0, sample: null, error: e instanceof Error ? e.message : String(e) }] }); }
    finally { setEgBusy(false); }
  }

  async function backup() {
    setBkBusy(true); setBkMsg(null);
    try {
      const r = await exportBackup({ data: { role } });
      if (r.ok && r.json) {
        const blob = new Blob([r.json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `tri-lipy-zaloha-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
        setBkMsg("Záloha stiahnutá.");
      } else setBkMsg(r.message ?? "Neúspešné.");
    } finally { setBkBusy(false); }
  }
  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-fg">System Status</h1>
          <Badge color="#9a7b3e">{s.releaseReadiness}</Badge>
          <Badge color="#9c4a40">{s.handoff}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          Prevádzkový stav, bezpečnostné pravidlá a release readiness. Verzia {s.version} · build {s.build}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Datasety" value={s.counts.datasets} />
        <Stat label="Parcely" value={s.counts.parcels} />
        <Stat label="LV" value={s.counts.lvs} />
        <Stat label="Vlastníci" value={s.counts.owners} />
        <Stat label="Cases" value={s.counts.cases} />
        <Stat label="Reporty" value={s.counts.reports} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader title="Služby a runtime" />
          <Card className="divide-y divide-line">
            {s.services.map((sv) => (
              <div key={sv.key} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: sv.ok ? "#5b7a58" : "#9c4a40" }} />
                  <span className="text-sm text-fg">{sv.label}</span>
                </div>
                <span className="text-xs text-muted">{sv.detail}</span>
              </div>
            ))}
          </Card>
        </div>
        <div>
          <SectionHeader title="Bezpečnostné pravidlá" hint="Neobíditeľné pravidlá vízie." />
          <Card className="divide-y divide-line">
            {s.safety.map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-3 text-sm">
                <Icon name="shield" size={15} className="text-green" />
                <span className="text-fg">{r.label}</span>
                <span className="ml-auto text-xs" style={{ color: "#5b7a58" }}>OK</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div>
        <SectionHeader title="Blockery / known issues" hint="Otvorene evidované, nezakryté percentom." />
        <Card className="divide-y divide-line">
          {s.blockers.map((b) => (
            <div key={b.key} className="flex items-start gap-3 p-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: b.severity === "warning" ? "#9a7b3e" : "#9c4a40" }} />
              <span className="text-sm text-fg">{b.label}</span>
              <Badge color={b.severity === "warning" ? "#9a7b3e" : "#9c4a40"}>{b.severity}</Badge>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionHeader title="Zálohovanie & prevádzka" hint="Export celej D1 databázy na stiahnutie (JSON). Len admin / manažér." />
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => void backup()} disabled={!canBackup || bkBusy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
              {bkBusy ? "Exportujem…" : "Stiahnuť zálohu (JSON)"}
            </button>
            <span className="text-xs text-muted">
              {canBackup ? "Kompletný snapshot všetkých tabuliek (datasety, LV, vlastníci, signály, dealy, audit…). Uchovaj bezpečne — obsahuje owner-sensitive údaje." : `Rola ${role} nemá oprávnenie zálohovať.`}
            </span>
          </div>
          {bkMsg ? <div className="mt-2 text-sm text-muted">{bkMsg}</div> : null}
        </Card>
      </div>

      <div>
        <SectionHeader title="Registre — test egress (Bod B)" hint="Overí, či Worker dokáže volať verejné registre (RPO / RPVS / Obchodný vestník). Len admin / manažér." />
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => void runEgress()} disabled={!canBackup || egBusy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
              {egBusy ? "Testujem…" : "Spustiť test egress"}
            </button>
            <span className="text-xs text-muted">
              {canBackup ? "Odblokuje smerovanie registrov: ak Worker dokáže outbound fetch, pôjdeme naživo + cache; inak skript-fallback." : `Rola ${role} nemá oprávnenie.`}
            </span>
          </div>
          {egRes ? (
            !egRes.allowed ? (
              <div className="mt-3 text-sm text-muted">Rola nemá oprávnenie spustiť test.</div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="text-sm">
                  Výsledok:{" "}
                  <Badge color={egRes.anyOk ? "#5b7a58" : "#a05252"}>
                    {egRes.anyOk ? "EGRESS FUNGUJE — ideme naživo + cache" : "EGRESS BLOKOVANÝ — skript-fallback"}
                  </Badge>
                </div>
                <div className="divide-y divide-line rounded-md border border-line">
                  {egRes.probes.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-fg">{p.label}</div>
                        {p.error ? <div className="text-xs text-muted">{p.error}</div> : p.sample ? <div className="truncate text-xs text-muted" style={{ maxWidth: 420 }}>{p.sample}</div> : null}
                      </div>
                      <div className="whitespace-nowrap text-right text-xs">
                        <span style={{ color: p.ok ? "#5b7a58" : "#a05252" }}>{p.ok ? `OK ${p.status ?? ""}` : `zlyhalo${p.status ? ` ${p.status}` : ""}`}</span>
                        <div className="text-muted">{p.ms} ms</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : null}
        </Card>
      </div>

      <Disclaimer>
        Release readiness sa meria podľa funkčného pracovného toku a pravdivosti runtime, nie počtu fáz. Kým platí
        blocked_for_handoff (demo prihlásenie), balík nie je pripravený na odovzdanie ďalšiemu používateľovi.
        Záloha obsahuje osobné údaje (mená, dátumy narodenia, adresy) — narábaj s ňou podľa GDPR.
      </Disclaimer>
    </div>
  );
}
