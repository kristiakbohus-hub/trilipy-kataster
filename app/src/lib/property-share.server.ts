// Verejný list nehnuteľnosti pre klienta (/n/<token>) — LEN serverový modul pre route /api/property-share (bez session).
// Samostatne, nie v kataster.functions.ts (exportovaná funkcia s DB by sa dostala do klientskeho balíka).
// Vracia očistený snapshot uložený pri zdieľaní (mená vlastníkov len ako mená, bez internej práce); platnosť a zrušenie stráži tabuľka.
import { bindings } from "./bindings.server";
import { financeMarketCore } from "./fin-market.server";
import { clientizeCore } from "./share-client";

async function q<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { DB } = bindings();
  if (!DB) return [];
  const res = await DB.prepare(sql).bind(...args).all<T>();
  return (res.results ?? []) as T[];
}

export type PublicProperty = { ok: boolean; message?: string; title?: string; expiresAt?: string; snapshot?: unknown };
export async function publicPropertyCore(share: string): Promise<PublicProperty> {
  if (!/^[0-9a-f]{32}$/.test(share)) return { ok: false, message: "Neplatný odkaz." };
  const r = (await q<{ title: string | null; snapshot: string; expires_at: string; revoked: number; live: number }>(
    "SELECT title, snapshot, expires_at, revoked, (expires_at > datetime('now')) live FROM property_shares WHERE token=?", [share]).catch(() => []))[0];
  if (!r || r.revoked || !r.live) return { ok: false, message: "Odkaz neplatí (vypršal alebo bol zrušený). Požiadajte o nový." };
  await q("UPDATE property_shares SET views = views + 1, last_view = datetime('now') WHERE token=?", [share]).catch(() => {});
  let snapshot: unknown = null;
  try { snapshot = JSON.parse(r.snapshot); } catch { return { ok: false, message: "List sa nepodarilo načítať." }; }
  // aj snímky uložené pred 13. 11. 2026: jednotlivé zmluvy s cenou, inzeráty a LV susedov von (idempotentné)
  const core = snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>).core : null;
  if (core && typeof core === "object" && !Array.isArray(core)) clientizeCore(core as Record<string, unknown>);
  // financie vždy aktuálne: sadzby a ceny sa pri otvorení načítajú znova (verejné trhové údaje, cache 12 h)
  if (snapshot && typeof snapshot === "object") { const fresh = await financeMarketCore().catch(() => null); if (fresh && fresh.rates.length) (snapshot as Record<string, unknown>).fin = fresh; }
  return { ok: true, title: r.title ?? "List nehnuteľnosti", expiresAt: r.expires_at, snapshot };
}
