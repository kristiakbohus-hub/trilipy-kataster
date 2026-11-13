// TRHOVÉ ÚDAJE PRE FINANCIE LISTU NEHNUTEĽNOSTI (2026-11-13) — LEN server. Živo z verejných API bez kľúča, cache 12 h
// v register_cache: ECB MIR (priemerné sadzby nových úverov na bývanie v SR podľa fixácie + RPMN), Euribor 3M (ECB FM),
// inflácia HICP a index cien bývania SR (Eurostat), verejné sadzby bánk (Mac nočný zber → property_facts 000000/financie).
// Adresy overené 2026-11-13 (49_LIST_NEHNUTELNOSTI/financie/research/zdroje_trh.json).
import { bindings } from "./bindings.server";
import type { FinMarket } from "./finance";

async function q<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { DB } = bindings();
  if (!DB) return [];
  const res = await DB.prepare(sql).bind(...args).all<T>();
  return (res.results ?? []) as T[];
}
const UA = { accept: "application/json", "user-agent": "tri-lipy/1.0 (kataster)" };
async function getJson(url: string, ms = 9000): Promise<unknown> {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(to); }
}
type Obs = { period: string; value: number };
/** ECB SDMX-JSON: posledných n pozorovaní radu. */
async function ecb(flowKey: string, n = 1): Promise<Obs[]> {
  const j = (await getJson(`https://data-api.ecb.europa.eu/service/data/${flowKey}?lastNObservations=${n}&format=jsondata`)) as {
    dataSets?: { series?: Record<string, { observations?: Record<string, (number | null)[]> }> }[];
    structure?: { dimensions?: { observation?: { values?: { id: string }[] }[] } } };
  const ser = Object.values(j.dataSets?.[0]?.series ?? {})[0];
  const per = j.structure?.dimensions?.observation?.[0]?.values ?? [];
  return Object.entries(ser?.observations ?? {}).map(([i, v]) => ({ period: per[Number(i)]?.id ?? "", value: Number(v?.[0]) }))
    .filter((o) => o.period && Number.isFinite(o.value)).sort((a, b) => a.period.localeCompare(b.period));
}
/** Eurostat JSON-stat 2.0: rad pre SR (filtre v query), posledných n období. */
async function eurostat(dataset: string, filters: string, n: number): Promise<Obs[]> {
  const j = (await getJson(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?format=JSON&lang=EN&geo=SK&${filters}&lastTimePeriod=${n}`)) as {
    value?: Record<string, number>; dimension?: { time?: { category?: { index?: Record<string, number> } } }; size?: number[] };
  const idx = j.dimension?.time?.category?.index ?? {};
  return Object.entries(idx).map(([period, i]) => ({ period, value: Number(j.value?.[String(i)]) })).filter((o) => Number.isFinite(o.value)).sort((a, b) => a.period.localeCompare(b.period));
}

const MIR = (fix: string, kind = "R") => `MIR/M.SK.B.A2C.${fix}.${kind}.A.2250.EUR.N`;
const RATES: { key: string; label: string; flow: string }[] = [
  { key: "spolu", label: "spolu", flow: MIR("A") },
  { key: "fix_do1", label: "pohyblivá a fixácia do 1 roka", flow: MIR("F") },
  { key: "fix_1_5", label: "fixácia 1–5 rokov", flow: MIR("I") },
  { key: "fix_5_10", label: "fixácia 5–10 rokov", flow: MIR("O") },
  { key: "fix_nad10", label: "fixácia nad 10 rokov", flow: MIR("P") },
];

export async function financeMarketCore(refresh = false): Promise<FinMarket> {
  const key = "fin:market:v1";
  if (!refresh) {
    const row = (await q<{ payload: string; fetched_at: number }>("SELECT payload, fetched_at FROM register_cache WHERE cache_key=?", [key]).catch(() => []))[0];
    if (row && Date.now() / 1000 - row.fetched_at < 12 * 3600) { try { return JSON.parse(row.payload) as FinMarket; } catch { /* znova */ } }
  }
  const errors: string[] = [];
  const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors.push(`${label}: ${(e as Error).message}`); return null; } };
  const [rates, aprc, eur3, hicp, hpi] = await Promise.all([
    Promise.all(RATES.map(async (r) => { const o = await safe(r.key, () => ecb(r.flow)); const last = o?.[o.length - 1]; return last ? { key: r.key, label: r.label, pct: Math.round(last.value * 100) / 100, period: last.period } : null; })),
    safe("rpmn", () => ecb(MIR("A", "C"))),
    safe("euribor", () => ecb("FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA")),
    safe("hicp", () => eurostat("prc_hicp_minr", "coicop18=TOTAL&unit=I25", 13)),
    safe("hpi", () => eurostat("prc_hpi_q", "purchase=TOTAL&unit=I15_Q", 21)),
  ]);
  const last = (o: Obs[] | null) => (o && o.length ? o[o.length - 1] : null);
  const hicpYoy = hicp && hicp.length >= 13 ? { pct: Math.round((hicp[hicp.length - 1].value / hicp[hicp.length - 13].value - 1) * 1000) / 10, period: hicp[hicp.length - 1].period } : null;
  // index cien bývania: priemerný ročný rast za 5 rokov (20 štvrťrokov) — stabilnejší než medziročná zmena
  const hpi5 = hpi && hpi.length >= 21 ? { pct: Math.round((Math.pow(hpi[hpi.length - 1].value / hpi[hpi.length - 21].value, 1 / 5) - 1) * 1000) / 10, period: `${hpi[hpi.length - 21].period}–${hpi[hpi.length - 1].period}` } : null;
  const bankRow = (await q<{ data_json: string; as_of: string | null }>("SELECT data_json, as_of FROM property_facts WHERE kod_ku='000000' AND grp='financie' AND subject_type='ku' AND subject_ref='banky'").catch(() => []))[0];
  let banks: FinMarket["banks"] = []; let banksAsOf: string | null = null;
  if (bankRow) {
    try {
      const j = JSON.parse(bankRow.data_json) as { generated?: string; banky?: { banka: string; url?: string; fixacie?: Record<string, number>; typ?: string; podmienky_sk?: string; ok?: boolean }[] };
      banks = (j.banky ?? []).filter((b) => b.ok && b.fixacie && Object.keys(b.fixacie).length).map((b) => ({ banka: b.banka, url: b.url ?? null, fixacie: b.fixacie ?? {}, typ: b.typ ?? null, podmienky: b.podmienky_sk ?? null }));
      banksAsOf = j.generated ?? bankRow.as_of;
    } catch { errors.push("banky: neplatné údaje"); }
  }
  const a = last(aprc), e = last(eur3);
  const out: FinMarket = {
    asOf: new Date().toISOString(), rates: rates.filter((x): x is NonNullable<typeof x> => !!x),
    aprc: a ? { pct: Math.round(a.value * 100) / 100, period: a.period } : null, euribor3m: e ? { pct: Math.round(e.value * 1000) / 1000, period: e.period } : null,
    hicp: hicpYoy, hpi: hpi5, banks, banksAsOf, errors,
  };
  if (out.rates.length >= 3) {
    const { DB } = bindings();
    await DB?.prepare("INSERT INTO register_cache (cache_key, kind, payload, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, kind=excluded.kind")
      .bind(key, "fin", JSON.stringify(out), Math.floor(Date.now() / 1000)).run().catch(() => {});
  }
  return out;
}
