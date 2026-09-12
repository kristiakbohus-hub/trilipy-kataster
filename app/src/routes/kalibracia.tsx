import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getCalib, setCalib, resetCalib, type CalibRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/kalibracia")({
  head: () => ({ meta: [{ title: "Kalibrácia AVM/GDV — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await getCalib().catch((): CalibRow[] => []),
  component: KalibraciaPage,
});

const CAT_META: { key: string; title: string; hint: string }[] = [
  { key: "ag_base", title: "Poľnohospodárska / lesná pôda", hint: "základ €/m² podľa druhu (nezastavané pozemky)" },
  { key: "region", title: "Regionálne faktory", hint: "násobiteľ ceny pôdy podľa typu okresu" },
  { key: "dev", title: "Development (GDV / marža)", hint: "náklady, predajné ceny a plocha na jednotku" },
  { key: "discount", title: "Zľavy", hint: "úpravy odhadu" },
];

function KalibraciaPage() {
  const initial = Route.useLoaderData();
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState<CalibRow[]>(initial);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((r) => [r.key, String(r.value)])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getCalib().then((r) => { setRows(r); setVals(Object.fromEntries(r.map((x) => [x.key, String(x.value)]))); }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function save(key: string) {
    if (!token) return;
    const value = Number(vals[key]);
    if (!Number.isFinite(value)) { setMsg("Neplatné číslo."); return; }
    setBusy(key);
    try {
      const r = await setCalib({ data: { token, key, value } });
      setMsg(r.ok ? `Uložené: ${key} = ${value}` : (r.message ?? "Zlyhalo."));
      if (r.ok) refresh();
    } finally { setBusy(null); }
  }
  async function reset(key?: string) {
    if (!token) return;
    if (!key && !window.confirm("Vrátiť VŠETKY sadzby na kódové defaulty?")) return;
    setBusy(key ?? "__all__");
    try {
      const r = await resetCalib({ data: { token, key } });
      setMsg(r.ok ? (key ? `Reset: ${key}` : `Reset všetkého (${r.reset ?? 0} položiek)`) : (r.message ?? "Zlyhalo."));
      if (r.ok) refresh();
    } finally { setBusy(null); }
  }

  const eur = (n: number) => n.toLocaleString("sk-SK", { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Kalibrácia AVM / GDV</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Lokálne sadzby, náklady a ceny pre odhad hodnoty (AVM) a development (GDV) — editovateľné bez zásahu do kódu.
            Zmeny platia okamžite pre nové výpočty. Zastavané pozemky sa oceňujú z reálnych inzerátov (tie sa tu nekalibrujú).
          </p>
        </div>
        {isAdmin ? (
          <button onClick={() => void reset()} disabled={busy != null} className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:border-ink disabled:opacity-50">Reset všetko</button>
        ) : null}
      </div>

      {!token ? (
        <Card className="p-4"><div className="py-4 text-sm text-muted">Prihlás sa.</div></Card>
      ) : !isAdmin ? (
        <Card className="p-4"><div className="py-4 text-sm text-muted">Kalibráciu môže meniť len <b className="text-fg">admin</b>. Aktuálne hodnoty sú nižšie (len na čítanie).</div></Card>
      ) : null}

      {msg ? <div className="rounded-md border border-line bg-surface/60 px-3 py-2 text-sm text-fg">{msg}</div> : null}

      {CAT_META.map((cat) => {
        const catRows = rows.filter((r) => r.category === cat.key);
        if (!catRows.length) return null;
        return (
          <Card key={cat.key} className="p-4">
            <SectionHeader title={cat.title} hint={cat.hint} />
            <div className="mt-2 divide-y divide-line">
              {catRows.map((r) => {
                const dirty = vals[r.key] !== String(r.value);
                const changedFromDefault = r.default_value != null && r.value !== r.default_value;
                return (
                  <div key={r.key} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-fg">{r.label ?? r.key}</div>
                      <div className="text-[11px] text-muted">
                        {r.key}{r.updated_by ? ` · zmenil ${r.updated_by}${r.updated_at ? ` (${r.updated_at.slice(0, 10)})` : ""}` : ""}
                        {changedFromDefault ? <span> · default {eur(r.default_value as number)}</span> : null}
                      </div>
                    </div>
                    <input
                      type="number" step="any" inputMode="decimal"
                      value={vals[r.key] ?? ""}
                      disabled={!isAdmin}
                      onChange={(e) => setVals((v) => ({ ...v, [r.key]: e.target.value }))}
                      className="w-24 rounded-md border border-line bg-paper px-2 py-1 text-right text-sm tabular-nums text-fg disabled:opacity-60"
                    />
                    <span className="w-16 text-[11px] text-muted">{r.unit ?? ""}</span>
                    {isAdmin ? (
                      <>
                        <button onClick={() => void save(r.key)} disabled={!dirty || busy === r.key} className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-cream disabled:opacity-40">{busy === r.key ? "…" : "Uložiť"}</button>
                        <button onClick={() => void reset(r.key)} disabled={!changedFromDefault || busy === r.key} title="Späť na default" className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-30">Reset</button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <div className="text-[11px] text-muted">
        Odhady sú orientačné (nie znalecký posudok). Regionálne faktory a agri základy vychádzajú z verejných štatistík cien pôdy;
        development náklady/ceny doplň podľa reálnych lokálnych čísel. BPEJ krivka, veľkostná zľava a hranice trhových porovnaní ostávajú v kóde (pokročilé).
      </div>
    </div>
  );
}
