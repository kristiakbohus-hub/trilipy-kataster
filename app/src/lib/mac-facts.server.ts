// Rozšírené údaje listu nehnuteľnosti z Macu (2026-11-21, rozhodnutie vlastníka „Cloudflare ako záloha“).
// D1 drží jadro (parcely, LV, vlastníci, scenáre, ÚP); objemné skupiny po parcelách (terén, slnko, OSM, susedia,
// prístup…) bývajú na Macu (49_LIST_NEHNUTELNOSTI/mac_facts) a Worker si ich pýta cez Cloudflare Tunnel.
// Keď Mac nebeží, list sa zobrazí bez nich (factsOffline). LEN serverový modul — exportovaná funkcia s DB
// v kataster.functions.ts by sa dostala do klientskeho balíka (build gotcha).
import { bindings } from "./bindings.server";

// skupiny, ktoré bývajú na Macu — zhodne s mac_facts/store.py MAC_GROUPS
export const MAC_GROUPS = ["teren", "slnko", "osm", "susedia", "pristup", "adresa", "bpej", "mapa", "vlastnici",
  "uzivatel", "stavby", "budovy", "nkp"] as const;
const MAC_SET = new Set<string>(MAC_GROUPS);
const TIMEOUT_MS = 3000;

async function q<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { DB } = bindings();
  if (!DB) return [];
  const res = await DB.prepare(sql).bind(...args).all<T>();
  return (res.results ?? []) as T[];
}

function eq(a: string, b: string | undefined): boolean {
  if (!b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}
/** Rovnaké pravidlo ako ingestSecretOk(scope „mac“) v kataster.functions.ts: platí len kľúč Macu (SHA-256 v D1). */
async function macSecretOk(secret: string): Promise<boolean> {
  if (!secret) return false;
  const rows = await q<{ key: string; value: string }>(
    "SELECT key, value FROM market_meta WHERE key IN ('alert_secret','ingest_secret_sha256')").catch(() => []);
  const m = new Map(rows.map((r): [string, string] => [r.key, r.value]));
  const macHash = m.get("ingest_secret_sha256");
  if (macHash) return eq(await sha256Hex(secret), macHash);
  return eq(secret, m.get("alert_secret"));
}

type Conf = { url: string; key: string } | null;
let confCache: { at: number; v: Conf } | null = null;
async function macConf(): Promise<Conf> {
  if (confCache && Date.now() - confCache.at < 60_000) return confCache.v;
  const rows = await q<{ key: string; value: string }>(
    "SELECT key, value FROM market_meta WHERE key IN ('mac_facts_url','mac_facts_key')").catch(() => []);
  const m = new Map(rows.map((r): [string, string] => [r.key, r.value]));
  const url = m.get("mac_facts_url") ?? ""; const key = m.get("mac_facts_key") ?? "";
  const v: Conf = /^https:\/\/[a-z0-9.-]+$/.test(url) && key.length >= 20 ? { url, key } : null;
  confCache = { at: Date.now(), v };
  return v;
}

export type MacFactRow = { subject_type: string; subject_ref: string; grp: string; data_json: string; source: string | null; as_of: string | null };

/** Údaje z Macu pre subjekty listu. configured=false → Mac ešte nie je napojený (nič sa nehlási). */
export async function fetchMacFacts(kod: string, subjects: [string, string[]][]): Promise<{ rows: MacFactRow[]; configured: boolean; offline: boolean }> {
  const conf = await macConf();
  if (!conf) return { rows: [], configured: false, offline: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${conf.url}/facts`, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-mac-key": conf.key },
      body: JSON.stringify({ kod, subjects: subjects.filter(([, refs]) => refs.length > 0), groups: MAC_GROUPS }),
    });
    if (!res.ok) return { rows: [], configured: true, offline: true };
    const j = (await res.json()) as { ok?: boolean; rows?: MacFactRow[] };
    return { rows: j.ok && Array.isArray(j.rows) ? j.rows.filter((r) => MAC_SET.has(r.grp)) : [], configured: true, offline: !j.ok };
  } catch {
    return { rows: [], configured: true, offline: true };
  } finally {
    clearTimeout(timer);
  }
}

type AdminBody = { secret?: string; action?: string; url?: string; key?: string; kodKu?: string; grp?: string;
  afterType?: string; afterRef?: string; limit?: number; confirm?: string };

/** Správa prepojenia s Macom — volá LEN Mac kľúčom (route /api/mac-facts). Akcie:
 *  conf (uloží adresu tunela a kľúč), status, groups (počty riadkov objemných skupín v D1),
 *  export (stránkovaný výpis skupiny k.ú. z D1 pre prenos na Mac), purge (zmaže skupinu k.ú. z D1 — len s confirm „ZMAZAT“). */
export async function macFactsAdmin(b: AdminBody): Promise<Record<string, unknown>> {
  if (!(await macSecretOk(String(b.secret ?? "")))) return { ok: false, message: "unauthorized" };
  const { DB } = bindings();
  if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
  const kod = String(b.kodKu ?? ""); const grp = String(b.grp ?? "");
  const kodOk = /^\d{6}$/.test(kod); const grpOk = MAC_SET.has(grp);
  switch (b.action) {
    case "conf": {
      const url = String(b.url ?? ""); const key = String(b.key ?? "");
      if (!/^https:\/\/[a-z0-9.-]+$/.test(url) || key.length < 20) return { ok: false, message: "Neplatná adresa alebo kľúč." };
      const pairs: [string, string][] = [["mac_facts_url", url], ["mac_facts_key", key]];
      for (const [k, v] of pairs)
        await DB.prepare("INSERT INTO market_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, v).run();
      confCache = null;
      return { ok: true };
    }
    case "status": {
      const conf = await macConf();
      if (!conf) return { ok: true, configured: false };
      const r = await fetchMacFacts("000000", [["ku", ["000000"]]]);
      return { ok: true, configured: true, reachable: !r.offline, url: conf.url };
    }
    case "groups": {
      const ph = MAC_GROUPS.map(() => "?").join(",");
      const rows = await q<{ kod_ku: string; grp: string; n: number }>(
        `SELECT kod_ku, grp, COUNT(*) AS n FROM property_facts WHERE grp IN (${ph}) GROUP BY kod_ku, grp ORDER BY kod_ku, grp`, [...MAC_GROUPS]);
      return { ok: true, rows };
    }
    case "export": {
      if (!kodOk || !grpOk) return { ok: false, message: "kodKu/grp" };
      const lim = Math.min(Math.max(Number(b.limit) || 1000, 1), 2000);
      const rows = await q<MacFactRow>(
        "SELECT subject_type, subject_ref, grp, data_json, source, as_of FROM property_facts WHERE kod_ku=? AND grp=? AND (subject_type, subject_ref) > (?, ?) ORDER BY subject_type, subject_ref LIMIT ?",
        [kod, grp, String(b.afterType ?? ""), String(b.afterRef ?? ""), lim]);
      return { ok: true, rows, done: rows.length < lim };
    }
    case "purge": {
      if (!kodOk || !grpOk || b.confirm !== "ZMAZAT") return { ok: false, message: "kodKu/grp/confirm" };
      const r = await DB.prepare("DELETE FROM property_facts WHERE kod_ku=? AND grp=?").bind(kod, grp).run();
      return { ok: true, deleted: r.meta?.changes ?? null };
    }
    default:
      return { ok: false, message: "action" };
  }
}
