import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createScenarioVariant, getScenarioSwitches,
  type ScenarioParamDef, type ScenarioSchema, type ScenarioVariant,
} from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { useRole } from "../lib/role-context";
import { Card } from "./kit";

// PREPÍNAČE GOLD SCENÁROV (0117, 2026-11-13). Zoznam prepínačov publikuje engine na Macu (typ, rozsah, jednotka,
// pôvod hodnoty) — karta ho len vykreslí. „Prepočítať“ založí variant; Mac ho do pár minút prepočíta tým istým
// enginom a karta potom ukáže jeho výsledky. Predvolený výsledok scenára sa nemení.

type Vals = Record<string, number | boolean>;

const fmtParam = (p: ScenarioParamDef, v: number | boolean | undefined) =>
  p.type === "bool" ? (v ? "áno" : "nie") : `${v ?? "—"}${p.unit ? ` ${p.unit}` : ""}`;

/** Krátky popis variantu: len parametre odlišné od predvolených. */
export function variantSummary(schema: ScenarioSchema | null, paramsJson: string | null | undefined): string {
  if (!schema || !paramsJson) return "";
  let v: Vals = {};
  try { v = JSON.parse(paramsJson) as Vals; } catch { return ""; }
  const diff = schema.params.filter((p) => v[p.key] !== undefined && v[p.key] !== p.default);
  return diff.length ? diff.map((p) => `${p.label}: ${fmtParam(p, v[p.key])}`).join(" · ") : "rovnaké ako predvolené";
}

export function variantParams(v: ScenarioVariant | null | undefined): Vals {
  if (!v) return {};
  try { return JSON.parse(v.params_json) as Vals; } catch { return {}; }
}

const STATUS: Record<string, string> = { pending: "čaká na Mac", running: "počíta sa", done: "hotové", failed: "zlyhalo" };

export function ScenarioSwitches({ scenario, selected, onSelect, onVariants }: {
  scenario: "ZA" | "GOLD19" | "GOLD04" | "UP" | "BU";
  selected: number | null;
  onSelect: (id: number | null, v: ScenarioVariant | null, schema: ScenarioSchema | null) => void;
  /** scenár bez vlastnej tabuľky (GOLD19): karta si z variantov nájde predvolený beh */
  onVariants?: (variants: ScenarioVariant[], schema: ScenarioSchema | null) => void;
}) {
  const { token } = useAuth();
  const { role } = useRole();
  const [schema, setSchema] = useState<ScenarioSchema | null>(null);
  const [variants, setVariants] = useState<ScenarioVariant[]>([]);
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Vals>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getScenarioSwitches({ data: { scenario } }).then((r) => {
      setSchema(r.schema);
      setVariants(r.variants);
      onVariants?.(r.variants, r.schema);
      setVals((cur) => (Object.keys(cur).length || !r.schema ? cur : Object.fromEntries(r.schema.params.map((p) => [p.key, p.default]))));
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);
  useEffect(() => { load(); }, [load]);
  // kým niečo čaká alebo beží, obnovovať stav
  const waiting = variants.some((v) => v.status === "pending" || v.status === "running");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const cur = useMemo(() => variants.find((v) => v.id === selected) ?? null, [variants, selected]);
  // keď sa vybraný variant dopočíta, dať vedieť karte (načíta výsledky)
  useEffect(() => { if (cur) onSelect(cur.id, cur, schema); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cur?.status]);

  const canRun = role !== "viewer" && role !== "external_readonly";

  async function run() {
    if (!schema || !token) return;
    setBusy(true); setMsg(null);
    try {
      const label = variantSummary(schema, JSON.stringify(vals));
      const r = await createScenarioVariant({ data: { token, scenario, params: vals, label } });
      if (!r.ok || !r.id) { setMsg(r.message ?? "Nepodarilo sa založiť prepočet."); return; }
      setMsg(r.existing ? "Toto nastavenie už bolo zadané — zobrazujem ho." : "Zadané. Mac ho prepočíta do pár minút; stav sa tu obnovuje.");
      const got = await getScenarioSwitches({ data: { scenario } });
      setVariants(got.variants);
      const v = got.variants.find((x) => x.id === r.id) ?? null;
      onSelect(r.id, v, schema);
    } finally { setBusy(false); }
  }

  if (!schema) {
    return (
      <Card className="p-3 text-xs text-muted">
        Prepínače: engine na Macu ešte nezverejnil zoznam nastavení pre tento scenár (urobí to pri najbližšom behu).
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">Nastavenie</span>
        <select
          value={selected ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            onSelect(id, variants.find((v) => v.id === id) ?? null, schema);
          }}
          className="max-w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg"
        >
          <option value="">Predvolené{schema.defaultLabel ? ` — ${schema.defaultLabel}` : ""}</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.status !== "done"}>
              #{v.id} · {(v.label || variantSummary(schema, v.params_json)).slice(0, 90)} · {STATUS[v.status] ?? v.status}
              {v.status === "done" && v.n_match !== null ? ` (${v.n_match} zhôd)` : ""}
            </option>
          ))}
        </select>
        <button onClick={() => setOpen((o) => !o)} className="ml-auto rounded-md border border-line px-2.5 py-1 text-fg hover:bg-surface-2">
          {open ? "Skryť prepínače" : "Zmeniť nastavenie"}
        </button>
      </div>
      {cur && cur.status !== "done" ? (
        <p className="text-muted">
          Variant #{cur.id}: {STATUS[cur.status] ?? cur.status}{cur.progress ? ` — ${cur.progress}` : ""}{cur.error ? ` — ${cur.error}` : ""}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {schema.params.map((p) => (
              <label key={p.key} className="flex flex-col gap-1" title={p.origin ?? undefined}>
                <span className="text-fg">{p.label}{p.unit ? <span className="text-muted"> ({p.unit})</span> : null}</span>
                {p.type === "bool" ? (
                  <span className="flex items-center gap-2 text-muted">
                    <input type="checkbox" checked={!!vals[p.key]} onChange={(e) => setVals((v) => ({ ...v, [p.key]: e.target.checked }))} />
                    {vals[p.key] ? "áno" : "nie"}{vals[p.key] !== p.default ? " · zmenené" : ""}
                  </span>
                ) : (
                  <input
                    type="number" value={String(vals[p.key] ?? "")} min={p.min} max={p.max} step={p.step ?? (p.type === "int" ? 1 : "any")}
                    onChange={(e) => setVals((v) => ({ ...v, [p.key]: e.target.value === "" ? p.default : Number(e.target.value) }))}
                    className="w-full rounded-md border border-line bg-paper px-2 py-1 text-fg tabular-nums"
                  />
                )}
                {p.help || p.origin ? <span className="text-[11px] leading-snug text-muted">{p.help ?? p.origin}</span> : null}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRun ? (
              <button onClick={() => void run()} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 font-medium text-cream disabled:opacity-50">
                {busy ? "Zadávam…" : "Prepočítať s týmto nastavením"}
              </button>
            ) : <span className="text-muted">Prepočet môže zadať analytik alebo správca.</span>}
            <button onClick={() => setVals(Object.fromEntries(schema.params.map((p) => [p.key, p.default])))} className="rounded-md border border-line px-3 py-1.5 text-fg hover:bg-surface-2">
              Vrátiť predvolené
            </button>
            {msg ? <span className="text-muted">{msg}</span> : null}
          </div>
          <p className="text-[11px] text-muted">
            Prepočet robí ten istý engine na Macu (zvyčajne do 5 minút). Predvolený výsledok sa nemení; každé nastavenie
            ostáva uložené ako variant a dá sa k nemu vrátiť.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/** Riadok variantu (tvar push skriptu z Macu, camelCase) → tvar riadku karty z D1 (snake_case) + dataset/k.ú. zo servera. */
export function variantRowSnake(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("_")) continue;
    out[k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  out.dataset_id = r._datasetId ?? null;
  if (r._kuName) out.ku_name = r._kuName;
  return out;
}
