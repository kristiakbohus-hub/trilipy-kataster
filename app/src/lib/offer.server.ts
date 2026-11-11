// Verejná ponuka pre klienta (bod 10, 2026-11-11) — LEN serverový modul pre route /api/offer (bez session).
// Samostatne, nie v kataster.functions.ts: exportovaná obyčajná funkcia s prístupom k DB by sa dostala do
// klientskeho balíka a build padne („Importer … bindings.server"). Žiadne mená, žiadny kontakt — len snapshot.
import { bindings } from "./bindings.server";
import type { BuyerHit, BuyerRequest, PublicOffer } from "./api/kataster.functions";

async function q<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { DB } = bindings();
  if (!DB) return [];
  const res = await DB.prepare(sql).bind(...args).all<T>();
  return (res.results ?? []) as T[];
}

/** Volá LEN serverová route /api/offer (bez session). Vracia snapshot položiek; žiadne mená, žiadny kontakt. */
export async function publicOfferCore(share: string): Promise<PublicOffer> {
  if (!/^[0-9a-f]{32}$/.test(share)) return { ok: false, message: "Neplatný odkaz." };
  const sh = (await q<{ request_id: number; expires_at: string; revoked: number; live: number }>(
    "SELECT request_id, expires_at, revoked, (expires_at > datetime('now')) live FROM offer_shares WHERE token=?", [share]).catch(() => []))[0];
  if (!sh || sh.revoked || !sh.live) return { ok: false, message: "Odkaz neplatí (vypršal alebo bol zrušený). Požiadajte o nový." };
  const r = (await q<BuyerRequest>("SELECT * FROM buyer_requests WHERE id=?", [sh.request_id]))[0];
  if (!r) return { ok: false, message: "Ponuka už neexistuje." };
  const rows = await q<{ snapshot: string | null }>(
    "SELECT snapshot FROM buyer_match_status WHERE request_id=? AND status IN ('vybrana','poslana','zaujem','obhliadka') ORDER BY updated_at", [sh.request_id]).catch(() => []);
  const items: BuyerHit[] = [];
  for (const x of rows) { try { const h = x.snapshot ? (JSON.parse(x.snapshot) as BuyerHit) : null; if (h) items.push({ ...h, status: "nova", statusReason: null, statusNote: null }); } catch { /* poškodený snapshot */ } }
  await q("UPDATE offer_shares SET views = views + 1, last_view = datetime('now') WHERE token=?", [share]).catch(() => {});
  const PT: Record<string, string> = { pozemok: "pozemok", byt: "byt", dom: "dom", chata: "chata / chalupa", komercne: "komerčný priestor" };
  const summary = [`Hľadáte: ${PT[r.ptype] ?? r.ptype}`, r.area_min != null || r.area_max != null ? `${r.area_min ?? ""}–${r.area_max ?? ""} m²` : null,
    r.budget_max != null ? `do ${Math.round(r.budget_max).toLocaleString("sk-SK")} €` : null, r.locations].filter(Boolean).join(" · ");
  return { ok: true, heading: "Ponuka nehnuteľností", summary, expiresAt: sh.expires_at, items };
}

