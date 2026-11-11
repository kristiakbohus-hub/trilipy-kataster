import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "../bindings.server";
import type {
  AuditRow,
  Case,
  CaseNote,
  Dataset,
  GeometryQuality,
  ImportJob,
  Lv,
  LvOwner,
  Opportunity,
  Owner,
  Parcel,
  ReportRow,
  SearchLv,
  SearchOwner,
  SearchParcel,
  ZoningFinding,
  ZoningSource,
} from "../domain";
import { phraseIssues, type PhraseIssue } from "../phrases";
import { accessTimesLabel, plural, zoneLabel, canExport, canRunPipeline, canSeeOwners, canSign, ownerAccess, parcelLabel, type OwnerAccess, type Role } from "../domain";
import { regulativByCode } from "../development";

const roleSchema = z.enum([
  "admin",
  "manager",
  "geodet",
  "analytik",
  "real_estate",
  "viewer",
  "external_readonly",
]);

async function q<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const { DB } = bindings();
  if (!DB) return [];
  const res = await DB.prepare(sql).bind(...args).all<T>();
  return (res.results ?? []) as T[];
}

async function logAudit(action: string, role: string, detail: string, datasetId?: string) {
  const { DB } = bindings();
  if (!DB) return;
  await DB.prepare(
    "INSERT INTO audit_log (dataset_id, action, actor_role, detail) VALUES (?, ?, ?, ?)",
  )
    .bind(datasetId ?? null, action, role, detail)
    .run();
}

// ——— Prehľad (Mission Control) ———
export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const datasets = await q<Dataset>("SELECT * FROM datasets ORDER BY status, ku_name");
  const counts = {
    datasets: datasets.length,
    ready: datasets.filter((d) => d.status === "ready").length,
    warnings: datasets.filter((d) => d.status === "ready_with_warnings").length,
    blocked: datasets.filter((d) => d.status === "blocked").length,
    // Predpočítané (0062): namiesto COUNT(*) skenu ~180k parciel sčítame malé stĺpce z už načítaných datasetov.
    parcels: datasets.reduce((a, d) => a + (d.n_parcels ?? 0), 0),
    opportunities: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM opportunities"))[0]?.n ?? 0,
    reports: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM reports"))[0]?.n ?? 0,
  };
  const avgCoverage = datasets.length
    ? Math.round(datasets.reduce((a, d) => a + d.geometry_coverage, 0) / datasets.length)
    : 0;
  const recentAudit = await q<AuditRow>("SELECT * FROM audit_log ORDER BY id DESC LIMIT 8");
  return { datasets, counts, avgCoverage, recentAudit };
});

export const getDatasets = createServerFn({ method: "GET" }).handler(async () => {
  return await q<Dataset>("SELECT * FROM datasets ORDER BY status, ku_name");
});

// ——— Detail datasetu (bez owner-sensitive polí: vlastníci len ako predpočítaný počet) ———
// `role` tu NIE je — handler ju nikdy nepoužil, takže parameter len predstieral stráž.
export const getDataset = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const dataset = (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [data.id]))[0] ?? null;
    const parcels = await q<Parcel>(
      "SELECT * FROM parcels WHERE dataset_id = ? ORDER BY parcel_no",
      [data.id],
    );
    const jobs = await q<ImportJob>(
      "SELECT * FROM import_jobs WHERE dataset_id = ? ORDER BY step_no",
      [data.id],
    );
    const reports = await q<ReportRow>(
      "SELECT * FROM reports WHERE dataset_id = ? ORDER BY id DESC",
      [data.id],
    );
    const opportunities = await q<Opportunity>(
      "SELECT * FROM opportunities WHERE dataset_id = ? ORDER BY score DESC",
      [data.id],
    );
    const lvCount =
      (await q<{ n: number }>("SELECT COUNT(*) AS n FROM lvs WHERE dataset_id = ?", [data.id]))[0]
        ?.n ?? 0;
    // Predpočítané (0062): počet vlastníkov z datasetu namiesto COUNT(*) skenu nad lv_owners.
    const ownerCount = dataset?.n_owners ?? 0;
    return { dataset, parcels, jobs, reports, opportunities, lvCount, ownerCount };
  });

// ——— Kataster Browser: register LV (rolovo maskovaný na serveri) ———
export const getLvRegistry = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), role: roleSchema, q: z.string().optional(), token: z.string().optional() }))
  .handler(async ({ data }) => {
    // rola zo session, nie od klienta (viď roleFromToken)
    const role = await roleFromToken(data.token);
    const access = ownerAccess(role);
    const query = (data.q ?? "").trim();
    let lvs: Lv[];
    if (query && access === "full") {
      // vyhľadávanie podľa čísla LV alebo mena vlastníka (mená len pre full access)
      if (/^\d+$/.test(query)) {
        lvs = await q<Lv>(
          "SELECT lv_no, co_owners FROM lvs WHERE dataset_id = ? AND lv_no = ? ORDER BY lv_no",
          [data.datasetId, Number(query)],
        );
      } else {
        lvs = await q<Lv>(
          `SELECT DISTINCT l.lv_no AS lv_no, l.co_owners AS co_owners FROM lvs l
           JOIN lv_owners o ON o.dataset_id = l.dataset_id AND o.lv_no = l.lv_no
           WHERE l.dataset_id = ? AND o.name LIKE ? ORDER BY l.co_owners DESC LIMIT 120`,
          [data.datasetId, `%${query}%`],
        );
      }
    } else if (query && /^\d+$/.test(query)) {
      lvs = await q<Lv>(
        "SELECT lv_no, co_owners FROM lvs WHERE dataset_id = ? AND lv_no = ? ORDER BY lv_no",
        [data.datasetId, Number(query)],
      );
    } else {
      lvs = await q<Lv>(
        "SELECT lv_no, co_owners FROM lvs WHERE dataset_id = ? ORDER BY co_owners DESC LIMIT 200",
        [data.datasetId],
      );
    }
    const total =
      (await q<{ n: number }>("SELECT COUNT(*) AS n FROM lvs WHERE dataset_id = ?", [data.datasetId]))[0]
        ?.n ?? 0;
    return { access, lvs, total, nameSearch: access === "full" };
  });

// Detail jedného LV — mená/podiely len pre full; real_estate dostane súhrn; ostatní denied.
export const getLvDetail = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    // rola zo session, nie od klienta (viď roleFromToken)
    const role = await roleFromToken(data.token);
    const access = ownerAccess(role);
    const cols = access === "full"
      ? "id, lv_no, name, share, is_company, birth_date, title, born_name, ico, addr_obec, addr_cislo, addr_psc"
      : "id, lv_no, name, share, is_company";
    const all = await q<LvOwner>(
      `SELECT ${cols} FROM lv_owners WHERE dataset_id = ? AND lv_no = ? ORDER BY is_company DESC, name`,
      [data.datasetId, data.lvNo],
    );
    const companyCount = all.filter((o) => o.is_company === 1).length;
    const personCount = all.length - companyCount;
    if (access === "full") {
      return { access, count: all.length, companyCount, personCount, owners: all };
    }
    // summary / denied — mená sa NEvracajú zo servera (nie iba skryté v UI)
    return { access, count: all.length, companyCount, personCount, owners: [] as LvOwner[] };
  });

// ——— Mapa 2.0: miestne názvy (POPIS z VGI) + WMS register ———
export const getMapTexts = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    return await q<{ lat: number; lng: number; txt: string }>(
      "SELECT lat, lng, txt FROM map_texts WHERE dataset_id = ? AND lat IS NOT NULL",
      [data.datasetId],
    );
  });

export const listWmsSources = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    return await q<{ id: number; name: string; url: string; layers: string; format: string }>(
      "SELECT id, name, url, layers, format FROM wms_sources WHERE dataset_id = ? OR dataset_id IS NULL ORDER BY id",
      [data.datasetId],
    );
  });

export const addWmsSource = createServerFn({ method: "POST" })
  .validator(
    z.object({
      datasetId: z.string(),
      name: z.string().min(2),
      url: z.string().url(),
      layers: z.string().min(1),
      format: z.string().optional(),
      role: roleSchema, token: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie pridať WMS." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare(
      "INSERT INTO wms_sources (dataset_id, name, url, layers, format) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(data.datasetId, data.name, data.url, data.layers, data.format ?? "image/png")
      .run();
    await logAudit("wms.add", role, `WMS „${data.name}" pridaná (manuálne, confirm-gated).`, data.datasetId);
    return { ok: true };
  });

// ——— Mapové dáta (bez owner údajov) ———
export const getMapData = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    const dataset = (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [data.datasetId]))[0] ?? null;
    const parcels = await q<Parcel>(
      "SELECT * FROM parcels WHERE dataset_id = ? AND geometry_json IS NOT NULL ORDER BY parcel_no",
      [data.datasetId],
    );
    return { dataset, parcels };
  });

// ——— ZBGIS search bar: parcela / LV / vlastník v rámci datasetu → parcel_id na fokus mapy ———
export const searchDataset = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), q: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    const query = data.q.trim();
    const empty = { parcels: [] as SearchParcel[], lvs: [] as SearchLv[], owners: [] as SearchOwner[] };
    if (query.length < 1) return empty;
    const isNum = /^\d+(\/\d+)?$/.test(query);
    const isInt = /^\d+$/.test(query);
    const parcels = isNum
      ? await q<SearchParcel>(
          `SELECT id, parcel_no, kn_type, area_m2, use_type, lv_no, centroid_lat, centroid_lng
           FROM parcels WHERE dataset_id = ? AND geometry_json IS NOT NULL AND (parcel_no = ? OR parcel_no LIKE ?)
           ORDER BY (parcel_no = ?) DESC, length(parcel_no), parcel_no LIMIT 8`,
          [data.datasetId, query, `${query}/%`, query],
        )
      : [];
    const lvs = isInt
      ? await q<SearchLv>(
          `SELECT lv_no, COUNT(*) AS n, MIN(id) AS parcel_id
           FROM parcels WHERE dataset_id = ? AND lv_no = ? AND geometry_json IS NOT NULL GROUP BY lv_no`,
          [data.datasetId, Number(query)],
        )
      : [];
    const owners = (query.length >= 3 && !isNum && canSeeOwners(role))
      ? await q<SearchOwner>(
          `SELECT o.name, o.lv_no,
             (SELECT MIN(p.id) FROM parcels p WHERE p.dataset_id = o.dataset_id AND p.lv_no = o.lv_no AND p.geometry_json IS NOT NULL) AS parcel_id
           FROM lv_owners o WHERE o.dataset_id = ? AND o.name LIKE ? GROUP BY o.name, o.lv_no
           ORDER BY o.name LIMIT 8`,
          [data.datasetId, `%${query}%`],
        )
      : [];
    return { parcels, lvs, owners: owners.filter((o) => o.parcel_id) };
  });

// ——— NL command center: písateľný dopyt naprieč VŠETKÝMI k.ú. → skórované + zoradené LV/príležitosti ———
type NlHit = {
  dataset_id: string; ku_name: string; lv_no: number; co_owners: number; has_spf: number;
  dedic: number; buildable: number; clean_title: number; absenter_ratio: number; total_area: number; oldest_birth_year: number | null;
};
// ——— LLM vrstva NL prieskumu (Haiku 5.5): NL dopyt → štruktúrovaný filter cez forced tool ———
// Bezpečné: beží LEN keď je nastavený ANTHROPIC_API_KEY (secret). Pri chýbajúcom kľúči / chybe → null → padne späť na pravidlá.
// LLM NEgeneruje SQL — vráti len whitelist polia, ktoré ja preložím na parametrizované SQL.
type LlmNlFilter = {
  co_owners_min?: number; has_spf?: boolean; buildable?: boolean; clean_title?: boolean;
  total_area_min?: number; total_area_max?: number; oldest_birth_year_max?: number;
  legal?: { event: "inheritance" | "execution" | "lien" | "sale" | "gift"; yearOp: "gte" | "lte" | "eq" | "any"; year?: number };
  sort?: "score" | "area" | "owners";
};
const LLM_LEGAL_COL: Record<string, "inh" | "exek" | "lien" | "sale" | "gift"> = { inheritance: "inh", execution: "exek", lien: "lien", sale: "sale", gift: "gift" };
const LLM_LEGAL_LABEL: Record<string, string> = { inheritance: "dedičstvo", execution: "exekúcia", lien: "záložné právo", sale: "predaj", gift: "darovanie" };

// A6 (review 2026-11-10): LLM volanie je PLATENÉ (Anthropic API, účet používateľa). Bez limitu by jeden
// prihlásený účet (alebo ukradnutá session) vedel v slučke minúť ľubovoľnú sumu. Limit na používateľa
// a deň + celkový denný strop; po vyčerpaní NL padá na pravidlá (bez LLM), nič sa neplatí.
// KV je eventuálne konzistentné → strop je „mäkký" (± pár dopytov), na kontrolu nákladov stačí.
const LLM_PER_USER_DAY = 40;
const LLM_GLOBAL_DAY = 300;
const LLM_MAX_QUERY_CHARS = 300;
async function llmQuotaTake(userId: string): Promise<boolean> {
  const kv = bindings().KV;
  if (!kv) return false;                            // bez KV nevieme počítať → LLM radšej nevolať
  const day = new Date().toISOString().slice(0, 10);
  const ku = `llm:${day}:u:${userId}`, kg = `llm:${day}:all`;
  const [u, g] = (await Promise.all([kv.get(ku), kv.get(kg)])).map((x) => Number(x) || 0);
  if (u >= LLM_PER_USER_DAY || g >= LLM_GLOBAL_DAY) return false;
  await Promise.all([
    kv.put(ku, String(u + 1), { expirationTtl: 2 * 86400 }),
    kv.put(kg, String(g + 1), { expirationTtl: 2 * 86400 }),
  ]);
  return true;
}

async function llmParseNl(query: string, apiKey: string): Promise<LlmNlFilter | null> {
  const tool = {
    name: "filter_lv",
    description: "Preloží prirodzený dopyt používateľa na filter listov vlastníctva (LV) v slovenskom katastri. Vyplň len polia, ktoré dopyt naozaj spomína.",
    input_schema: {
      type: "object",
      properties: {
        co_owners_min: { type: "integer", description: "minimálny počet spoluvlastníkov na LV" },
        has_spf: { type: "boolean", description: "LV s podielom SPF/štátu" },
        buildable: { type: "boolean", description: "stavebný/zastavateľný potenciál" },
        clean_title: { type: "boolean", description: "true = bez tiarch (čistý titul); false = s ťarchami/nečistý" },
        total_area_min: { type: "integer", description: "minimálna celková výmera LV v m²" },
        total_area_max: { type: "integer", description: "maximálna celková výmera LV v m²" },
        oldest_birth_year_max: { type: "integer", description: "najstarší vlastník narodený najneskôr v tomto roku (starí vlastníci)" },
        legal: {
          type: "object", description: "právna udalosť na LV a jej rok",
          properties: {
            event: { type: "string", enum: ["inheritance", "execution", "lien", "sale", "gift"], description: "dedičstvo/prededené=inheritance, exekúcia=execution, záložné právo=lien, predaj/kúpa=sale, darovanie=gift" },
            yearOp: { type: "string", enum: ["gte", "lte", "eq", "any"], description: "od roku=gte, do roku=lte, v roku=eq, bez roku=any" },
            year: { type: "integer" },
          },
          required: ["event", "yearOp"],
        },
        sort: { type: "string", enum: ["score", "area", "owners"] },
      },
    },
  };
  const body = {
    // Haiku 5.5 je podľa dokumentácie cielený práve na „classification, extraction, routing" —
    // čo je presne táto vrstva (NL → whitelist filter jedným vynúteným tool callom, žiadne SQL).
    // effort "low": táto úloha nepotrebuje uvažovanie, len preklad; Haiku 5.5 má default "medium",
    // takže bez tohto by platil tokeny za thinking, ktoré tu nič nepridá.
    model: "claude-haiku-5-5", max_tokens: 1024,
    output_config: { effort: "low" },
    system: "Si prekladač dopytov pre slovenský kataster nehnuteľností. Používateľ zadá dopyt v prirodzenej reči (slovensky) a ty zavoláš nástroj filter_lv s poľami, ktoré dopyt vyjadruje. Vyplň LEN spomenuté polia; nič si nevymýšľaj. Roky sú 4-ciferné (napr. 2025).",
    tools: [tool], tool_choice: { type: "tool", name: "filter_lv" },
    messages: [{ role: "user", content: query }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { content?: Array<{ type: string; input?: LlmNlFilter }> };
  const tu = (j.content ?? []).find((c) => c.type === "tool_use");
  return tu?.input ?? null;
}
// Preloží LLM filter na parametrizované SQL podmienky (whitelist). Vráti reason label pre právnu udalosť.
function applyLlmFilter(f: LlmNlFilter, cond: string[], args: unknown[]): { legalJoin: boolean; reason: string | null } {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cm = num(f.co_owners_min); if (cm != null) { cond.push("sig.co_owners >= ?"); args.push(cm); }
  if (f.has_spf === true) cond.push("sig.has_spf = 1");
  if (f.buildable === true) cond.push("sig.buildable = 1");
  if (f.clean_title === true) cond.push("sig.clean_title = 1");
  if (f.clean_title === false) cond.push("sig.clean_title = 0");
  const amin = num(f.total_area_min); if (amin != null) { cond.push("sig.total_area >= ?"); args.push(amin); }
  const amax = num(f.total_area_max); if (amax != null) { cond.push("sig.total_area <= ?"); args.push(amax); }
  const oby = num(f.oldest_birth_year_max); if (oby != null) { cond.push("sig.oldest_birth_year <= ?"); args.push(oby); }
  let legalJoin = false; let reason: string | null = null;
  const col = f.legal ? LLM_LEGAL_COL[f.legal.event] : undefined;
  if (f.legal && col) {
    legalJoin = true;
    const mn = `ll.${col}_min`, mx = `ll.${col}_max`, y = num(f.legal.year);
    if (f.legal.yearOp === "gte" && y != null) { cond.push(`${mx} >= ?`); args.push(y); }
    else if (f.legal.yearOp === "lte" && y != null) { cond.push(`${mn} <= ?`); args.push(y); }
    else if (f.legal.yearOp === "eq" && y != null) { cond.push(`${mn} <= ? AND ${mx} >= ?`); args.push(y, y); }
    else cond.push(`${mx} IS NOT NULL`);
    reason = LLM_LEGAL_LABEL[f.legal.event] + (y != null ? ` ${f.legal.yearOp === "gte" ? "od " : f.legal.yearOp === "lte" ? "do " : ""}${y}` : "");
  }
  return { legalJoin, reason };
}

export const nlQuery = createServerFn({ method: "POST" })
  .validator(z.object({ query: z.string(), role: roleSchema, sort: z.enum(["score", "area", "owners"]).optional(), llm: z.boolean().optional(), token: z.string().optional() }))
  .handler(async ({ data }) => {
    const raw = data.query.trim();
    const s = raw.toLowerCase();
    // rola zo session, nie od klienta — `data.role` sa IGNORUJE; používateľ treba aj pre limit LLM (A6)
    const me = await requireUser(data.token);
    const role = (me?.role ?? "viewer") as Role;

    // ——— intent: naprieč doménami (LV signály + vlastníci + trhové inzeráty) ———
    const marketIntent = /pred[aá]|kúp|kup\b|prenáj|nájom|najom|inzer|\bcena|cen[yu]\b|€|eur\b|lacn|pod\s*cen|\bbyt|byty|domy|pozem|\bchat|rodinn|za\s*m2|za\s*m²|€\/m/.test(s);
    const ico = raw.match(/\b(\d{5,8})\b/);
    const capName = raw.match(/\b([A-ZÁ-ŽČŠŽŤĎĽŇÔÄ][a-zá-žčšžťďľňôäíéóúýŕĺ]{2,})\b/);
    const ownerIntent = ownerAccess(role) === "full"
      && ((!!ico && /ičo|ico|firm|s\.?r\.?o|a\.?s\.?|spol/.test(s)) || (!marketIntent && !!capName));

    // ——— 1) LV signály (skórované, naprieč všetkými k.ú.) ———
    const cond: string[] = []; const args: unknown[] = [];
    if (/nevyspor|absent/.test(s)) cond.push("sig.absenter_ratio > 0");
    if (/\bspf\b|štát|stat/.test(s)) cond.push("sig.has_spf = 1");
    if (/stavebn|zastavateľn|intravil/.test(s)) cond.push("sig.buildable = 1");
    if (/bez.?[tť]arch|čist/.test(s)) cond.push("sig.clean_title = 1");
    const mco = s.match(/(\d+)\s*(spoluvlast|podiel|vlastník)/); if (mco) { cond.push("sig.co_owners >= ?"); args.push(Number(mco[1])); }
    const ma = s.match(/nad\s*(\d{3,})/); if (ma) { cond.push("sig.total_area >= ?"); args.push(Number(ma[1])); }
    // ——— Právna udalosť + rok (lv_legal): dedičstvo/exekúcia/záložné/predaj/dar podľa roku ———
    const yr = (() => {
      let m = s.match(/od\s*(?:roku\s*)?((?:19|20)\d{2})/); if (m) return { op: ">=", y: Number(m[1]) };
      m = s.match(/do\s*(?:roku\s*)?((?:19|20)\d{2})/); if (m) return { op: "<=", y: Number(m[1]) };
      m = s.match(/(?:v\s*roku|roku|rok)\s*((?:19|20)\d{2})/); if (m) return { op: "=", y: Number(m[1]) };
      m = s.match(/\b((?:19|20)\d{2})\b/); if (m) return { op: "=", y: Number(m[1]) };
      return null;
    })();
    const legalEv: "inh" | "exek" | "lien" | "sale" | "gift" | null =
      /prededen|dedič|dedic|zdeden/.test(s) ? "inh"
      : /exek/.test(s) ? "exek"
      : /zálož|zaloz/.test(s) ? "lien"
      : (/predan|predaj|\bkúp|\bkup\b/.test(s) && !marketIntent) ? "sale"
      : /\bdar(uj|ovan|om)?\b/.test(s) ? "gift" : null;
    let legalJoin = false;
    if (legalEv) {
      legalJoin = true;
      const mn = `ll.${legalEv}_min`, mx = `ll.${legalEv}_max`;
      if (yr && yr.op === ">=") { cond.push(`${mx} >= ?`); args.push(yr.y); }
      else if (yr && yr.op === "<=") { cond.push(`${mn} <= ?`); args.push(yr.y); }
      else if (yr) { cond.push(`${mn} <= ? AND ${mx} >= ?`); args.push(yr.y, yr.y); }
      else cond.push(`${mx} IS NOT NULL`);
    } else if (/dedič|dedic/.test(s)) { cond.push("sig.dedic = 1"); } // spätná kompat
    if (/s\s*[tť]arch|bremen|nečist|necist/.test(s) && !legalEv) cond.push("sig.clean_title = 0");
    // ——— LLM vrstva (Haiku 5.5): ak je secret ANTHROPIC_API_KEY, nahraď regex-filter presnejším štruktúrovaným. Fallback = regex vyššie. ———
    let llmUsed = false; let llmReason: string | null = null; let llmLimited = false;
    const _apiKey = bindings().ANTHROPIC_API_KEY;
    if (_apiKey && data.llm !== false && raw.length >= 3 && raw.length <= LLM_MAX_QUERY_CHARS && me) {
      llmLimited = !(await llmQuotaTake(me.id).catch(() => false));
    }
    if (_apiKey && data.llm !== false && raw.length >= 3 && raw.length <= LLM_MAX_QUERY_CHARS && me && !llmLimited) {
      const f = await llmParseNl(raw, _apiKey).catch(() => null);
      if (f && Object.keys(f).length > 0) {
        cond.length = 0; args.length = 0;                 // zahoď regex-filter, použi LLM (presnejší)
        const ap = applyLlmFilter(f, cond, args);
        legalJoin = ap.legalJoin; llmReason = ap.reason; llmUsed = true;
      }
    }
    // Post-filter intenty (aplikujú sa LACNO na top-N kandidátov cez indexované lookupy — NIE sken celej tabuľky):
    const wantCompany = /\bfirm|firemn|s\.?r\.?o|a\.?s\.?|právnick|pravnick|spolo[cč]n|družstv|druzstv/.test(s);
    const wantForeign = /zahrani[cč]|cudzin/.test(s);
    const wantEkn = /\be-?kn\b|\bekn\b|roep|pozemkovokniž|pozemkovoknizn/.test(s);
    // Externé post-filtre (ArcGIS/Overpass; capnuté rozpočtom subrequestov CF Workera):
    const wantNoLandslide = /bez\s*zosuv|mimo\s*zosuv/.test(s);
    const wantNoFlood = /mimo\s*z[aá]plav|bez\s*z[aá]plav|nezáplav|nezaplav/.test(s);
    const accMin = s.match(/do\s*(\d+)\s*min/);
    const wantAccess = /dojazd|dostupn[oý]|pri\s*dia[lľ]nic|k\s*dia[lľ]nic|bl[ií]zko|pri\s*obchod/.test(s) || !!accMin;
    const wantSiete = /\bsiet|pr[ií]pojk|in[žz]iniersk|napojen|elektrin|\bplyn\b/.test(s);
    // LV sekcia sa naplní ak dopyt mieri na signály alebo na post-filter atribúty (inak by "Novák"/"byt" vrátili celú DB)
    const lvRelevant = cond.length > 0 || legalJoin || wantCompany || wantForeign || wantEkn || wantNoLandslide || wantNoFlood || wantAccess || wantSiete;
    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    const rows = lvRelevant ? await q<NlHit>(
      `SELECT sig.dataset_id, d.ku_name, sig.lv_no, sig.co_owners, sig.has_spf, sig.dedic, sig.buildable,
              sig.clean_title, sig.absenter_ratio, sig.total_area, sig.oldest_birth_year
       FROM lv_signals sig JOIN datasets d ON d.id = sig.dataset_id
       ${legalJoin ? "JOIN lv_legal ll ON ll.dataset_id = sig.dataset_id AND ll.lv_no = sig.lv_no" : ""} ${where} LIMIT 4000`, args) : [];
    const w = { co: 0.3, spf: 0.25, dedic: 0.15, buildable: 0.15, absenter: 0.1, clean: 0.05 };
    const wsum = w.co + w.spf + w.dedic + w.buildable + w.absenter + w.clean;
    const scored = rows.map((r) => {
      const rawScore = (w.co * Math.min(r.co_owners ?? 0, 20)) / 20 + w.spf * (r.has_spf ?? 0) + w.dedic * (r.dedic ?? 0)
        + w.buildable * (r.buildable ?? 0) + w.absenter * (r.absenter_ratio ?? 0) + w.clean * (r.clean_title ?? 0);
      const reasons: string[] = [];
      if (llmUsed) { if (llmReason) reasons.push(llmReason); }
      else if (legalEv) reasons.push(({ inh: "dedičstvo", exek: "exekúcia", lien: "záložné právo", sale: "predaj", gift: "darovanie" })[legalEv] + (yr ? ` ${yr.op === "=" ? "" : yr.op + " "}${yr.y}` : ""));
      if ((r.co_owners ?? 0) >= 5) reasons.push(`${r.co_owners} spoluvlastníkov`);
      if (r.has_spf) reasons.push("SPF / štát");
      if (r.dedic) reasons.push(`dedičské${r.oldest_birth_year ? ` (${r.oldest_birth_year})` : ""}`);
      if (r.buildable) reasons.push("stavebný potenciál");
      if ((r.absenter_ratio ?? 0) > 0) reasons.push(`absentéri ${Math.round((r.absenter_ratio ?? 0) * 100)} %`);
      if (r.clean_title) reasons.push("bez tiarch");
      return { dataset_id: r.dataset_id, ku_name: r.ku_name, lv_no: r.lv_no, co_owners: r.co_owners ?? 0,
        total_area: r.total_area ?? 0, score: Math.round((100 * rawScore) / wsum), reasons };
    });
    const sort = data.sort ?? "score";
    scored.sort((a, b) => sort === "area" ? b.total_area - a.total_area : sort === "owners" ? b.co_owners - a.co_owners : b.score - a.score);

    // Post-filter na top-N kandidátov (D1-safe: indexované lookupy per dataset, žiadny sken celej tabuľky).
    let scoredF = scored;
    if ((wantCompany || wantForeign || wantEkn) && scored.length) {
      const top = scored.slice(0, 120);
      const byDs = new Map<string, number[]>();
      for (const r of top) { const a = byDs.get(r.dataset_id) ?? []; a.push(r.lv_no); byDs.set(r.dataset_id, a); }
      const keyset = async (build: (ph: string) => string): Promise<Set<string>> => {
        const set = new Set<string>();
        for (const [ds, lvs] of byDs) {
          const ph = lvs.map(() => "?").join(",");
          const rows = await q<{ lv_no: number }>(build(ph), [ds, ...lvs]);
          for (const r of rows) set.add(`${ds}:${r.lv_no}`);
        }
        return set;
      };
      const needs: Set<string>[] = [];
      if (wantCompany) needs.push(await keyset((ph) => `SELECT DISTINCT lv_no FROM lv_owners WHERE dataset_id=? AND is_company=1 AND lv_no IN (${ph})`));
      if (wantForeign) needs.push(await keyset((ph) => `SELECT DISTINCT lv_no FROM lv_owners WHERE dataset_id=? AND is_company=0 AND addr_psc IS NULL AND addr_obec IS NOT NULL AND lv_no IN (${ph})`));
      if (wantEkn) needs.push(await keyset((ph) => `SELECT DISTINCT lv_no FROM parcels WHERE dataset_id=? AND (kn_type LIKE 'E%' OR ekn_ref IS NOT NULL) AND lv_no IN (${ph})`));
      scoredF = top.filter((r) => needs.every((set) => set.has(`${r.dataset_id}:${r.lv_no}`)));
    }

    // Externý post-filter (limity/dostupnosť/siete) — capnuté rozpočtom subrequestov (CF free = 50/request).
    let lvNote: string | undefined;
    if ((wantNoLandslide || wantNoFlood || wantAccess || wantSiete) && scoredF.length) {
      const perCand = ((wantNoLandslide || wantNoFlood) ? 7 : 0) + ((wantAccess || wantSiete) ? 3 : 0);
      const cap = Math.max(3, Math.min(scoredF.length, Math.floor(42 / Math.max(perCand, 1))));
      const cand = scoredF.slice(0, cap);
      const byDs2 = new Map<string, number[]>();
      for (const r of cand) { const a = byDs2.get(r.dataset_id) ?? []; a.push(r.lv_no); byDs2.set(r.dataset_id, a); }
      const cxy = new Map<string, { lat: number; lng: number }>();
      for (const [ds, lvs] of byDs2) {
        const ph = lvs.map(() => "?").join(",");
        const rows = await q<{ lv_no: number; lat: number | null; lng: number | null }>(
          `SELECT lv_no, centroid_lat AS lat, centroid_lng AS lng FROM parcels WHERE dataset_id=? AND lv_no IN (${ph}) AND centroid_lat IS NOT NULL ORDER BY area_m2 DESC`, [ds, ...lvs]);
        for (const r of rows) { const k = `${ds}:${r.lv_no}`; if (!cxy.has(k) && r.lat != null && r.lng != null) cxy.set(k, { lat: r.lat, lng: r.lng }); }
      }
      const maxDrive = accMin ? Number(accMin[1]) : 15;
      const keep: typeof cand = [];
      for (const r of cand) {
        const c = cxy.get(`${r.dataset_id}:${r.lv_no}`);
        if (!c) continue; // bez geometrie sa nedá externe overiť
        let ok = true;
        if (wantNoLandslide || wantNoFlood) {
          const lim = await limitsCore(c.lat, c.lng).catch(() => null);
          const hit = (k: string) => !!lim?.items.some((i) => i.key === k && i.hit);
          if (wantNoLandslide && hit("zosuvy")) ok = false;
          if (ok && wantNoFlood && hit("zaplava")) ok = false;
        }
        if (ok && (wantAccess || wantSiete)) {
          const acc = await accessibilityCore(c.lat, c.lng).catch(() => null);
          const obchod = acc?.amenities?.obchod?.drive_min ?? 999;
          const dial = acc?.infra?.dialnica?.drive_min ?? 999;
          if (wantAccess && Math.min(obchod, dial) > maxDrive) ok = false;
          if (ok && wantSiete && Math.min(obchod, acc?.amenities?.skola?.drive_min ?? 999) > 15) ok = false; // siete = proxy: blízkosť zástavby
        }
        if (ok) keep.push(r);
      }
      scoredF = keep;
      lvNote = `Externé overenie (limity/dostupnosť) aplikované na top ${cap} kandidátov — rozpočet subrequestov CF.`;
    }

    // ——— 2) Vlastníci (rolovo gatované, naprieč k.ú.) ———
    let owners: { access: ReturnType<typeof ownerAccess>; count: number; results: OwnerGroup[] } = { access: ownerAccess(role), count: 0, results: [] };
    if (ownerIntent) {
      const term = ico ? ico[1] : (capName ? capName[1] : "");
      if (term) {
        const orows = await q<OwnerHit>(
          `SELECT o.name, o.is_company, o.ico, o.birth_date, o.dataset_id, d.ku_name AS ku_name, o.lv_no, o.share
           FROM lv_owners o JOIN datasets d ON d.id = o.dataset_id
           WHERE ${ico ? "o.ico = ?" : "o.name LIKE ?"} ORDER BY o.name LIMIT 400`,
          [ico ? term : `%${term}%`]);
        const map = new Map<string, OwnerGroup>();
        for (const r of orows) {
          const key = (r.ico && r.is_company) ? `ico:${r.ico}` : `${r.name}|${r.birth_date ?? ""}`;
          let g = map.get(key);
          if (!g) { g = { name: r.name, is_company: r.is_company, ico: r.ico, birth_date: r.birth_date, occurrences: [], lvCount: 0, kuCount: 0 }; map.set(key, g); }
          g.occurrences.push({ dataset_id: r.dataset_id, ku_name: r.ku_name, lv_no: r.lv_no, share: r.share });
        }
        const results = Array.from(map.values())
          .map((g) => ({ ...g, lvCount: g.occurrences.length, kuCount: new Set(g.occurrences.map((o) => o.dataset_id)).size }))
          .sort((a, b) => b.lvCount - a.lvCount).slice(0, 60);
        owners = { access: "full", count: results.length, results };
      }
    }

    // ——— 3) Trhové inzeráty (verejná inzercia, naprieč SR) ———
    let market: { count: number; results: MarketListing[] } = { count: 0, results: [] };
    if (marketIntent) {
      const mw: string[] = [`(price_eur IS NULL OR price_eur <= ${PRICE_MAX})`]; const ma2: unknown[] = [];
      const ptype = /pozem/.test(s) ? "pozemok" : /\bbyt|byty/.test(s) ? "byt" : /\bdom|domy|rodinn/.test(s) ? "dom" : /chat/.test(s) ? "chata" : null;
      if (ptype) { mw.push("ptype = ?"); ma2.push(ptype); }
      if (capName) { mw.push("(obec LIKE ? OR okres LIKE ?)"); ma2.push(`%${capName[1]}%`, `%${capName[1]}%`); }
      const pm = s.match(/(?:do|pod)\s*(\d{3,})/); if (pm) { mw.push("price_eur <= ?"); ma2.push(Number(pm[1])); }
      if (/prenáj|nájom|najom/.test(s)) { mw.push("deal LIKE ?"); ma2.push("%prenáj%"); }
      const lastFull = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='last_full'"))[0]?.value;
      if (lastFull) { mw.push("last_seen >= ?"); ma2.push(lastFull); }
      const mrows = await q<MarketListing>(
        `SELECT ${ML_COLS} FROM market_listings WHERE ${mw.join(" AND ")} ORDER BY (ppm2 IS NULL), ppm2 ASC, price_eur ASC LIMIT 60`, ma2);
      market = { count: mrows.length, results: mrows };
    }

    // ——— 1b) Nehnuteľnosti podľa AKTUÁLNEJ akvizície — presné byt/parcela hity ———
    // GOLD-ZA (dedičstvo + byt) ide cez za_cases — candidate-model klasifikátor s FLOOR kritériom
    // (nie 1./posledné podlažie) + SAME_QUALIFYING_HOLDING, presnejší než staré ad-hoc počítanie
    // (nahradené 2026-10-04). Iné právne udalosti (exekúcia/záložné/predaj/dar) a iné typy aktív
    // (parcela/stavba) zostávajú na asset_acquisitions (GOLD-ZA ich nepokrýva).
    type FlatHit = {
      kod_ku: string; ku_name: string | null; lv_number: string | null; asset_type: string | null;
      unit_number: string | null; area_m2: number | null; acquisition_kind: string | null;
      registration_year: number | null; instrument_year: number | null; owner_addr_differs: number; has_person: number | null;
      floor?: number | null; building_min_floor?: number | null; building_max_floor?: number | null;
      classification?: string | null; owner_obec?: string | null;
    };
    let flats: { count: number; results: FlatHit[]; source?: "gold-za" | "legacy" } = { count: 0, results: [] };
    const acqKind = legalEv ? ({ inh: "inheritance", exek: "execution", lien: "lien", sale: "sale", gift: "gift" } as const)[legalEv] : null;
    const at = /\bbyt/.test(s) ? "flat" : /pozem|parcel/.test(s) ? "parcel" : /\bdom|stavb|budov/.test(s) ? "building" : null;
    if (acqKind === "inheritance" && at !== "parcel" && at !== "building") {
      // GOLD-ZA: dedičstvo (inštrument) + byt — za_cases má floor kritérium, asset_acquisitions nemá
      const zcond: string[] = ["classification IN ('MATCH','PROVISIONAL')"]; const zargs: unknown[] = [];
      if (yr && yr.op === ">=") { zcond.push("instrument_year >= ?"); zargs.push(yr.y); }
      else if (yr && yr.op === "<=") { zcond.push("instrument_year <= ?"); zargs.push(yr.y); }
      else if (yr) { zcond.push("instrument_year = ?"); zargs.push(yr.y); }
      // „vlastník býva inde" je presne MATCH (PROVISIONAL = adresa NOT VERIFIED, nie potvrdená odlišná)
      if (/mimo\s*mest|neb[yý]v|absent|vlastník\s*inde|cudzin/.test(s)) zcond.push("classification = 'MATCH'");
      const zrows = await q<{ kod_ku: string; ku_name: string | null; lv_no: number | null; floor: number | null; building_min_floor: number | null; building_max_floor: number | null; classification: string; instrument_year: number | null; registration_year: number | null; owner_obec: string | null }>(
        `SELECT kod_ku, ku_name, lv_no, floor, building_min_floor, building_max_floor, classification, instrument_year, registration_year, owner_obec
         FROM za_cases WHERE ${zcond.join(" AND ")} ORDER BY classification, instrument_year DESC, kod_ku LIMIT 300`, zargs).catch(() => []);
      const zresults: FlatHit[] = zrows.map((z) => ({
        kod_ku: z.kod_ku, ku_name: z.ku_name, lv_number: z.lv_no != null ? String(z.lv_no) : null,
        asset_type: "flat", unit_number: null, area_m2: null, acquisition_kind: "inheritance",
        registration_year: z.registration_year, instrument_year: z.instrument_year,
        owner_addr_differs: z.classification === "MATCH" ? 1 : 0, has_person: null,
        floor: z.floor, building_min_floor: z.building_min_floor, building_max_floor: z.building_max_floor,
        classification: z.classification, owner_obec: z.owner_obec,
      }));
      flats = { count: zresults.length, results: zresults, source: "gold-za" };
    } else if (acqKind) {
      const fcond: string[] = ["acquisition_kind = ?"]; const fargs: unknown[] = [acqKind];
      if (yr && yr.op === ">=") { fcond.push("registration_year >= ?"); fargs.push(yr.y); }
      else if (yr && yr.op === "<=") { fcond.push("registration_year <= ?"); fargs.push(yr.y); }
      else if (yr) { fcond.push("registration_year = ?"); fargs.push(yr.y); }
      if (at === "flat") fcond.push("asset_type = 'flat'");
      else if (at === "parcel") fcond.push("asset_type IN ('parcel_c','parcel_e')");
      else if (at === "building") fcond.push("asset_type = 'building'");
      if (/mimo\s*mest|neb[yý]v|absent|vlastník\s*inde|cudzin/.test(s)) fcond.push("owner_addr_differs = 1");
      const frows = await q<FlatHit>(
        `SELECT kod_ku, ku_name, lv_number, asset_type, unit_number, area_m2, acquisition_kind, registration_year, instrument_year, owner_addr_differs, has_person
         FROM asset_acquisitions WHERE ${fcond.join(" AND ")} ORDER BY registration_year DESC, kod_ku, lv_number LIMIT 300`, fargs).catch(() => [] as FlatHit[]);
      flats = { count: frows.length, results: frows, source: "legacy" };
    }

    // ——— 1c) POZEMKOVÉ PRÍLEŽITOSTI (land-search, predpočítané z Mac gold_li_engine → landsearch_results) ———
    type LandHit = { kod_ku: string; ku_name: string | null; purpose: string | null; verdict: string | null; quality: number | null; area_m2: number | null; n_parcels: number | null; parcels: string | null; shape: string | null; zone: string | null; build: string | null; access: number | null; slope: number | null; frontage: number | null; ppf: number | null; existing_use: string | null; yard: string | null; access_times: string | null; owners: string | null; n_owners: number | null; reason: string | null; market_ppm2: number | null; market_n: number | null; druh: string | null; avmPpm2: number | null; avmPotential: number | null; avmAsIs: number | null; avmMargin: number | null; avmBasis: string | null };
    let land: { count: number; results: LandHit[] } = { count: 0, results: [] };
    const landIntent = /pozemk|pozemok|stavebn|v[yý]stavb|lokalit|supermarket|pr[ií]le[žz]itost/.test(s);
    if (landIntent) {
      const lc: string[] = []; const la: unknown[] = [];
      if (capName) { lc.push("ku_name LIKE ?"); la.push(`%${capName[1]}%`); }
      if (/b[yý]van|rodinn|obytn|rezidenc/.test(s)) { lc.push("purpose = 'residential'"); }
      else if (/priemysel|sklad|logist|hala/.test(s)) { lc.push("purpose = 'industrial'"); }
      const lrows = await q<LandHit & { avm_ppm2: number | null; avm_basis: string | null }>(
        `SELECT ls.kod_ku, ls.ku_name, ls.purpose, ls.verdict, ls.quality, ls.area_m2, ls.n_parcels, ls.parcels, ls.shape, ls.zone, ls.build, ls.access, ls.slope, ls.frontage, ls.ppf, ls.existing_use, ls.yard, ls.access_times, ls.owners, ls.n_owners, ls.reason, ls.druh,
            om.median_ppm2 AS market_ppm2, om.n AS market_n, av.ppm2_stavebny AS avm_ppm2, av.basis AS avm_basis
         FROM landsearch_results ls
         LEFT JOIN datasets ds ON ds.ku_code = ls.kod_ku
         LEFT JOIN obec_market_median om ON om.obec = TRIM(REPLACE(REPLACE(COALESCE(ds.ku_name, ls.ku_name), 'k.ú.', ''), 'k.ú', ''))
         LEFT JOIN avm_index av ON av.okres = TRIM(REPLACE(SUBSTR(ds.region, 1, INSTR(ds.region || ' · ', ' · ') - 1), 'okres ', ''))
         ${lc.length ? "WHERE " + lc.map((x) => x.replace(/^ku_name|^purpose/, (m) => "ls." + m)).join(" AND ") : ""} ORDER BY (ls.verdict = 'MATCH') DESC, ls.quality DESC LIMIT 200`, la).catch(() => []);
      const lresults: LandHit[] = lrows.map((o) => {
        const area = o.area_m2 ?? 0;
        const stav = o.avm_ppm2 ?? AVM_DEFAULT.stavebny;
        const cat = o.druh ? avmCategory(o.druh) : "polnohosp";
        const asIsPpm2 = cat === "stavebny" ? stav : AVM_DEFAULT[cat];
        const avmPotential = area > 0 ? Math.round(stav * area) : null;
        const avmAsIs = area > 0 ? Math.round(asIsPpm2 * area) : null;
        const avmMargin = avmPotential && avmAsIs ? Math.round((avmPotential - avmAsIs) / avmPotential * 100) : null;
        return { ...o, avmPpm2: o.avm_ppm2, avmPotential, avmAsIs, avmMargin, avmBasis: o.avm_basis };
      });
      land = { count: lresults.length, results: lresults };
    }

    return {
      lv: { count: scoredF.length, results: scoredF.slice(0, 80), note: lvNote },
      flats,
      land,
      owners,
      market,
      llmUsed,
      llmLimited,
    };
  });

// ——— Owners pre jednu parcelu (identify, rolovo gatované) ———
export const getParcelOwners = createServerFn({ method: "POST" })
  .validator(z.object({ parcelId: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    const count =
      (await q<{ n: number }>("SELECT COUNT(*) AS n FROM owners WHERE parcel_id = ?", [
        data.parcelId,
      ]))[0]?.n ?? 0;
    if (!canSeeOwners(role)) return { visible: false, owners: [] as Owner[], count };
    const owners = await q<Owner>(
      "SELECT id, parcel_id, display_label, share, lv_no, protected FROM owners WHERE parcel_id = ? ORDER BY id",
      [data.parcelId],
    );
    return { visible: true, owners, count };
  });

// Owners pre celý dataset (rolovo gatované) — doťahuje sa klientsky podľa roly.
export const getDatasetOwners = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    const count =
      (await q<{ n: number }>("SELECT COUNT(*) AS n FROM owners WHERE dataset_id = ?", [
        data.datasetId,
      ]))[0]?.n ?? 0;
    if (!canSeeOwners(role)) return { visible: false, owners: [] as Owner[], count };
    const owners = await q<Owner>(
      "SELECT id, parcel_id, display_label, share, lv_no, protected FROM owners WHERE dataset_id = ? ORDER BY parcel_id, id",
      [data.datasetId],
    );
    return { visible: true, owners, count };
  });

export const listOpportunities = createServerFn({ method: "GET" }).handler(async () => {
  return await q<Opportunity & { ku_name: string; dataset_status: string }>(
    `SELECT o.*, d.ku_name AS ku_name, d.status AS dataset_status
     FROM opportunities o JOIN datasets d ON d.id = o.dataset_id
     ORDER BY o.score DESC`,
  );
});

export const listReports = createServerFn({ method: "GET" }).handler(async () => {
  return await q<ReportRow & { ku_name: string }>(
    `SELECT r.*, d.ku_name AS ku_name FROM reports r
     JOIN datasets d ON d.id = r.dataset_id ORDER BY r.id DESC`,
  );
});

// ——— Mutácie ———
export const generateReport = createServerFn({ method: "POST" })
  .validator(
    z.object({
      datasetId: z.string(),
      kind: z.enum(["evidence_list", "parcel_pack", "map_sheet"]),
      title: z.string().min(3),
      role: roleSchema,
      token: z.string().optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: false; message: string } | { ok: true; id: number | null; hash: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const hash = Math.random().toString(16).slice(2, 10);
    const res = await DB.prepare(
      "INSERT INTO reports (dataset_id, kind, title, status, audit_hash) VALUES (?, ?, ?, 'draft', ?)",
    )
      .bind(data.datasetId, data.kind, data.title, hash)
      .run();
    await logAudit("report.generate", u.role, `Report „${data.title}" vytvorený (draft, audit ${hash}).`, data.datasetId);
    return { ok: true, id: res.meta?.last_row_id ?? null, hash };
  });

export const setReportStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({ id: z.number(), status: z.enum(["draft", "review", "signed"]), role: roleSchema, token: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (data.status === "signed" && !canSign(role))
      return { ok: false, message: "Rola nemá oprávnenie podpísať report." };
    if (data.status === "review" && !canExport(role))
      return { ok: false, message: "Rola nemá oprávnenie posunúť report do review." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(data.status, data.id).run();
    await logAudit("report.status", role, `Report #${data.id} → ${data.status}.`);
    return { ok: true };
  });

export const runReadinessRecheck = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie spustiť pipeline." };
    const ds = (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [data.datasetId]))[0];
    if (!ds) return { ok: false, message: "Dataset neexistuje." };
    const verdict =
      ds.status === "blocked"
        ? "blocked — quality gate stále zlyháva (chýba DBF/FPT)."
        : `${ds.status} — geometry coverage ${ds.geometry_coverage} %, canonical confidence ${(ds.canonical_confidence * 100) | 0} %.`;
    const { DB } = bindings();
    if (DB) {
      const next =
        ((await q<{ m: number }>("SELECT MAX(step_no) AS m FROM import_jobs WHERE dataset_id = ?", [data.datasetId]))[0]?.m ?? 0) + 1;
      await DB.prepare(
        "INSERT INTO import_jobs (dataset_id, step_no, step, state, message) VALUES (?, ?, 'Readiness re-check', ?, ?)",
      )
        .bind(data.datasetId, next, ds.status === "blocked" ? "blocked" : "done", verdict)
        .run();
    }
    await logAudit("readiness.recheck", role, verdict, data.datasetId);
    return { ok: true, message: verdict };
  });

export const getAudit = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<AuditRow[]> => {
    // len admin: bol verejný GET bez prihlásenia a obsahoval aj mená žiadateľov o GDPR výmaz
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return [];
    return await q<AuditRow>("SELECT * FROM audit_log ORDER BY id DESC LIMIT 40");
  });

// ——— Auth ———
// Prihlásenie, registrácia a odhlásenie bežia cez POST /api/auth (src/lib/auth.server.ts), nie ako
// server funkcie: každé volanie /_serverFn/* overuje session brána v src/start.ts. Odstránené:
// demo `login` s natvrdo zapísanou frázou a server funkcie registerUser/loginUser/getMe/logoutUser.
export type AuthUser = { id: string; email: string; name: string | null; role: Role };
async function userFromToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const s = (await q<{ user_id: string; expires_at: number }>("SELECT user_id, expires_at FROM sessions WHERE token = ?", [token]))[0];
  if (!s || (s.expires_at ?? 0) < Date.now()) return null;
  const u = (await q<{ id: string; email: string; name: string | null; role: string }>("SELECT id, email, name, role FROM users WHERE id = ?", [s.user_id]))[0];
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role as Role } : null;
}
/**
 * Autoritatívna rola zo serverovej session — NIE z toho, čo pošle klient.
 *
 * Rola sa dovtedy brala z `localStorage` (role-context.tsx) a serverové funkcie jej verili, takže
 * prihlásený používateľ si ju mohol prepnúť na „admin" a dostať mená vlastníkov, dátumy narodenia
 * a adresy. `users.role` je pritom v D1 a session ju vie dohľadať.
 *
 * Pri chýbajúcom alebo neplatnom tokene vraciame NAJNIŽŠIE oprávnenie, nie to klientske — výpadok
 * sa prejaví ako maskované údaje (viditeľné a opraviteľné), nie ako tichý únik.
 */
async function roleFromToken(token: string | undefined): Promise<Role> {
  const u = token ? await userFromToken(token).catch(() => null) : null;
  return (u?.role ?? "viewer") as Role;
}

// Stráž pre ZAPISUJÚCE funkcie. Server fn sú VEREJNÉ POST endpointy a prihlasovacia brána je len
// na klientovi, takže bez tejto kontroly vedel ktokoľvek zakladať cases, písať poznámky, mazať
// prepojenia a generovať reporty — a navyše si do `author_role` zapísať rolu, akú si vymyslel.
// Autor sa odteraz berie zo session, nikdy z tela požiadavky.
async function requireUser(token: string | undefined): Promise<AuthUser | null> {
  return token ? await userFromToken(token).catch(() => null) : null;
}

// ——— Prístup: allowlist povolených registrácií (kto sa vôbec smie zaregistrovať) — admin ———
export type AllowedSignup = { email: string; note: string | null; created_at: string | null };
export const listAllowedSignups = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ access: boolean; emails: AllowedSignup[] }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { access: false, emails: [] };
    const emails = await q<AllowedSignup>("SELECT email, note, created_at FROM signup_allowlist ORDER BY created_at DESC").catch(() => []);
    return { access: true, emails };
  });
export const addAllowedSignup = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), email: z.string().email(), note: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže spravovať prístupy." };
    try {
      await q("INSERT OR IGNORE INTO signup_allowlist (email,note) VALUES (?,?)", [data.email.trim().toLowerCase(), data.note?.trim() || null]);
      await logAudit("signup.allow.add", u.role, `Povolená registrácia: ${data.email.trim().toLowerCase()}`);
      return { ok: true };
    } catch (e) { return { ok: false, message: String((e as Error)?.message ?? e) }; }
  });
export const removeAllowedSignup = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), email: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže spravovať prístupy." };
    await q("DELETE FROM signup_allowlist WHERE email = ?", [data.email.trim().toLowerCase()]);
    await logAudit("signup.allow.remove", u.role, `Odobraná registrácia: ${data.email.trim().toLowerCase()}`);
    return { ok: true };
  });

// ——— Používatelia a roly (admin) ———
// Nový účet je od 2026-11-10 VIEWER (bez mien vlastníkov); vyššiu rolu pridelí admin tu.
export type UserRow = { id: string; email: string; name: string | null; role: string; created_at: string | null; last_login: number | null; sessions: number };
export const listUsers = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ access: boolean; users: UserRow[] }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { access: false, users: [] };
    const users = await q<UserRow>(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions
       FROM users u ORDER BY u.created_at`, [Date.now()]);
    return { access: true, users };
  });
export const setUserRole = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), userId: z.string(), newRole: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže meniť roly." };
    if (data.userId === u.id && data.newRole !== "admin") {
      const admins = (await q<{ n: number }>("SELECT COUNT(*) n FROM users WHERE role = 'admin'"))[0]?.n ?? 0;
      if (admins <= 1) return { ok: false, message: "Si jediný admin — najprv urob adminom niekoho iného." };
    }
    const t = (await q<{ email: string }>("SELECT email FROM users WHERE id = ?", [data.userId]))[0];
    if (!t) return { ok: false, message: "Používateľ neexistuje." };
    await q("UPDATE users SET role = ? WHERE id = ?", [data.newRole, data.userId]);
    await logAudit("user.role", u.role, `Rola ${t.email} → ${data.newRole}`);
    return { ok: true };
  });
export const revokeUserSessions = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), userId: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; removed?: number; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže rušiť relácie." };
    const n = (await q<{ n: number }>("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", [data.userId]))[0]?.n ?? 0;
    await q("DELETE FROM sessions WHERE user_id = ?", [data.userId]);
    const t = (await q<{ email: string }>("SELECT email FROM users WHERE id = ?", [data.userId]))[0];
    await logAudit("user.revoke", u.role, `Odhlásené všade: ${t?.email ?? data.userId} (${n} relácií)`);
    return { ok: true, removed: n };
  });

// ——— Kolaborácia: komentáre / watchlisty / denník / notifikácie ———
async function notifyWatchers(subjectType: string, subjectId: string, exceptUserId: string, kind: string, body: string) {
  const watchers = await q<{ user_id: string }>("SELECT DISTINCT user_id FROM watchlist WHERE subject_type=? AND subject_id=? AND user_id<>?", [subjectType, subjectId, exceptUserId]);
  for (const w of watchers) await q("INSERT INTO notifications (user_id,kind,subject_type,subject_id,body) VALUES (?,?,?,?,?)", [w.user_id, kind, subjectType, subjectId, body]);
}
export type CommentRow = { id: number; user_id: string; author: string | null; body: string; created_at: string };
export const getComments = createServerFn({ method: "POST" })
  .validator(z.object({ subjectType: z.string(), subjectId: z.string() }))
  .handler(async ({ data }): Promise<CommentRow[]> =>
    q<CommentRow>("SELECT id,user_id,author,body,created_at FROM comments WHERE subject_type=? AND subject_id=? ORDER BY id DESC LIMIT 200", [data.subjectType, data.subjectId]));
export const addComment = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), subjectType: z.string(), subjectId: z.string(), body: z.string().min(1).max(4000) }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    const author = u.name ?? u.email;
    await q("INSERT INTO comments (subject_type,subject_id,user_id,author,body) VALUES (?,?,?,?,?)", [data.subjectType, data.subjectId, u.id, author, data.body.trim()]);
    await q("INSERT INTO activity (user_id,author,action,subject_type,subject_id,detail) VALUES (?,?,?,?,?,?)", [u.id, author, "comment.add", data.subjectType, data.subjectId, data.body.trim().slice(0, 90)]);
    await notifyWatchers(data.subjectType, data.subjectId, u.id, "comment", `💬 ${author}: ${data.body.trim().slice(0, 70)}`);
    return { ok: true };
  });
export const deleteComment = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false };
    if (u.role === "admin") await q("DELETE FROM comments WHERE id=?", [data.id]);
    else await q("DELETE FROM comments WHERE id=? AND user_id=?", [data.id, u.id]);
    return { ok: true };
  });

export type WatchRow = { id: number; subject_type: string; subject_id: string; label: string | null; note: string | null; status: string; assignee_id: string | null; created_at: string };
export const getWatchlist = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<WatchRow[]> => {
    const u = await userFromToken(data.token);
    if (!u) return [];
    return q<WatchRow>("SELECT id,subject_type,subject_id,label,note,status,assignee_id,created_at FROM watchlist WHERE user_id=? OR assignee_id=? ORDER BY id DESC LIMIT 300", [u.id, u.id]);
  });
export const isWatched = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), subjectType: z.string(), subjectId: z.string() }))
  .handler(async ({ data }): Promise<{ watched: boolean }> => {
    const u = await userFromToken(data.token);
    if (!u) return { watched: false };
    const r = await q<{ id: number }>("SELECT id FROM watchlist WHERE user_id=? AND subject_type=? AND subject_id=?", [u.id, data.subjectType, data.subjectId]);
    return { watched: r.length > 0 };
  });
export const toggleWatch = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), subjectType: z.string(), subjectId: z.string(), label: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; watched: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false, watched: false, message: "Neprihlásený." };
    const ex = await q<{ id: number }>("SELECT id FROM watchlist WHERE user_id=? AND subject_type=? AND subject_id=?", [u.id, data.subjectType, data.subjectId]);
    if (ex.length) { await q("DELETE FROM watchlist WHERE id=?", [ex[0].id]); return { ok: true, watched: false }; }
    await q("INSERT INTO watchlist (user_id,subject_type,subject_id,label) VALUES (?,?,?,?)", [u.id, data.subjectType, data.subjectId, data.label ?? null]);
    await q("INSERT INTO activity (user_id,author,action,subject_type,subject_id,detail) VALUES (?,?,?,?,?,?)", [u.id, u.name ?? u.email, "watch.add", data.subjectType, data.subjectId, data.label ?? ""]);
    return { ok: true, watched: true };
  });
export const updateWatch = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number(), status: z.string().optional(), note: z.string().optional(), assigneeEmail: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    if (data.status != null) await q("UPDATE watchlist SET status=? WHERE id=? AND (user_id=? OR assignee_id=?)", [data.status, data.id, u.id, u.id]);
    if (data.note != null) await q("UPDATE watchlist SET note=? WHERE id=? AND (user_id=? OR assignee_id=?)", [data.note, data.id, u.id, u.id]);
    if (data.assigneeEmail != null) {
      const a = (await q<{ id: string }>("SELECT id FROM users WHERE email=?", [data.assigneeEmail.trim().toLowerCase()]))[0];
      if (!a) return { ok: false, message: "Kolega s týmto emailom neexistuje." };
      const w = (await q<{ subject_type: string; subject_id: string; label: string | null }>("SELECT subject_type,subject_id,label FROM watchlist WHERE id=?", [data.id]))[0];
      await q("UPDATE watchlist SET assignee_id=? WHERE id=? AND user_id=?", [a.id, data.id, u.id]);
      if (w) await q("INSERT INTO notifications (user_id,kind,subject_type,subject_id,body) VALUES (?,?,?,?,?)", [a.id, "assigned", w.subject_type, w.subject_id, `📌 ${u.name ?? u.email} ti priradil: ${w.label ?? w.subject_id}`]);
    }
    return { ok: true };
  });

export type ActivityRow = { id: number; author: string | null; action: string; subject_type: string | null; subject_id: string | null; detail: string | null; created_at: string };
export const getActivity = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().optional() }))
  .handler(async ({ data }): Promise<ActivityRow[]> =>
    q<ActivityRow>("SELECT id,author,action,subject_type,subject_id,detail,created_at FROM activity ORDER BY id DESC LIMIT ?", [Math.min(data.limit ?? 100, 300)]));

export type NotifRow = { id: number; kind: string; subject_type: string | null; subject_id: string | null; body: string; is_read: number; created_at: string };
export const getNotifications = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<NotifRow[]> => {
    const u = await userFromToken(data.token);
    if (!u) return [];
    return q<NotifRow>("SELECT id,kind,subject_type,subject_id,body,is_read,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100", [u.id]);
  });
export const markNotifsRead = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false };
    await q("UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0", [u.id]);
    return { ok: true };
  });

// ——— Uložené NL hľadania + alerty (Fáza 3b) ———
export type SavedSearchRow = { id: number; name: string; query: string; sort: string | null; alert: number; channels: string; last_run: string | null; created_at: string };
export const saveSearch = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), name: z.string().min(1).max(120), query: z.string().min(1).max(500), sort: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    const r = await q<{ id: number }>("INSERT INTO saved_search (user_id,name,query,sort) VALUES (?,?,?,?) RETURNING id", [u.id, data.name.trim(), data.query.trim(), data.sort ?? null]);
    await q("INSERT INTO activity (user_id,author,action,detail) VALUES (?,?,?,?)", [u.id, u.name ?? u.email, "search.save", data.name.trim()]);
    return { ok: true, id: r[0]?.id };
  });
export const listSavedSearches = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<SavedSearchRow[]> => {
    const u = await userFromToken(data.token);
    if (!u) return [];
    return q<SavedSearchRow>("SELECT id,name,query,sort,alert,channels,last_run,created_at FROM saved_search WHERE user_id=? ORDER BY id DESC LIMIT 100", [u.id]);
  });
export const deleteSavedSearch = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false };
    await q("DELETE FROM saved_search WHERE id=? AND user_id=?", [data.id, u.id]);
    await q("DELETE FROM alert_seen WHERE saved_id=?", [data.id]);
    return { ok: true };
  });
export const setSavedAlert = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number(), alert: z.boolean(), channels: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false };
    await q("UPDATE saved_search SET alert=?, channels=COALESCE(?,channels) WHERE id=? AND user_id=?", [data.alert ? 1 : 0, data.channels ?? null, data.id, u.id]);
    return { ok: true };
  });
async function sendTelegramAlert(text: string): Promise<void> {
  const e = bindings() as ReturnType<typeof bindings> & { TG_BOT_TOKEN?: string; TG_CHAT_ID?: string };
  if (!e.TG_BOT_TOKEN || !e.TG_CHAT_ID) return; // Telegram funguje až po nastavení CF secrets TG_BOT_TOKEN/TG_CHAT_ID
  await fetch(`https://api.telegram.org/bot${e.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: e.TG_CHAT_ID, text: text.slice(0, 3900), disable_web_page_preview: true }),
  }).catch(() => {});
}
// On-demand kontrola alertov prihláseného usera: re-runuje uložené dopyty, porovná s alert_seen,
// nové LV → in-app notifikácia (+ Telegram ak je CF secret). Prvý beh = baseline (bez notifikácie).
export const runMyAlerts = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; checked: number; newTotal: number; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false, checked: 0, newTotal: 0, message: "Neprihlásený." };
    const rows = await q<SavedSearchRow>("SELECT id,name,query,sort,alert,channels,last_run,created_at FROM saved_search WHERE user_id=? AND alert=1", [u.id]);
    let newTotal = 0;
    for (const sv of rows) {
      let res: Awaited<ReturnType<typeof nlQuery>> | null = null;
      // token ide ďalej: nlQuery si rolu berie zo session, nie z `role` v tele požiadavky
      try { res = await nlQuery({ data: { query: sv.query, role: data.role, token: data.token, sort: ((sv.sort as "score" | "area" | "owners") || "score"), llm: false } }); } catch { continue; }
      const hits = res?.lv.results ?? [];
      const seen = new Set((await q<{ gid: string }>("SELECT gid FROM alert_seen WHERE saved_id=?", [sv.id])).map((r) => r.gid));
      const firstRun = seen.size === 0;
      const fresh = hits.filter((h) => !seen.has(`${h.dataset_id}:${h.lv_no}`));
      for (const h of fresh) await q("INSERT OR IGNORE INTO alert_seen (saved_id,gid) VALUES (?,?)", [sv.id, `${h.dataset_id}:${h.lv_no}`]);
      await q("UPDATE saved_search SET last_run=datetime('now') WHERE id=?", [sv.id]);
      if (firstRun || !fresh.length) continue;
      newTotal += fresh.length;
      const body = `🔔 „${sv.name}": ${fresh.length} nových LV — ` + fresh.slice(0, 8).map((h) => `${h.ku_name ?? ""} LV${h.lv_no}`).join(", ") + (fresh.length > 8 ? ` +${fresh.length - 8}` : "");
      const chans = sv.channels.split(",").map((c) => c.trim());
      if (chans.includes("inapp")) await q("INSERT INTO notifications (user_id,kind,subject_type,subject_id,body) VALUES (?,?,?,?,?)", [u.id, "alert", "search", String(sv.id), body]);
      if (chans.includes("telegram")) await sendTelegramAlert(body);
    }
    return { ok: true, checked: rows.length, newTotal };
  });

// ——— Systémový alert-runner (Fáza 2) — volaný z /api/run-alerts (Mac launchd cron). ———
// Prejde alerty VŠETKÝCH userov + ÚP zmeny. In-app notifikácie zapisuje do D1; texty vráti,
// aby ich cron poslal do Telegramu (TG creds sú na Mac strane, netreba CF secret).
async function runAllAlertsCore(): Promise<{ checked: number; newTotal: number; messages: string[] }> {
  const messages: string[] = [];
  let checked = 0, newTotal = 0;
  // 0) STRÁŽCA ZBERU INZERCIE — nezávislý od cloudového workflowu (ten hlási vlastné zlyhania, ale keby
  // GitHub nespustil nič, nemal by kto). Mesiac 10–11/2026 zber potichu nefungoval a nikto nevedel.
  try {
    const m = (await q<{ d: string | null; n: number }>(
      "SELECT MAX(last_seen) d, (SELECT COUNT(*) FROM market_listings WHERE last_seen = (SELECT MAX(last_seen) FROM market_listings)) n FROM market_listings"))[0];
    if (m?.d) {
      const age = Math.floor((Date.now() - Date.parse(`${m.d}T12:00:00Z`)) / 86400000);
      const warn = age >= 2 ? `⚠️ Zber inzercie neprebehol ${age} dni — posledné dáta z ${m.d}. Ceny, príležitosti a radar sú zastarané.`
        : m.n < 3000 ? `⚠️ Zber inzercie ${m.d}: len ${m.n} videných inzerátov (bežne 15–25 tis.) — zber je neúplný.` : null;
      // raz denne (alerty volá Mac aj cloud, viackrát denne) — tg_deliveries ako zámok dňa
      if (warn) {
        const got = await q<{ key: string }>("INSERT OR IGNORE INTO tg_deliveries (key,runner,status,claimed_at,sent_at) VALUES (?, 'alerts', 'sent', datetime('now'), datetime('now')) RETURNING key",
          [`watchdog:${new Date().toISOString().slice(0, 10)}`]).catch(() => []);
        if (got.length) messages.push(warn);
      }
    }
  } catch { /* market_listings voliteľné */ }
  // 1) Uložené hľadania všetkých userov (alert=1)
  const searches = await q<SavedSearchRow & { user_id: string }>(
    "SELECT id,user_id,name,query,sort,alert,channels,last_run,created_at FROM saved_search WHERE alert=1").catch(() => []);
  for (const sv of searches) {
    checked++;
    const role = ((await q<{ role: string }>("SELECT role FROM users WHERE id=?", [sv.user_id]))[0]?.role ?? "analytik") as Role;
    let res: Awaited<ReturnType<typeof nlQuery>> | null = null;
    try { res = await nlQuery({ data: { query: sv.query, role, sort: ((sv.sort as "score" | "area" | "owners") || "score"), llm: false } }); } catch { continue; }
    const hits = res?.lv.results ?? [];
    const seen = new Set((await q<{ gid: string }>("SELECT gid FROM alert_seen WHERE saved_id=?", [sv.id])).map((r) => r.gid));
    const firstRun = seen.size === 0;
    const fresh = hits.filter((h) => !seen.has(`${h.dataset_id}:${h.lv_no}`));
    for (const h of fresh) await q("INSERT OR IGNORE INTO alert_seen (saved_id,gid) VALUES (?,?)", [sv.id, `${h.dataset_id}:${h.lv_no}`]);
    await q("UPDATE saved_search SET last_run=datetime('now') WHERE id=?", [sv.id]);
    if (firstRun || !fresh.length) continue;
    newTotal += fresh.length;
    const body = `🔔 „${sv.name}": ${fresh.length} nových LV — ` + fresh.slice(0, 8).map((h) => `${h.ku_name ?? ""} LV${h.lv_no}`).join(", ") + (fresh.length > 8 ? ` +${fresh.length - 8}` : "");
    const chans = (sv.channels || "inapp").split(",").map((c) => c.trim());
    if (chans.includes("inapp")) await q("INSERT INTO notifications (user_id,kind,subject_type,subject_id,body) VALUES (?,?,?,?,?)", [sv.user_id, "alert", "search", String(sv.id), body]);
    if (chans.includes("telegram")) messages.push(body);
  }
  // 2) ÚP zmeny: presunuté do ranného súhrnu (/api/tg-digest) — len reálne udalosti v okresoch súhrnu
  // a každá raz. Tu sa posielali pri každom volaní za posledné 2 dni → tá istá správa až 4× denne.
  // 3) KUPUJÚCI — nové zhody aktívnych dopytov (pozemkové príležitosti + inzeráty). Prvý prechod dopytu
  // je základ: zhody sa len zaevidujú. In-app správa ide autorovi dopytu s menom; do Telegramu (skupina)
  // sa meno OSOBY neposiela — len číslo dopytu (osobný údaj), firmy menom.
  try {
    const reqs = await q<BuyerRequest & { user_id: string | null; last_matched: string | null }>(
      "SELECT * FROM buyer_requests WHERE status='aktivny'");
    const dss = reqs.length ? await q<DsRow>("SELECT id, ku_code, ku_name, region FROM datasets") : [];
    for (const r of reqs) {
      checked++;
      const m = await matchBuyer(r, dss);
      const keys = [
        ...m.land.map((x) => ({ k: `L:${x.kodKu}:${x.parcels ?? ""}:${x.purpose ?? ""}`, t: `${x.kuName ?? x.kodKu} ${Math.round(x.areaM2 ?? 0)} m²` })),
        ...m.listings.map((x) => ({ k: `M:${x.url ?? x.title ?? ""}`, t: `${x.obec ?? x.okres ?? ""} ${x.priceEur ? Math.round(x.priceEur).toLocaleString("sk-SK") + " €" : ""}`.trim() })),
      ];
      const seen = new Set((await q<{ mkey: string }>("SELECT mkey FROM buyer_match_seen WHERE request_id=?", [r.id])).map((x) => x.mkey));
      const fresh = keys.filter((x) => !seen.has(x.k));
      for (const x of fresh) await q("INSERT OR IGNORE INTO buyer_match_seen (request_id, mkey) VALUES (?,?)", [r.id, x.k]);
      const firstRun = r.last_matched == null;
      await q("UPDATE buyer_requests SET last_matched=datetime('now') WHERE id=?", [r.id]);
      if (firstRun || !fresh.length) continue;
      newTotal += fresh.length;
      const nLand = fresh.filter((x) => x.k.startsWith("L:")).length, nList = fresh.length - nLand;
      const what = [nLand ? `${nLand} pozemok/pozemky` : "", nList ? `${nList} inzerát(y)` : ""].filter(Boolean).join(", ");
      if (r.user_id) await q("INSERT INTO notifications (user_id,kind,subject_type,subject_id,body) VALUES (?,?,?,?,?)",
        [r.user_id, "buyer_match", "buyer", String(r.id), `🤝 Dopyt „${r.name}": nové zhody — ${what}: ` + fresh.slice(0, 5).map((x) => x.t).join(" · ")]);
      messages.push(`🤝 Dopyt #${r.id} (${r.kind === "osoba" ? "osoba" : r.name}, ${r.ptype}): nové zhody — ${what}`);
    }
  } catch { /* buyer_requests voliteľné (pred migráciou 0090/0091) */ }
  // Pozn.: zmeny v katastri (change_log) sa zámerne NEposielajú do Telegramu — zobrazujú sa len
  // v sekcii „História zmien" na výpise LV (rozhodnutie 2026-09-12).
  return { checked, newTotal, messages };
}

// Volané z route /api/run-alerts — overí zdieľaný secret (D1 market_meta.alert_secret) a spustí runner.
export const runAlertsCron = createServerFn({ method: "POST" })
  .validator(z.object({ secret: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; checked?: number; newTotal?: number; messages?: string[]; message?: string; purged?: { contacts: number; buyers: number; dealTasks: number; dealNotes: number } }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const r = await runAllAlertsCore();
    // raz denne: uchovávanie osobných údajov (OI-14) — beží s alertmi, ktoré volá cloud 2× denne
    const purged = await purgeExpiredPersonalData().catch(() => null);
    return { ok: true, ...r, ...(purged ? { purged } : {}) };
  });

// ——— Uchovávanie osobných údajov (OI-14, rozhodnutie vlastníka 2026-11-11) ———
// Pracovné záznamy o ľuďoch (kontaktný denník, úlohy a poznámky dealu, evidencia dopytu) sa uchovávajú
// 5 ROKOV od poslednej zmeny, ak k nim nie je otvorený deal. GDPR námietky a výmazy (suppression) sa
// uchovávajú VŽDY — inak by sa vymazaní ľudia vrátili s ďalším importom. Údaje z katastra (lv_owners)
// sa sem nerátajú: obnovujú sa s každým importom zo zdroja.
// POZOR (authz-guard): funkcia stojí hneď za runAlertsCron, lebo stráž priraďuje kód medzi server
// funkciami tej predchádzajúcej — a tá má secret.
const RETENTION = "-5 years";
async function purgeExpiredPersonalData(): Promise<{ contacts: number; buyers: number; dealTasks: number; dealNotes: number } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const last = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='retention_last_run'").catch(() => []))[0]?.value;
  if (last === today) return null;
  const del = async (sql: string) => (await q<{ id: number }>(`${sql} RETURNING id`)).length;
  const closedOld = `SELECT id FROM deals WHERE status IN ('closed_won','closed_lost') AND updated_at < datetime('now', '${RETENTION}')`;
  const contacts = await del(
    `DELETE FROM contact_log WHERE created_at < datetime('now', '${RETENTION}')
       AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.dataset_id = contact_log.dataset_id AND d.lv_no = contact_log.lv_no
                       AND d.status NOT IN ('closed_won','closed_lost'))`);
  const dealTasks = await del(`DELETE FROM deal_tasks WHERE deal_id IN (${closedOld})`);
  const dealNotes = await del(`DELETE FROM deal_notes WHERE deal_id IN (${closedOld})`);
  const oldBuyers = `SELECT id FROM buyer_requests WHERE COALESCE(updated_at, created_at) < datetime('now', '${RETENTION}')`;
  await q(`DELETE FROM buyer_match_seen WHERE request_id IN (${oldBuyers})`);
  const buyers = await del(`DELETE FROM buyer_requests WHERE id IN (${oldBuyers})`);
  await q("INSERT INTO market_meta (key,value) VALUES ('retention_last_run', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [today]);
  if (contacts + dealTasks + dealNotes + buyers > 0) {
    await logAudit("retention.purge", "system", `Uchovávanie 5 rokov: zmazané kontakty ${contacts}, úlohy dealov ${dealTasks}, poznámky dealov ${dealNotes}, dopyty ${buyers}`);
  }
  return { contacts, buyers, dealTasks, dealNotes };
}

// ——— Fáza 3: História zmien v katastri (change_log) ———
export type ChangeRow = { id: number; dataset_id: string | null; lv_no: number | null; parcel_no: string | null; entity: string; field: string | null; old_value: string | null; new_value: string | null; change_type: string; importance: string; detected_at: string };
// História zmien pre LV alebo parcelu (číta sa na výpise/detaile). Fail-soft pred 0065.
export const getChanges = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number().optional(), parcelNo: z.string().optional(), limit: z.number().optional() }))
  .handler(async ({ data }): Promise<ChangeRow[]> => {
    const cond = ["dataset_id = ?"]; const args: unknown[] = [data.datasetId];
    if (data.lvNo != null) { cond.push("lv_no = ?"); args.push(data.lvNo); }
    if (data.parcelNo) { cond.push("parcel_no = ?"); args.push(data.parcelNo); }
    return q<ChangeRow>(`SELECT id,dataset_id,lv_no,parcel_no,entity,field,old_value,new_value,change_type,importance,detected_at FROM change_log WHERE ${cond.join(" AND ")} ORDER BY id DESC LIMIT ?`, [...args, data.limit ?? 50]).catch(() => []);
  });
// Bulk ingest zmien z canonical diff enginu (Mac) — secret-gated (rovnaký alert_secret z D1).
export const ingestChanges = createServerFn({ method: "POST" })
  .validator(z.object({ secret: z.string(), runId: z.string().optional(), changes: z.array(z.object({ datasetId: z.string().optional(), lvNo: z.number().optional(), parcelNo: z.string().optional(), entity: z.string(), field: z.string().optional(), oldValue: z.string().optional(), newValue: z.string().optional(), changeType: z.string(), importance: z.string().optional() })).max(1000) }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const stmt = DB.prepare("INSERT INTO change_log (dataset_id,lv_no,parcel_no,entity,field,old_value,new_value,change_type,importance,run_id) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const batch = data.changes.map((c) => stmt.bind(c.datasetId ?? null, c.lvNo ?? null, c.parcelNo ?? null, c.entity, c.field ?? null, c.oldValue ?? null, c.newValue ?? null, c.changeType, c.importance ?? "normal", data.runId ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.changes.length };
  });

// Bulk zápis per-nehnuteľnosť akvizícií (Mac → asset_acquisitions). Auth = alert_secret.
// replaceKu: pred vložením zmaže dané k.ú. (idempotentný re-push). Batch ≤1000 riadkov/volanie.
export const ingestAcquisitions = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceKu: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      kodKu: z.string(), kuName: z.string().optional(), lvNumber: z.string().optional(),
      assetType: z.string().optional(), assetId: z.number().optional(), unitNumber: z.string().optional(),
      areaM2: z.number().optional(), kind: z.string().optional(), regYear: z.number().optional(),
      instYear: z.number().optional(), addrDiffers: z.number().optional(), hasPerson: z.number().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceKu && data.replaceKu.length) {
      const ph = data.replaceKu.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM asset_acquisitions WHERE kod_ku IN (${ph})`).bind(...data.replaceKu).run();
    }
    const stmt = DB.prepare("INSERT INTO asset_acquisitions (kod_ku,ku_name,lv_number,asset_type,asset_id,unit_number,area_m2,acquisition_kind,registration_year,instrument_year,owner_addr_differs,has_person) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    const batch = data.rows.map((r) => stmt.bind(r.kodKu, r.kuName ?? null, r.lvNumber ?? null, r.assetType ?? null, r.assetId ?? null, r.unitNumber ?? null, r.areaM2 ?? null, r.kind ?? null, r.regYear ?? null, r.instYear ?? null, r.addrDiffers ?? 0, r.hasPerson ?? 0));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

// Bulk zápis POZEMKOVÝCH PRÍLEŽITOSTÍ (Mac gold_li_engine → landsearch_results). Auth = alert_secret.
// replaceKu: pred vložením zmaže dané k.ú. (idempotentný re-push). Batch ≤1000 riadkov/volanie.
export const ingestLandsearch = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceKu: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      kodKu: z.string(), kuName: z.string().optional(), purpose: z.string().optional(),
      verdict: z.string().optional(), quality: z.number().optional(), areaM2: z.number().optional(),
      nParcels: z.number().optional(), parcels: z.string().optional(), shape: z.string().optional(),
      zone: z.string().optional(), build: z.string().optional(), access: z.number().optional(),
      slope: z.number().optional(), frontage: z.number().optional(), ppf: z.number().optional(),
      existingUse: z.string().optional(), yard: z.string().optional(), accessTimes: z.string().optional(),
      owners: z.string().optional(), nOwners: z.number().optional(), reason: z.string().optional(),
      druh: z.string().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceKu && data.replaceKu.length) {
      const ph = data.replaceKu.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM landsearch_results WHERE kod_ku IN (${ph})`).bind(...data.replaceKu).run();
    }
    const stmt = DB.prepare("INSERT INTO landsearch_results (kod_ku,ku_name,purpose,verdict,quality,area_m2,n_parcels,parcels,shape,zone,build,access,slope,frontage,ppf,existing_use,yard,access_times,owners,n_owners,reason,druh) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const batch = data.rows.map((r) => stmt.bind(r.kodKu, r.kuName ?? null, r.purpose ?? null, r.verdict ?? null, r.quality ?? null, r.areaM2 ?? null, r.nParcels ?? null, r.parcels ?? null, r.shape ?? null, r.zone ?? null, r.build ?? null, r.access ?? null, r.slope ?? null, r.frontage ?? null, r.ppf ?? 0, r.existingUse ?? null, r.yard ?? null, r.accessTimes ?? null, r.owners ?? null, r.nOwners ?? null, r.reason ?? null, r.druh ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

// ——— GOLD 04: VYSPORIADANIE POZEMKOV (settlement candidates z Mac enginu → settlement_cases) ———
// Bulk zápis kandidátov (stavba má vlastný LV, ale podložná C/E parcela má iných vlastníkov).
// Auth = alert_secret. Per kod_ku replace (replaceKu). Vlastníci sú anonymizovaní — žiadne PII.
export const ingestSettlement = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceKu: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      // .nullable() aj .optional(): klient smie poslať chýbajúci kľúč AJ explicitný null (handler ich zjednotí na null)
      kodKu: z.string(), kuName: z.string().nullable().optional(),
      buildingId: z.string().nullable().optional(), buildingDesc: z.string().nullable().optional(),
      parcelNo: z.string().nullable().optional(), register: z.string().nullable().optional(),
      landLvNo: z.number().nullable().optional(), classification: z.string(),
      score: z.number().nullable().optional(), nLandOwners: z.number().nullable().optional(),
      hasSpf: z.number().nullable().optional(), hasUnknown: z.number().nullable().optional(),
      viaE: z.number().nullable().optional(), reason: z.string().nullable().optional(),
      minorityShare: z.number().nullable().optional(), landAreaM2: z.number().nullable().optional(),
      landDruh: z.string().nullable().optional(), buyoutEur: z.number().nullable().optional(),
      outreachJson: z.string().nullable().optional(), criteriaJson: z.string().nullable().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceKu && data.replaceKu.length) {
      const ph = data.replaceKu.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM settlement_cases WHERE kod_ku IN (${ph})`).bind(...data.replaceKu).run();
    }
    const stmt = DB.prepare("INSERT INTO settlement_cases (kod_ku,ku_name,building_id,building_desc,parcel_no,register,land_lv_no,classification,score,n_land_owners,has_spf,has_unknown,via_e,reason,minority_share,land_area_m2,land_druh,buyout_eur,outreach_json,criteria_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const batch = data.rows.map((r) => stmt.bind(r.kodKu, r.kuName ?? null, r.buildingId ?? null, r.buildingDesc ?? null, r.parcelNo ?? null, r.register ?? null, r.landLvNo ?? null, r.classification, r.score ?? null, r.nLandOwners ?? null, r.hasSpf ?? 0, r.hasUnknown ?? 0, r.viaE ?? 0, r.reason ?? null, r.minorityShare ?? 0, r.landAreaM2 ?? null, r.landDruh ?? null, r.buyoutEur ?? null, r.outreachJson ?? null, r.criteriaJson ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

// Čítanie kandidátov vysporiadania (join na datasets pre deep-link do LV výpisu). Malá tabuľka → plný select.
export type SettlementRow = {
  kod_ku: string; ku_name: string | null; dataset_id: string | null;
  building_id: string | null; building_desc: string | null; parcel_no: string | null;
  register: string | null; land_lv_no: number | null; classification: string;
  score: number | null; n_land_owners: number | null; has_spf: number; has_unknown: number;
  via_e: number; reason: string | null;
  minority_share: number; land_area_m2: number | null; land_druh: string | null; buyout_eur: number | null;
  outreach_json: string | null; criteria_json: string | null;
};
export const getSettlementCases = createServerFn({ method: "POST" })
  .validator(z.object({ kodKu: z.string().optional() }))
  .handler(async ({ data }): Promise<SettlementRow[]> => {
    const where = data.kodKu ? "AND sc.kod_ku = ?" : "";
    const args = data.kodKu ? [data.kodKu] : [];
    return await q<SettlementRow>(
      `SELECT sc.kod_ku, COALESCE(ds.ku_name, sc.ku_name) AS ku_name, ds.id AS dataset_id,
              sc.building_id, sc.building_desc, sc.parcel_no, sc.register, sc.land_lv_no,
              sc.classification, sc.score, sc.n_land_owners, sc.has_spf, sc.has_unknown, sc.via_e, sc.reason,
              sc.minority_share, sc.land_area_m2, sc.land_druh, sc.buyout_eur, sc.outreach_json, sc.criteria_json
       FROM settlement_cases sc LEFT JOIN datasets ds ON ds.ku_code = sc.kod_ku
       WHERE sc.classification IN ('MATCH','PROVISIONAL') ${where}
       ORDER BY sc.classification, sc.buyout_eur DESC, sc.n_land_owners DESC, sc.parcel_no`,
      args,
    ).catch(() => []);
  });

// ——— PROPERTY-360: prepojené signály pre JEDNU parcelu (zjednotenie goldenov na karte Dossier) ———
// Vysporiadanie (GOLD 04) + land-search príležitosť (GOLD-LI) + deal v pipeline — pre dossier parcely.
export type Property360 = {
  settlement: { parcel_no: string | null; register: string | null; classification: string; buyout_eur: number | null; n_land_owners: number | null; minority_share: number; land_lv_no: number | null; via_e: number; criteria_json: string | null }[];
  landsearch: { purpose: string | null; verdict: string | null; quality: number | null; parcels: string | null }[];
  deal: { id: string; status: string; lv_no: number } | null;
};
export const getProperty360 = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), parcelNo: z.string(), lvNo: z.number().nullable().optional() }))
  .handler(async ({ data }): Promise<Property360> => {
    const empty: Property360 = { settlement: [], landsearch: [], deal: null };
    const ku = (await q<{ ku_code: string }>("SELECT ku_code FROM datasets WHERE id=?", [data.datasetId]).catch(() => []))[0]?.ku_code;
    if (!ku) return empty;
    let lvNo = data.lvNo ?? null;
    if (lvNo == null) {
      lvNo = (await q<{ lv_no: number }>("SELECT lv_no FROM parcels WHERE dataset_id=? AND parcel_no=? AND lv_no IS NOT NULL LIMIT 1", [data.datasetId, data.parcelNo]).catch(() => []))[0]?.lv_no ?? null;
    }
    const settlement = await q<Property360["settlement"][number]>(
      `SELECT parcel_no, register, classification, buyout_eur, n_land_owners, minority_share, land_lv_no, via_e, criteria_json
       FROM settlement_cases WHERE kod_ku=? AND (parcel_no=? OR (land_lv_no IS NOT NULL AND land_lv_no=?))
       ORDER BY classification, buyout_eur DESC LIMIT 10`,
      [ku, data.parcelNo, lvNo],
    ).catch(() => []);
    const landsearch = await q<Property360["landsearch"][number]>(
      `SELECT purpose, verdict, quality, parcels FROM landsearch_results
       WHERE kod_ku=? AND (', '||parcels||', ') LIKE ? ORDER BY quality DESC LIMIT 5`,
      [ku, `%, ${data.parcelNo}, %`],
    ).catch(() => []);
    const deal = lvNo != null
      ? ((await q<{ id: string; status: string; lv_no: number }>("SELECT id, status, lv_no FROM deals WHERE dataset_id=? AND lv_no=? LIMIT 1", [data.datasetId, lvNo]).catch(() => []))[0] ?? null)
      : null;
    return { settlement, landsearch, deal };
  });

// ——— GOLD-ZA: ZDEDENÉ BYTY (dedenie 2025-26, nie 1./posledné podlažie, iná adresa vlastníka) ———
// Bulk zápis kandidátov z Mac enginu (gold_za_find/gold_za_live, candidate.py model). Auth = alert_secret.
// Per kod_ku replace. Anonymizované — owner_obec je hrubá (mesto), nie ulica/meno.
export const ingestZA = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceKu: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      kodKu: z.string(), kuName: z.string().nullable().optional(),
      flatId: z.string().nullable().optional(), lvNo: z.number().nullable().optional(),
      floor: z.number().nullable().optional(), buildingMinFloor: z.number().nullable().optional(),
      buildingMaxFloor: z.number().nullable().optional(), classification: z.string(),
      score: z.number().nullable().optional(), instrumentYear: z.number().nullable().optional(),
      registrationYear: z.number().nullable().optional(), ownerObec: z.string().nullable().optional(),
      reason: z.string().nullable().optional(), criteriaJson: z.string().nullable().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceKu && data.replaceKu.length) {
      const ph = data.replaceKu.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM za_cases WHERE kod_ku IN (${ph})`).bind(...data.replaceKu).run();
    }
    const stmt = DB.prepare("INSERT INTO za_cases (kod_ku,ku_name,flat_id,lv_no,floor,building_min_floor,building_max_floor,classification,score,instrument_year,registration_year,owner_obec,reason,criteria_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const batch = data.rows.map((r) => stmt.bind(r.kodKu, r.kuName ?? null, r.flatId ?? null, r.lvNo ?? null, r.floor ?? null, r.buildingMinFloor ?? null, r.buildingMaxFloor ?? null, r.classification, r.score ?? null, r.instrumentYear ?? null, r.registrationYear ?? null, r.ownerObec ?? null, r.reason ?? null, r.criteriaJson ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

export type ZARow = {
  kod_ku: string; ku_name: string | null; dataset_id: string | null;
  flat_id: string | null; lv_no: number | null; floor: number | null;
  building_min_floor: number | null; building_max_floor: number | null;
  classification: string; score: number | null; instrument_year: number | null;
  registration_year: number | null; owner_obec: string | null; reason: string | null;
  criteria_json: string | null;
};
export const getZACases = createServerFn({ method: "POST" })
  .validator(z.object({ kodKu: z.string().optional() }))
  .handler(async ({ data }): Promise<ZARow[]> => {
    const where = data.kodKu ? "AND zc.kod_ku = ?" : "";
    const args = data.kodKu ? [data.kodKu] : [];
    return await q<ZARow>(
      `SELECT zc.kod_ku, COALESCE(ds.ku_name, zc.ku_name) AS ku_name, ds.id AS dataset_id,
              zc.flat_id, zc.lv_no, zc.floor, zc.building_min_floor, zc.building_max_floor,
              zc.classification, zc.score, zc.instrument_year, zc.registration_year, zc.owner_obec, zc.reason,
              -- Maticu kritérií len pri MATCH: „na preskúmanie" je v Žiline ~6 400 bytov a matica
              -- (~1 kB/byt) by kartu nafúkla na MB; čo treba overiť, nesie konkrétny dôvod (reason).
              CASE WHEN zc.classification = 'MATCH' THEN zc.criteria_json END AS criteria_json
       FROM za_cases zc LEFT JOIN datasets ds ON ds.ku_code = zc.kod_ku
       WHERE zc.classification IN ('MATCH','PROVISIONAL') ${where}
       ORDER BY zc.classification, zc.instrument_year DESC, zc.lv_no`,
      args,
    ).catch(() => []);
  });

// ——— Klientsky report A–H (dok. 16 §3) ———
// Jeden dopyt = jeden report. Skladá sa z toho, čo už v D1 je: kandidáti (up_cases), štatistika
// behu (scenario_runs) a matica kritérií uložená pri kandidátovi. Normalizovaný brief v sekcii B sa
// NEvymýšľa — odvodzuje sa z `criteria` prvého kandidáta, čo sú reálne pravidlá, podľa ktorých beh
// klasifikoval. Ak niečo nemáme, sekcia to povie, nedopĺňa sa odhadom (§4).
const PURPOSE_SK: Record<string, string> = { residential: "bývanie", retail: "retail", industrial: "priemysel" };
export type ClientReportCriterion = { key: string; effect: string; outcome: string; note: string | null };
// Normalizovaný riadok shortlistu — UI je spoločné pre všetky scenáre, líšia sa len stĺpce.
export type ClientReportItem = {
  id: string; title: string; subtitle: string | null;
  cols: { label: string; value: string }[];
  classification: string; reason: string | null; criteriaJson: string | null;
  datasetId: string | null; lvNo: number | null; parcelNo: string | null;
};
export type ClientReport = {
  scenario: string; kodKu: string; kuName: string | null; asOf: string | null;
  hasDataset: boolean;                     // k.ú. má v appke importovaný dataset (parcely/LV/vlastníci)
  run: ScenarioRun | null;
  nMatch: number; nProvisional: number;
  brief: ClientReportCriterion[];          // B — normalizovaný brief (MUST / MUST_NOT / PREFER / AVOID)
  colLabels: string[];                     // D — hlavička tabuľky podľa scenára
  shortlist: ClientReportItem[];           // D + E
  uncertainties: { text: string; n: number }[];  // G — agregované neistoty z kandidátov
  zoningSources: { src: string; n: number }[];   // C + H — z čoho pochádza funkčné využitie
  // Dok. 16: „Report má revision a checksum… Pred uložením artefaktu over rovnaký `result_hash`,
  // počty, hodnoty, jednotky a statusy vo VŠETKÝCH formátoch. Čas renderovania sa môže líšiť;
  // analytický obsah nie." Hash sa preto počíta LEN z analytického obsahu — nie z času, v ktorom
  // sa report vykreslil. Vytlačená stránka a strojový JSON tak nesú ten istý súčet a dá sa
  // dokázať, že ide o ten istý výsledok.
  resultHash: string;        // SHA-256 (16 znakov) analytického obsahu
  revision: string;          // as_of dát + hash — čo klient cituje
  generatedAt: string;       // čas vykreslenia; do hashu NEvstupuje
  // Úplnosť (dok. 05 LI12/ZA10, dok. 10 E19): koľko engine našiel vs. koľko report ukazuje. Push
  // land-searchu posiela najviac 25–40 celkov na profil — bez tohto by report mlčky tvrdil úplnosť.
  completeness: { found: number | null; shown: number; truncated: boolean };
  // Prečo je výsledok prázdny (dok. 10 E09) — „0 kandidátov" má rôzny pôvod a rôznu obchodnú hodnotu.
  emptyReason: string | null;
  // Zakázané formulácie (dok. 16 §4) v texte z enginov — kontrolované kódom, nie ručne.
  phraseIssues: PhraseIssue[];
  // OI-14 (rozhodnutie vlastníka 2026-11-11): mená fyzických osôb LEN na výslovné povolenie pri
  // konkrétnom reporte a len pre rolu s plným prístupom; vydanie sa zaeviduje s príznakom.
  withNames: boolean;
  namesNote: string | null;
};
// SHA-256 → prvých 16 hex znakov. Stačí na identitu výsledku; nie je to kryptografický podpis.
async function sha256Hex(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export const getClientReport = createServerFn({ method: "POST" })
  .validator(z.object({ scenario: z.string(), kodKu: z.string(), token: z.string().optional(), withNames: z.boolean().optional() }))
  .handler(async ({ data }): Promise<ClientReport> => {
    // Mená len keď ich používateľ pri tomto reporte výslovne zapne A rola zo session má plný prístup.
    const namesWanted = !!data.withNames;
    const namesOk = namesWanted && ownerAccess(await roleFromToken(data.token)) === "full";
    const supNames = namesOk ? await suppressedNameSet() : new Set<string>();
    const keepName = (n: string) => !!n.trim() && !supNames.has(normName(n));
    let namesNote: string | null = namesWanted && !namesOk ? "Mená vlastníkov môže do reportu zahrnúť len rola s plným prístupom k vlastníkom." : null;
    const run = (await q<ScenarioRun>(
      "SELECT * FROM scenario_runs WHERE scenario = ? AND kod_ku = ?", [data.scenario, data.kodKu],
    ).catch(() => []))[0] ?? null;

    const eurTxt = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("sk-SK")} €`);
    const m2Txt = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("sk-SK")} m²`);
    let colLabels: string[] = [];
    let rows: ClientReportItem[] = [];
    let criteriaSample: string | null = null;
    let kuName: string | null = null;
    const zs = new Map<string, number>();

    if (data.scenario === "up") {
      const src = await q<UPRow>(
        `SELECT uc.*, COALESCE(ds.ku_name, uc.ku_name) AS ku_name, ds.id AS dataset_id
         FROM up_cases uc LEFT JOIN datasets ds ON ds.ku_code = uc.kod_ku
         WHERE uc.kod_ku = ? AND uc.classification IN ('MATCH','PROVISIONAL')
         ORDER BY COALESCE(uc.chranena,0),
                  CASE WHEN uc.naklad_vynatie_eur IS NULL THEN 1 ELSE 0 END,
                  uc.naklad_vynatie_eur`, [data.kodKu]).catch(() => []);
      colLabels = ["Parcely", "Výmera", "Druh", "Zóna", "Vyňatie"];
      rows = src.map((x, i) => ({
        id: `${data.kodKu}-${i + 1}`,
        title: `${m2Txt(x.area_m2)} · ${x.druh ?? "—"}`,
        subtitle: `zóna ${x.zone ?? "—"} · BPEJ skup. ${x.bpej_skupina ?? "—"}${x.chranena ? " · chránená pôda" : ""}`,
        cols: [
          { label: "Parcely", value: x.parcels ?? "—" }, { label: "Výmera", value: m2Txt(x.area_m2) },
          { label: "Druh", value: x.druh ?? "—" }, { label: "Zóna", value: x.zone ?? "—" },
          { label: "Vyňatie", value: eurTxt(x.naklad_vynatie_eur) },
        ],
        classification: x.classification, reason: x.reason, criteriaJson: x.criteria_json,
        datasetId: x.dataset_id, lvNo: x.lv_no, parcelNo: (x.parcels ?? "").split(",")[0].trim() || null,
      }));
      for (const x of src) if (x.zoning_src) zs.set(x.zoning_src, (zs.get(x.zoning_src) ?? 0) + 1);
      if (namesOk) {
        const did = src.find((x) => x.dataset_id)?.dataset_id ?? null;
        const lvs = [...new Set(src.map((x) => x.lv_no).filter((n): n is number => n != null))];
        const own = did && lvs.length ? await q<{ lv_no: number; name: string }>(
          `SELECT lv_no, name FROM lv_owners WHERE dataset_id = ? AND lv_no IN (${lvs.map(() => "?").join(",")}) ORDER BY id`,
          [did, ...lvs]).catch(() => []) : [];
        const byLv = new Map<number, string[]>();
        for (const o of own) if (keepName(o.name)) byLv.set(o.lv_no, [...(byLv.get(o.lv_no) ?? []), o.name]);
        colLabels = [...colLabels, "Vlastníci (mená)"];
        rows = rows.map((r) => {
          const n = r.lvNo != null ? byLv.get(r.lvNo) ?? [] : [];
          return { ...r, cols: [...r.cols, { label: "Vlastníci (mená)", value: n.length ? n.slice(0, 8).join("; ") + (n.length > 8 ? ` a ďalší (${n.length - 8})` : "") : "—" }] };
        });
      }
      criteriaSample = src[0]?.criteria_json ?? null;
      kuName = src[0]?.ku_name ?? null;
    } else if (data.scenario === "settlement") {
      const src = await q<SettlementRow>(
        `SELECT sc.*, COALESCE(ds.ku_name, sc.ku_name) AS ku_name, ds.id AS dataset_id
         FROM settlement_cases sc LEFT JOIN datasets ds ON ds.ku_code = sc.kod_ku
         WHERE sc.kod_ku = ? AND sc.classification IN ('MATCH','PROVISIONAL')
         ORDER BY sc.classification, sc.score DESC`, [data.kodKu]).catch(() => []);
      colLabels = ["Stavba", "Pozemok", "Register", "Vlastníkov", "Odkup"];
      rows = src.map((x, i) => ({
        id: `${data.kodKu}-${i + 1}`,
        title: x.building_desc ?? x.building_id ?? "stavba",
        subtitle: `pozemok ${parcelLabel(x.parcel_no)} (${x.register ?? "?"}) · LV ${x.land_lv_no ?? "—"}`
          + (x.has_spf ? " · SPF/štát" : "") + (x.minority_share ? " · menšinový podiel" : ""),
        cols: [
          { label: "Stavba", value: x.building_desc ?? "—" },
          { label: "Pozemok", value: parcelLabel(x.parcel_no) },
          { label: "Register", value: x.register ?? "—" },
          { label: "Vlastníkov", value: x.n_land_owners == null ? "—" : String(x.n_land_owners) },
          { label: "Odkup", value: eurTxt(x.buyout_eur) },
        ],
        classification: x.classification, reason: x.reason, criteriaJson: x.criteria_json,
        datasetId: x.dataset_id, lvNo: x.land_lv_no, parcelNo: x.parcel_no,
      }));
      criteriaSample = src[0]?.criteria_json ?? null;
      kuName = src[0]?.ku_name ?? null;
    } else if (data.scenario === "landsearch") {
      // POZOR: landsearch_results nesie REÁLNE mená vlastníkov a tento report nemá rolu ani token —
      // mená sa preto do neho zámerne neberú, len ich počet.
      const src = await q<Omit<LandsearchRow, "owners"> & { dataset_id: string | null; owners?: string | null }>(
        `SELECT lr.kod_ku, COALESCE(ds.ku_name, lr.ku_name) AS ku_name, lr.purpose, lr.verdict,
                lr.quality, lr.area_m2, lr.n_parcels, lr.parcels, lr.shape, lr.zone, lr.build,
                lr.slope, lr.frontage, lr.ppf, lr.existing_use, lr.druh, lr.access_times,
                lr.n_owners, lr.reason, ds.id AS dataset_id${namesOk ? ", lr.owners" : ""}
         FROM landsearch_results lr LEFT JOIN datasets ds ON ds.ku_code = lr.kod_ku
         WHERE lr.kod_ku = ? AND lr.verdict IN ('MATCH','PROVISIONAL')
         ORDER BY (lr.verdict='MATCH') DESC, lr.quality DESC`, [data.kodKu]).catch(() => []);
      // „Právny prístup" (SYN-LI-07, rozhodnutie vlastníka 2026-11-11): appka nevie, či k celku vedie
      // vjazd z cesty po vlastnom/verejnom pozemku alebo cez vecné bremeno — každá zhoda nesie „overiť".
      colLabels = ["Parcely", "Výmera", "Účel", "Zóna", "Vlastníkov", "Dostupnosť", "Právny prístup", ...(namesOk ? ["Vlastníci (mená)"] : [])];
      rows = src.map((x, i) => ({
        id: `${data.kodKu}-${i + 1}`,
        title: `${m2Txt(x.area_m2)} · ${PURPOSE_SK[x.purpose ?? ""] ?? x.purpose ?? "—"}`,
        subtitle: `zóna ${zoneLabel(x.zone)} · ${x.n_parcels == null ? "? parciel" : plural(x.n_parcels, "parcela", "parcely", "parciel")} · tvar ${x.shape ?? "—"}`
          + (x.ppf ? " · záber poľnohospodárskeho fondu" : ""),
        cols: [
          { label: "Parcely", value: x.parcels ?? "—" }, { label: "Výmera", value: m2Txt(x.area_m2) },
          { label: "Účel", value: PURPOSE_SK[x.purpose ?? ""] ?? x.purpose ?? "—" },
          { label: "Zóna", value: zoneLabel(x.zone) },
          { label: "Vlastníkov", value: x.n_owners == null ? "—" : String(x.n_owners) },
          { label: "Dostupnosť", value: accessTimesLabel(x.access_times) },
          { label: "Právny prístup", value: "overiť vjazd" },
          ...(namesOk ? [{ label: "Vlastníci (mená)", value: (x.owners ?? "").split(";").map((t) => t.trim()).filter(keepName).join("; ") || "—" }] : []),
        ],
        classification: x.verdict ?? "PROVISIONAL", reason: x.reason, criteriaJson: null,
        datasetId: x.dataset_id, lvNo: null, parcelNo: (x.parcels ?? "").split(",")[0].trim() || null,
      }));
      kuName = src[0]?.ku_name ?? null;
    } else if (data.scenario === "za") {
      const src = await q<ZARow>(
        `SELECT zc.*, COALESCE(ds.ku_name, zc.ku_name) AS ku_name, ds.id AS dataset_id
         FROM za_cases zc LEFT JOIN datasets ds ON ds.ku_code = zc.kod_ku
         WHERE zc.kod_ku = ? AND zc.classification IN ('MATCH','PROVISIONAL')
         ORDER BY zc.classification, zc.instrument_year DESC`, [data.kodKu]).catch(() => []);
      colLabels = ["Byt (podlažie)", "Budova", "LV", "Dedičstvo", "Vlastník mimo"];
      rows = src.map((x, i) => ({
        id: `${data.kodKu}-${i + 1}`,
        title: `Byt, podlažie ${x.floor ?? "—"}`,
        subtitle: `budova ${x.building_min_floor ?? "—"}..${x.building_max_floor ?? "—"} · LV ${x.lv_no ?? "—"}`,
        cols: [
          { label: "Byt (podlažie)", value: x.floor == null ? "—" : String(x.floor) },
          { label: "Budova", value: `${x.building_min_floor ?? "—"}..${x.building_max_floor ?? "—"}` },
          { label: "LV", value: x.lv_no == null ? "—" : String(x.lv_no) },
          { label: "Dedičstvo", value: x.instrument_year == null ? "—" : String(x.instrument_year) },
          { label: "Vlastník mimo", value: x.owner_obec ?? "—" },
        ],
        classification: x.classification, reason: x.reason, criteriaJson: x.criteria_json,
        datasetId: x.dataset_id, lvNo: x.lv_no, parcelNo: null,
      }));
      criteriaSample = src[0]?.criteria_json ?? null;
      kuName = src[0]?.ku_name ?? null;
    }

    type Parsed = { criteria?: ClientReportCriterion[]; uncertainties?: string[] };
    const parse = (s: string | null): Parsed => { try { return s ? JSON.parse(s) as Parsed : {}; } catch { return {}; } };

    // B — brief = kľúče a efekty kritérií tak, ako ich beh reálne použil (nie prepis z dokumentácie).
    // POZOR: `note` jednotlivého kandidáta sa sem NEdáva — je to jeho konkrétna hodnota („zóna:
    // bývanie/rekreácia“, „422 €“) a v zadaní by vyzerala ako požiadavka klienta. Kontrakt §3 B
    // žiada oddeliť podmienky od hodnôt.
    const brief: ClientReportCriterion[] = (parse(criteriaSample).criteria ?? [])
      .map((c) => ({ key: c.key, effect: c.effect, outcome: "", note: null }));

    // G — neistoty naprieč kandidátmi (čo treba doveriť), zoradené podľa početnosti
    const unc = new Map<string, number>();
    for (const r of rows) for (const u of parse(r.criteriaJson).uncertainties ?? []) unc.set(u, (unc.get(u) ?? 0) + 1);

    // ku_code nemajú vyplnené všetky datasety (staršie importy) → fallback na id `kn-<kod>`
    const ds = (await q<{ updated_at: string }>(
      "SELECT updated_at FROM datasets WHERE ku_code = ? OR id = ? LIMIT 1",
      [data.kodKu, `kn-${data.kodKu}`]).catch(() => []))[0] ?? null;

    const asOf = ds?.updated_at ?? run?.as_of ?? null;
    const jadro = {
      scenario: data.scenario, kodKu: data.kodKu, asOf,
      nMatch: rows.filter((r) => r.classification === "MATCH").length,
      nProvisional: rows.filter((r) => r.classification === "PROVISIONAL").length,
      brief, colLabels,
      shortlist: rows.map((r) => ({
        id: r.id, title: r.title, subtitle: r.subtitle, cols: r.cols,
        classification: r.classification, reason: r.reason,
        datasetId: r.datasetId, lvNo: r.lvNo, parcelNo: r.parcelNo,
      })),
      uncertainties: [...unc].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n),
      zoningSources: [...zs].map(([src, n]) => ({ src, n })).sort((a, b) => b.n - a.n),
      run: run && { examined: run.examined, nRejected: run.n_rejected, nPushed: run.n_pushed },
      completeness: (() => {
        const found = run && (run.n_match != null || run.n_provisional != null) ? (run.n_match ?? 0) + (run.n_provisional ?? 0) : null;
        return { found, shown: rows.length, truncated: found != null && rows.length < found };
      })(),
      emptyReason: rows.length > 0 ? null
        : !run ? "Beh scenára pre toto územie nie je evidovaný — nedá sa povedať, či sa hľadalo; prázdny zoznam NIE JE dôkaz, že tu nič nie je."
        : (run.examined ?? 0) === 0 ? "Engine nemal čo preveriť — pre scenár chýbajú vstupné dáta (napr. nadobúdacie tituly, zdroj územného plánu alebo mapové podklady)."
        : ((run.n_match ?? 0) + (run.n_provisional ?? 0)) > 0 ? "Engine kandidátov našiel, ale do appky sa nezapísali (zápis sa nedokončil) — výsledok je neúplný, treba zopakovať zápis."
        : `Všetkých ${run.examined} preverených kandidátov engine vylúčil — dôvody sú v časti F.`,
    };
    const resultHash = await sha256Hex(JSON.stringify(jadro));
    const issues = phraseIssues([
      ...rows.flatMap((r) => [r.title, r.subtitle, r.reason, ...r.cols.map((c) => c.value)]),
      ...jadro.uncertainties.map((u) => u.text),
    ]);
    return {
      ...jadro,
      kuName: kuName ?? run?.ku_name ?? null,
      hasDataset: !!ds,
      run,
      shortlist: rows,
      resultHash,
      revision: `${asOf ?? "bez-dat"}·${resultHash}`,
      generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      phraseIssues: issues,
      withNames: namesOk && (data.scenario === "up" || data.scenario === "landsearch"),
      namesNote: namesNote ?? (namesOk && data.scenario !== "up" && data.scenario !== "landsearch"
        ? "Pri tomto scenári nie sú mená vlastníkov v appke viazané na jednotlivého kandidáta — report ich neobsahuje." : null),
    };
  });

// ——— Evidencia vydaní klientskeho reportu (dok. 16: oprávnený príjemca a účel) ———
export type ReportExportRow = { id: number; format: string; result_hash: string; recipient: string; purpose: string; author: string | null; created_at: string; with_names: number | null };
export const logReportExport = createServerFn({ method: "POST" })
  .validator(z.object({
    token: z.string(), scenario: z.string().max(40), kodKu: z.string().max(20),
    format: z.enum(["json", "csv", "print"]), resultHash: z.string().max(64),
    recipient: z.string().trim().min(2).max(200), purpose: z.string().trim().min(3).max(300),
    withNames: z.boolean().optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    if (data.withNames && ownerAccess(u.role as Role) !== "full") return { ok: false, message: "Report s menami môže vydať len rola s plným prístupom." };
    await q("INSERT INTO report_exports (scenario,kod_ku,format,result_hash,recipient,purpose,user_id,author,with_names) VALUES (?,?,?,?,?,?,?,?,?)",
      [data.scenario, data.kodKu, data.format, data.resultHash, data.recipient, data.purpose, u.id, u.name || u.email, data.withNames ? 1 : 0]);
    await logAudit("report.export", u.role, `Report ${data.scenario}/${data.kodKu} (${data.format}, rev ${data.resultHash})${data.withNames ? " S MENAMI vlastníkov" : ""} → ${data.recipient}`);
    return { ok: true };
  });
export const listReportExports = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), scenario: z.string().max(40), kodKu: z.string().max(20) }))
  .handler(async ({ data }): Promise<ReportExportRow[]> => {
    const u = await requireUser(data.token);
    if (!u) return [];
    return q<ReportExportRow>(
      "SELECT id, format, result_hash, recipient, purpose, author, created_at, with_names FROM report_exports WHERE scenario = ? AND kod_ku = ? ORDER BY id DESC LIMIT 50",
      [data.scenario, data.kodKu]).catch(() => []);
  });

// ——— Štatistika behu scenára (dok. 16 §3 F: „Prečo iné kandidáty neprešli") ———
// Jeden riadok na (scenár, k.ú.). Scenárové pushe posielajú len MATCH+PROVISIONAL, takže počty
// zamietnutých a dôvody vylúčenia musia prísť samostatne, inak by sekcia F bola len odhad.
export type ScenarioRun = {
  scenario: string; kod_ku: string; ku_name: string | null;
  examined: number | null; n_match: number | null; n_provisional: number | null;
  n_rejected: number | null; n_pushed: number | null;
  reasons_json: string | null; params_json: string | null; as_of: string | null;
};
export const ingestScenarioRun = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    rows: z.array(z.object({
      scenario: z.string(), kodKu: z.string(), kuName: z.string().nullable().optional(),
      examined: z.number().nullable().optional(), nMatch: z.number().nullable().optional(),
      nProvisional: z.number().nullable().optional(), nRejected: z.number().nullable().optional(),
      nPushed: z.number().nullable().optional(), reasonsJson: z.string().nullable().optional(),
      paramsJson: z.string().nullable().optional(), asOf: z.string().nullable().optional(),
    })).max(200),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const stmt = DB.prepare(
      `INSERT INTO scenario_runs (scenario,kod_ku,ku_name,examined,n_match,n_provisional,n_rejected,n_pushed,reasons_json,params_json,as_of)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(scenario,kod_ku) DO UPDATE SET ku_name=excluded.ku_name, examined=excluded.examined,
         n_match=excluded.n_match, n_provisional=excluded.n_provisional, n_rejected=excluded.n_rejected,
         n_pushed=excluded.n_pushed, reasons_json=excluded.reasons_json, params_json=excluded.params_json,
         as_of=excluded.as_of`);
    const batch = data.rows.map((r) => stmt.bind(r.scenario, r.kodKu, r.kuName ?? null, r.examined ?? null,
      r.nMatch ?? null, r.nProvisional ?? null, r.nRejected ?? null, r.nPushed ?? null,
      r.reasonsJson ?? null, r.paramsJson ?? null, r.asOf ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

export const getScenarioRun = createServerFn({ method: "POST" })
  .validator(z.object({ scenario: z.string(), kodKu: z.string().optional() }))
  .handler(async ({ data }): Promise<ScenarioRun[]> => {
    const where = data.kodKu ? "AND kod_ku = ?" : "";
    const args: unknown[] = data.kodKu ? [data.scenario, data.kodKu] : [data.scenario];
    return await q<ScenarioRun>(
      `SELECT * FROM scenario_runs WHERE scenario = ? ${where} ORDER BY n_match DESC`, args,
    ).catch(() => []);
  });

// ——— Property-360 §2: sekcie „Tituly" (časť B) a „Ťarchy a poznámky" (časť C) pre dossier ———
// Zdroj je `lv_titles`, rovnaký ako výpis LV — plný text je owner-sensitive (mená, rodné priezviská,
// dátumy narodenia), preto ho vydáme len role s plným prístupom; počty vidí každý.
// KĽÚČOVÉ (kontrakt §2 a §4): „neprítomné dáta nie sú 'bez tiarch'". Preto `hasData` rozlišuje
//   hasData=false → o tomto LV nemáme ŽIADNY záznam časti B/C → stav je NEZNÁMY
//   hasData=true, tarchyCount=0 → v našom snapshote ťarchy nie sú (stále treba overiť na úradnom LV)
export type LvLegal = {
  hasData: boolean; access: OwnerAccess;
  titlesCount: number; tarchyCount: number;
  titles: string[]; tarchy: string[];
};
export const getLvLegal = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<LvLegal> => {
    // rola zo session, nie od klienta (viď roleFromToken)
    const access = ownerAccess(await roleFromToken(data.token));
    const rows = await q<{ kind: string; txt: string }>(
      "SELECT kind, txt FROM lv_titles WHERE dataset_id = ? AND lv_no = ? ORDER BY kind DESC, id",
      [data.datasetId, data.lvNo],
    ).catch(() => []);
    const tit = rows.filter((r) => r.kind === "titul");
    const tar = rows.filter((r) => r.kind === "tarcha");
    return {
      hasData: rows.length > 0,
      access,
      titlesCount: tit.length,
      tarchyCount: tar.length,
      titles: access === "full" ? tit.map((r) => r.txt) : [],
      tarchy: access === "full" ? tar.map((r) => r.txt) : [],
    };
  });

// ——— GOLD-UP: ÚP určil na bývanie, kataster stále vedie ornú/TTP, nestojí na tom nič ———
// Radenie podľa NÁKLADU VYŇATIA z pôdneho fondu (lacné hore, chránená pôda dole) — to je ten
// peňažný rozdiel, pre ktorý scenár existuje. zoning_src rozlišuje presné WMS od orientačného rastra.
// POZOR: classification zámerne NIE je v ORDER BY — karta si filtruje záložky MATCH/PROVISIONAL
// sama, takže radenie podľa nej by v kombinácii s LIMIT vyčerpalo limit na samých MATCH a záložka
// „Na preskúmanie" by ostala navždy prázdna (reálne sa to stalo pri LIMIT 400).
export const ingestUP = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceKu: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      kodKu: z.string(), kuName: z.string().nullable().optional(),
      parcels: z.string().nullable().optional(), nParcels: z.number().nullable().optional(),
      areaM2: z.number().nullable().optional(), zone: z.string().nullable().optional(),
      zoningSrc: z.string().nullable().optional(), druh: z.string().nullable().optional(),
      build: z.string().nullable().optional(), classification: z.string(),
      score: z.number().nullable().optional(), baseVerdict: z.string().nullable().optional(),
      bpejSkupina: z.number().nullable().optional(), odvodEurM2: z.number().nullable().optional(),
      nakladVynatieEur: z.number().nullable().optional(), chranena: z.number().nullable().optional(),
      lvNo: z.number().nullable().optional(), nOwners: z.number().nullable().optional(),
      reason: z.string().nullable().optional(), criteriaJson: z.string().nullable().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceKu && data.replaceKu.length) {
      const ph = data.replaceKu.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM up_cases WHERE kod_ku IN (${ph})`).bind(...data.replaceKu).run();
    }
    const stmt = DB.prepare("INSERT INTO up_cases (kod_ku,ku_name,parcels,n_parcels,area_m2,zone,zoning_src,druh,build,classification,score,base_verdict,bpej_skupina,odvod_eur_m2,naklad_vynatie_eur,chranena,lv_no,n_owners,reason,criteria_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const batch = data.rows.map((r) => stmt.bind(r.kodKu, r.kuName ?? null, r.parcels ?? null, r.nParcels ?? null, r.areaM2 ?? null, r.zone ?? null, r.zoningSrc ?? null, r.druh ?? null, r.build ?? null, r.classification, r.score ?? null, r.baseVerdict ?? null, r.bpejSkupina ?? null, r.odvodEurM2 ?? null, r.nakladVynatieEur ?? null, r.chranena ?? null, r.lvNo ?? null, r.nOwners ?? null, r.reason ?? null, r.criteriaJson ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

export type UPRow = {
  kod_ku: string; ku_name: string | null; dataset_id: string | null;
  parcels: string | null; n_parcels: number | null; area_m2: number | null;
  zone: string | null; zoning_src: string | null; druh: string | null; build: string | null;
  classification: string; score: number | null; base_verdict: string | null;
  bpej_skupina: number | null; odvod_eur_m2: number | null; naklad_vynatie_eur: number | null;
  chranena: number | null; lv_no: number | null; n_owners: number | null;
  reason: string | null; criteria_json: string | null;
};
export const getUPCases = createServerFn({ method: "POST" })
  .validator(z.object({ kodKu: z.string().optional() }))
  .handler(async ({ data }): Promise<UPRow[]> => {
    const where = data.kodKu ? "AND uc.kod_ku = ?" : "";
    const args = data.kodKu ? [data.kodKu] : [];
    return await q<UPRow>(
      `SELECT uc.kod_ku, COALESCE(ds.ku_name, uc.ku_name) AS ku_name, ds.id AS dataset_id,
              uc.parcels, uc.n_parcels, uc.area_m2, uc.zone, uc.zoning_src, uc.druh, uc.build,
              uc.classification, uc.score, uc.base_verdict, uc.bpej_skupina, uc.odvod_eur_m2,
              uc.naklad_vynatie_eur, uc.chranena, uc.lv_no, uc.n_owners, uc.reason, uc.criteria_json
       FROM up_cases uc LEFT JOIN datasets ds ON ds.ku_code = uc.kod_ku
       WHERE uc.classification IN ('MATCH','PROVISIONAL') ${where}
       ORDER BY COALESCE(uc.chranena,0),
                CASE WHEN uc.naklad_vynatie_eur IS NULL THEN 1 ELSE 0 END,
                uc.naklad_vynatie_eur,
                uc.area_m2 DESC
       LIMIT 2000`,
      args,
    ).catch(() => []);
  });

// ——— STAVEBNÉ POZEMKY (GOLD-LI/GOLD-BU browse): landsearch_results s filtrom účel/k.ú./verdikt ———
// purpose: retail (GOLD-LI) | residential (GOLD-BU, škola≤600s/obchod≤300s) | industrial.
// owners sa vracia LEN pri plnom prístupe (rola) — landsearch_results nesie reálne mená (na rozdiel
// od settlement_cases, ktoré sú anonymizované), preto gatujeme rovnako ako LV vlastníkov.
export type LandsearchRow = {
  kod_ku: string; ku_name: string | null; purpose: string | null; verdict: string | null;
  quality: number | null; area_m2: number | null; n_parcels: number | null; parcels: string | null;
  shape: string | null; zone: string | null; build: string | null; slope: number | null;
  frontage: number | null; ppf: number; existing_use: string | null; druh: string | null;
  access_times: string | null; owners: string | null; n_owners: number | null; reason: string | null;
};
export const getLandsearchBrowse = createServerFn({ method: "POST" })
  .validator(z.object({ purpose: z.string().optional(), kodKu: z.string().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<LandsearchRow[]> => {
    const where: string[] = ["lr.verdict IN ('MATCH','PROVISIONAL')"];
    const args: unknown[] = [];
    if (data.purpose) { where.push("lr.purpose = ?"); args.push(data.purpose); }
    if (data.kodKu) { where.push("lr.kod_ku = ?"); args.push(data.kodKu); }
    const rows = await q<LandsearchRow>(
      // ku_name z pushu je u časti k.ú. prázdne (manifest nesie mesto, nie k.ú.) a karta potom
      // zobrazovala holý kód. Prednosť má názov z datasetu, ktorý ide z ÚGKK.
      `SELECT lr.kod_ku, COALESCE(ds.ku_name, lr.ku_name, lr.kod_ku) AS ku_name, lr.purpose, lr.verdict,
              lr.quality, lr.area_m2, lr.n_parcels, lr.parcels, lr.shape, lr.zone, lr.build, lr.slope,
              lr.frontage, lr.ppf, lr.existing_use, lr.druh, lr.access_times, lr.owners, lr.n_owners, lr.reason
       FROM landsearch_results lr LEFT JOIN datasets ds ON ds.ku_code = lr.kod_ku
       WHERE ${where.join(" AND ")}
       ORDER BY (lr.verdict='MATCH') DESC, lr.quality DESC LIMIT 300`, args,
    ).catch(() => []);
    // rola zo session, nie od klienta — landsearch_results nesú REÁLNE mená vlastníkov
    const full = ownerAccess(await roleFromToken(data.token)) === "full";
    return full ? rows : rows.map((r) => ({ ...r, owners: null }));
  });

// ——— PER-PARCELA funkčné využitie z ÚP (georef výkres / GISPLAN WMS) — plní Mac, zobrazí LV výpis ———
// replaceKu: pred vložením zmaže dané k.ú. (idempotentný re-push). Batch ≤1000 riadkov/volanie.
export const ingestParcelZoning = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceKu: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      kodKu: z.string(), parcelNo: z.string(), register: z.string(),
      zone: z.string().optional(), verdict: z.string().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceKu && data.replaceKu.length) {
      const ph = data.replaceKu.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM parcel_zoning WHERE kod_ku IN (${ph})`).bind(...data.replaceKu).run();
    }
    const stmt = DB.prepare("INSERT OR REPLACE INTO parcel_zoning (kod_ku,parcel_no,register,zone,verdict) VALUES (?,?,?,?,?)");
    const batch = data.rows.map((r) => stmt.bind(r.kodKu, r.parcelNo, r.register, r.zone ?? null, r.verdict ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

// Per-LV funkčné využitie: pre parcely LV vráti { "parcelNo|register": zone }. Číta len parcely LV (šetrí D1).
export const getLvZoning = createServerFn({ method: "POST" })
  .validator(z.object({ kodKu: z.string(), parcels: z.array(z.object({ parcel_no: z.string(), register: z.string() })).max(600) }))
  .handler(async ({ data }): Promise<Record<string, string>> => {
    if (!data.parcels.length) return {};
    const nums = Array.from(new Set(data.parcels.map((p) => p.parcel_no)));
    const ph = nums.map(() => "?").join(",");
    const rows = await q<{ parcel_no: string; register: string; zone: string | null }>(
      `SELECT parcel_no, register, zone FROM parcel_zoning WHERE kod_ku=? AND parcel_no IN (${ph})`,
      [data.kodKu, ...nums],
    ).catch(() => []);
    const m: Record<string, string> = {};
    for (const r of rows) if (r.zone) m[`${r.parcel_no}|${r.register}`] = r.zone;
    return m;
  });

// ——— PDF výstup: Výpis z LV / Evidenčný list (pracovný, TRI LIPY brand) ———
type DocParcel = { register: string; parcel_no: string; area_m2: number; drp_text: string | null; placement: string | null };
type DocBuilding = { descr: string; on_parcel: string | null };
export const getLvVypis = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    // rola zo session, nie od klienta (viď roleFromToken)
    const role = await roleFromToken(data.token);
    const access = ownerAccess(role);
    const dataset = (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [data.datasetId]))[0] ?? null;

    // Časť A — parcely: prednostne obohatené lv_parcels (register C/E + druh pozemku),
    // fallback na geometrickú tabuľku parcels (napr. pri VGI-upload datasetoch).
    let dParcels = await q<DocParcel>(
      "SELECT register, parcel_no, area_m2, drp_text, placement FROM lv_parcels WHERE dataset_id = ? AND lv_no = ? ORDER BY register, CAST(parcel_no AS INTEGER), parcel_no",
      [data.datasetId, data.lvNo],
    );
    if (dParcels.length === 0) {
      const fb = await q<{ parcel_no: string; kn_type: string; area_m2: number; use_type: string | null }>(
        "SELECT parcel_no, kn_type, area_m2, use_type FROM parcels WHERE dataset_id = ? AND lv_no = ? ORDER BY parcel_no",
        [data.datasetId, data.lvNo],
      );
      dParcels = fb.map((p) => ({
        register: (p.kn_type || "").startsWith("E") ? "E" : "C",
        parcel_no: p.parcel_no,
        area_m2: p.area_m2,
        drp_text: p.use_type ?? null,
        placement: null,
      }));
    }
    const parcelsC = dParcels.filter((p) => p.register !== "E");
    const parcelsE = dParcels.filter((p) => p.register === "E");
    const buildings = await q<DocBuilding>(
      "SELECT descr, on_parcel FROM lv_buildings WHERE dataset_id = ? AND lv_no = ? ORDER BY descr",
      [data.datasetId, data.lvNo],
    );

    const lv = (await q<Lv>("SELECT lv_no, co_owners FROM lvs WHERE dataset_id = ? AND lv_no = ?", [data.datasetId, data.lvNo]))[0] ?? null;
    const count = lv?.co_owners ?? 0;
    const owners = access === "full"
      ? await q<LvOwner>("SELECT id, lv_no, name, share, is_company, birth_date, title, born_name, ico, addr_obec, addr_cislo, addr_psc FROM lv_owners WHERE dataset_id = ? AND lv_no = ? ORDER BY is_company DESC, name", [data.datasetId, data.lvNo])
      : [];

    // Časť B (tituly) + Časť C (ťarchy) — plný text je owner-sensitive (len full).
    const titleRows = await q<{ kind: string; txt: string }>(
      "SELECT kind, txt FROM lv_titles WHERE dataset_id = ? AND lv_no = ? ORDER BY kind DESC, id",
      [data.datasetId, data.lvNo],
    );
    const titlesCount = titleRows.filter((t) => t.kind === "titul").length;
    const tarchyCount = titleRows.filter((t) => t.kind === "tarcha").length;
    const titles = access === "full" ? titleRows.filter((t) => t.kind === "titul").map((t) => t.txt) : [];
    const tarchy = access === "full" ? titleRows.filter((t) => t.kind === "tarcha").map((t) => t.txt) : [];

    // Odňatie (BPEJ) + celok (evidenčný list) + vysporiadanosť pre C-KN parcely tohto LV — zdroj `parcels`.
    const pRows = await q<{ parcel_no: string; celok: number | null; bpej_skupina: number | null; bpej: string | null; odnatie_eur: number | null; settled: number | null }>(
      "SELECT parcel_no, celok, bpej_skupina, bpej, odnatie_eur, settled FROM parcels WHERE dataset_id = ? AND lv_no = ? AND (kn_type IS NULL OR kn_type NOT LIKE 'E%')",
      [data.datasetId, data.lvNo],
    );
    const pByNo = new Map(pRows.map((r) => [r.parcel_no, r]));
    const parcelsCEnriched = parcelsC.map((p) => {
      const info = pByNo.get(p.parcel_no);
      const sadzba = info?.odnatie_eur ?? null;
      return {
        ...p,
        skupina: info?.bpej_skupina ?? null,
        bpej: info?.bpej ?? null,
        settled: info?.settled ?? null,
        sadzba,
        odnatie_trvale: sadzba != null ? p.area_m2 * sadzba : null,
        odnatie_docasne: sadzba != null ? (p.area_m2 * sadzba) / 100 : null,
      };
    });
    const odnatie = {
      trvale: parcelsCEnriched.reduce((a, p) => a + (p.odnatie_trvale ?? 0), 0),
      docasne: parcelsCEnriched.reduce((a, p) => a + (p.odnatie_docasne ?? 0), 0),
      count: parcelsCEnriched.filter((p) => p.sadzba != null).length,
    };

    // Samostatná časť „Evidenčný list / užívateľ" — celky pri C-KN parcelách (meno gatované).
    const celokIds = [...new Set(pRows.map((r) => r.celok).filter((c): c is number => c != null))];
    let evidencne: { celok: number; uzivatel: string | null; ico: string | null; is_company: boolean; parcels: string[] }[] = [];
    if (celokIds.length) {
      const celRows = await q<{ celok: number; uzivatel: string | null; ico: string | null }>(
        `SELECT celok, uzivatel, ico FROM celky WHERE dataset_id = ? AND celok IN (${celokIds.map(() => "?").join(",")})`,
        [data.datasetId, ...celokIds],
      );
      const celMap = new Map(celRows.map((c) => [c.celok, c]));
      evidencne = celokIds.map((cid) => {
        const c = celMap.get(cid);
        const ico = c?.ico ?? null;
        const isCompany = !!ico && /^\d{6,8}$/.test(ico);
        return {
          celok: cid,
          uzivatel: access === "full" ? (c?.uzivatel ?? null) : null,
          ico,
          is_company: isCompany,
          parcels: pRows.filter((r) => r.celok === cid).map((r) => r.parcel_no),
        };
      }).sort((a, b) => a.celok - b.celok);
    }

    const totalAreaC = parcelsCEnriched.reduce((a, p) => a + (p.area_m2 || 0), 0);
    const totalAreaE = parcelsE.reduce((a, p) => a + (p.area_m2 || 0), 0);

    // Analytické signály + skóre príležitosti (rovnaké váhy ako /prilezitosti a NL prieskum)
    const sig = (await q<{ co_owners: number; has_spf: number; oldest_birth_year: number | null; dedic: number; buildable: number; clean_title: number; absenter_ratio: number; total_area: number }>(
      "SELECT co_owners, has_spf, oldest_birth_year, dedic, buildable, clean_title, absenter_ratio, total_area FROM lv_signals WHERE dataset_id = ? AND lv_no = ?",
      [data.datasetId, data.lvNo]))[0] ?? null;
    let signals: null | { co_owners: number; has_spf: number; dedic: number; buildable: number; clean_title: number; absenter_ratio: number; oldest_birth_year: number | null; score: number; reasons: string[] } = null;
    if (sig) {
      const w = { co: 0.3, spf: 0.25, dedic: 0.15, buildable: 0.15, absenter: 0.1, clean: 0.05 };
      const wsum = w.co + w.spf + w.dedic + w.buildable + w.absenter + w.clean;
      const raw = (w.co * Math.min(sig.co_owners ?? 0, 20)) / 20 + w.spf * (sig.has_spf ?? 0) + w.dedic * (sig.dedic ?? 0)
        + w.buildable * (sig.buildable ?? 0) + w.absenter * (sig.absenter_ratio ?? 0) + w.clean * (sig.clean_title ?? 0);
      const reasons: string[] = [];
      if ((sig.co_owners ?? 0) >= 5) reasons.push(`${sig.co_owners} spoluvlastníkov`);
      if (sig.has_spf) reasons.push("SPF / štát");
      if (sig.dedic) reasons.push(`dedičské${sig.oldest_birth_year ? ` (${sig.oldest_birth_year})` : ""}`);
      if (sig.buildable) reasons.push("stavebný potenciál");
      if ((sig.absenter_ratio ?? 0) > 0) reasons.push(`absentéri ${Math.round((sig.absenter_ratio ?? 0) * 100)} %`);
      if (sig.clean_title) reasons.push("bez tiarch");
      signals = { co_owners: sig.co_owners ?? 0, has_spf: sig.has_spf ?? 0, dedic: sig.dedic ?? 0, buildable: sig.buildable ?? 0, clean_title: sig.clean_title ?? 0, absenter_ratio: sig.absenter_ratio ?? 0, oldest_birth_year: sig.oldest_birth_year, score: Math.round((100 * raw) / wsum), reasons };
    }
    const settledSummary = {
      total: parcelsCEnriched.length,
      settled: parcelsCEnriched.filter((p) => p.settled === 1).length,
      unsettled: parcelsCEnriched.filter((p) => p.settled === 0).length,
    };

    return { dataset, lvNo: data.lvNo, parcelsC: parcelsCEnriched, parcelsE, buildings, owners, titles, tarchy, titlesCount, tarchyCount, access, count, evidencne, odnatie, totalAreaC, totalAreaE, signals, settledSummary };
  });

// ESKN kataster WMS podľa kraja (auto-connect pri importe). Endpoint je per-kraj MapServer.
const ESKN_LAYERS = "1,2,3,4,5,6,7,8,9,10,11,12";
function esknWmsForRegion(region: string, name: string): { name: string; url: string; layers: string } {
  const t = `${region} ${name}`.toLowerCase();
  const KRAJ: [RegExp, string, string][] = [
    [/bratislav|malack|pezinok|senec/, "BA", "Bratislavský kraj"],
    [/trnav|dunajsk|galant|hlohov|piešťan|piestan|senic|skalic/, "TT", "Trnavský kraj"],
    [/trenč|trenc|prievidz|považsk|povazsk|bánovc|banovc|myjav|ilav|púchov|puchov/, "TN", "Trenčiansky kraj"],
    [/nitr|nitrian|levic|komárn|komarn|nové zámky|nove zamky|topoľčan|topolcan|šaľa|sala|zlaté moravce/, "NR", "Nitriansky kraj"],
    [/žilin|zilin|kysuc|čadca|cadca|orav|turz|turiec|martin|dolný kubín|dolny kubin|liptov|ružomberok|ruzomberok|námestovo|namestovo|tvrdoš|tvrdos|bytč|bytc/, "ZA", "Žilinský kraj"],
    [/bansk|zvolen|bystric|brezno|lučenec|lucenec|rimavsk|žiar|ziar|detv|krupin|poltár|poltar|revúc|revuc|veľký krtíš|velky krtis/, "BB", "Banskobystrický kraj"],
    [/prešov|presov|poprad|bardej|humenn|kežmarok|kezmarok|levoč|levoc|sabinov|snin|stropkov|svidník|svidnik|vranov|medzilaborce|stará ľubovňa|stara lubovna/, "PO", "Prešovský kraj"],
    [/košic|kosic|michalovc|spišsk|spissk|rožňav|roznav|trebišov|trebisov|gelnic|sobranc/, "KE", "Košický kraj"],
  ];
  let kraj = "ZA", label = "Žilinský kraj";
  for (const [re, k, l] of KRAJ) if (re.test(t)) { kraj = k; label = l; break; }
  return {
    name: `ESKN kataster (${label})`,
    url: `https://kataster.skgeodesy.sk/eskn/services/${kraj}/kn_wms_norm/MapServer/WMSServer`,
    layers: ESKN_LAYERS,
  };
}

// ——— Fáza B: import nového k.ú. z VGI (klient parsuje, server ukladá) ———
export const importDataset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().min(3),
      name: z.string().min(2),
      region: z.string().optional(),
      role: roleSchema, token: z.string().optional(),
      parcels: z
        .array(
          z.object({
            parcel_no: z.string(),
            area_m2: z.number(),
            ring: z.array(z.tuple([z.number(), z.number()])),
            centroid_lat: z.number(),
            centroid_lng: z.number(),
          }),
        )
        .min(1)
        .max(2000),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; datasetId?: string; count?: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie importovať dataset." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };

    const datasetId = `up-${data.code}-${Math.random().toString(36).slice(2, 7)}`;
    const region = data.region?.trim() || "nahraté cez UI";
    await DB.prepare(
      "INSERT INTO datasets (id,ku_code,ku_name,region,kn_type,status,geometry_coverage,canonical_confidence,import_version,updated_at,note) VALUES (?,?,?,?,?,?,?,?,?,date('now'),?)",
    )
      .bind(datasetId, data.code, data.name, region, "C-KN", "ready_with_warnings", 100, 0.7, "VGI-upload", "Nahraté cez UI z VGI. Geometria vo WGS84 (grid transform); vlastníci needs_review (bez SPI).")
      .run();

    // parcely v dávkach
    const stmt = DB.prepare(
      "INSERT INTO parcels (id,dataset_id,parcel_no,kn_type,area_m2,use_type,lv_no,geometry_quality,centroid_lat,centroid_lng,geometry_json) VALUES (?,?,?,?,?,?,NULL,?,?,?,?)",
    );
    const batch = [];
    for (const p of data.parcels) {
      const geo = JSON.stringify({ type: "Polygon", coordinates: [p.ring] });
      batch.push(
        stmt.bind(`${datasetId}-${p.parcel_no.replace("/", "-")}`, datasetId, p.parcel_no, "C-KN", Math.round(p.area_m2), "pozemok", "verified", p.centroid_lat, p.centroid_lng, geo),
      );
    }
    for (let i = 0; i < batch.length; i += 40) {
      await DB.batch(batch.slice(i, i + 40));
    }

    // WMS auto-connect — každé importované k.ú. dostane ESKN kataster WMS pre svoj kraj.
    const wms = esknWmsForRegion(region, data.name);
    await DB.prepare("INSERT INTO wms_sources (dataset_id, name, url, layers, format) VALUES (?, ?, ?, ?, ?)")
      .bind(datasetId, wms.name, wms.url, wms.layers, "image/png")
      .run();

    // ÚP auto-fetch pri importe — ak je k.ú. v číselníku up_registry (fail-soft).
    let upDocsCount = 0;
    try {
      const reg = (await q<{ up_page_url: string }>("SELECT up_page_url FROM up_registry WHERE ku_code=?", [data.code]))[0];
      if (reg?.up_page_url) upDocsCount = (await syncUpDocs(DB, datasetId, data.code, reg.up_page_url)).count;
    } catch { /* ÚP fetch fail-soft */ }

    const jobs = [
      ["1", "VGI upload", "done", `Nahraté ${data.parcels.length} parciel (klient parse).`],
      ["2", "Krovák → WGS84", "done", "EPSG:5514 → WGS84 (bilineárny grid, sub-metrový)."],
      ["3", "Geometry index", "done", `Feature index: ${data.parcels.length} parciel.`],
      ["4", "WMS auto-connect", "done", `${wms.name} pripojená pre k.ú. (ESKN + národné ortofoto/ZBGIS).`],
      ["5", "Canonical linkage", "skipped", "Bez SPI — vlastníci needs_review. Doplň SPI import."],
      ["6", "Readiness audit", "done", "ready_with_warnings"],
      ["7", "ÚP auto-fetch", upDocsCount > 0 ? "done" : "skipped", upDocsCount > 0 ? `${upDocsCount} ÚP dokumentov z číselníka.` : "K.ú. nie je v ÚP číselníku (doplň URL v mape)."],
    ];
    for (const [no, step, state, msg] of jobs) {
      await DB.prepare(
        "INSERT INTO import_jobs (dataset_id,step_no,step,state,message) VALUES (?,?,?,?,?)",
      )
        .bind(datasetId, Number(no), step, state, msg)
        .run();
    }
    await refreshDatasetStatsCore(datasetId).catch(() => {});
    await logAudit("dataset.import.ui", role, `Nahraté k.ú. ${data.code} (${data.name}) — ${data.parcels.length} parciel z VGI; WMS: ${wms.name}.`, datasetId);
    return { ok: true, datasetId, count: data.parcels.length };
  });

// Predpočíta počty (n_parcels/n_owners/sum_area_m2) na datasete — voláme po importe, nie pri načítaní stránky.
// Bez datasetId prepočíta všetky (ťažké — len ručne). S datasetId len jeden (lacné).
async function refreshDatasetStatsCore(datasetId?: string): Promise<void> {
  const where = datasetId ? " WHERE id = ?" : "";
  const args = datasetId ? [datasetId] : [];
  await q(
    `UPDATE datasets SET
       n_parcels = (SELECT COUNT(*) FROM parcels p WHERE p.dataset_id = datasets.id),
       n_owners = (SELECT COUNT(*) FROM lv_owners o WHERE o.dataset_id = datasets.id),
       sum_area_m2 = (SELECT COALESCE(SUM(area_m2),0) FROM parcels p WHERE p.dataset_id = datasets.id)${where}`,
    args,
  );
}
export const refreshDatasetStats = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, token: z.string().optional(), datasetId: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    if (!canRunPipeline(await roleFromToken(data.token))) return { ok: false, message: "Rola nemá oprávnenie." };
    try { await refreshDatasetStatsCore(data.datasetId); return { ok: true }; }
    catch (e) { return { ok: false, message: String((e as Error)?.message ?? e) }; }
  });

// ——— E-KN (register E / určený operát) — doplnenie z UO*.vgi k existujúcemu k.ú. ———
// Rovnaký VGI formát, ale parcely sa uložia ako kn_type='E-KN' (id s prefixom E- aby nekolidovali s C-KN).
export const importEknParcels = createServerFn({ method: "POST" })
  .validator(z.object({
    datasetId: z.string(),
    role: roleSchema, token: z.string().optional(),
    append: z.boolean().optional(),   // false = najprv zmaž existujúce E-KN (prvý chunk); true = pridaj (ďalšie chunky)
    parcels: z.array(z.object({
      parcel_no: z.string(), area_m2: z.number(),
      ring: z.array(z.tuple([z.number(), z.number()])),
      centroid_lat: z.number(), centroid_lng: z.number(),
    })).min(1).max(2000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; count?: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nedostupná." };
    const ds = (await q<{ id: string }>("SELECT id FROM datasets WHERE id=?", [data.datasetId]))[0];
    if (!ds) return { ok: false, message: "Dataset neexistuje." };
    if (!data.append) await DB.prepare("DELETE FROM parcels WHERE dataset_id=? AND kn_type LIKE 'E%'").bind(data.datasetId).run();
    const stmt = DB.prepare(
      "INSERT OR REPLACE INTO parcels (id,dataset_id,parcel_no,kn_type,area_m2,use_type,lv_no,geometry_quality,centroid_lat,centroid_lng,geometry_json) VALUES (?,?,?,?,?,?,NULL,?,?,?,?)");
    const batch = data.parcels.map((p) => {
      const geo = JSON.stringify({ type: "Polygon", coordinates: [p.ring] });
      return stmt.bind(`${data.datasetId}-E-${p.parcel_no.replace(/\//g, "-")}`, data.datasetId, p.parcel_no, "E-KN", Math.round(p.area_m2), "pozemok", "verified", p.centroid_lat, p.centroid_lng, geo);
    });
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    if (!data.append) await DB.prepare("UPDATE datasets SET kn_type='C-KN+E-KN', updated_at=date('now') WHERE id=?").bind(data.datasetId).run();
    await logAudit("dataset.ekn.import", role, `E-KN: +${data.parcels.length} parciel (${data.append ? "append" : "replace"}) → ${data.datasetId}.`, data.datasetId);
    return { ok: true, count: data.parcels.length };
  });

// ——— Fáza 4: System Status (9.27) ———
export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { DB, HF_ENV } = bindings();
  const dbOk = !!DB;
  // Predpočítané (0062): parcely + vlastníci ako SUM z 15 malých riadkov datasets (nie COUNT(*) nad 952k).
  const dstat = (await q<{ ds: number; p: number; o: number }>(
    "SELECT COUNT(*) AS ds, COALESCE(SUM(n_parcels),0) AS p, COALESCE(SUM(n_owners),0) AS o FROM datasets").catch(() => []))[0];
  const counts = {
    datasets: dstat?.ds ?? 0,
    parcels: dstat?.p ?? 0,
    lvs: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM lvs"))[0]?.n ?? 0,
    owners: dstat?.o ?? 0,
    cases: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM cases"))[0]?.n ?? 0,
    reports: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM reports"))[0]?.n ?? 0,
  };
  const services = [
    { key: "app", label: "Aplikácia (SSR Worker)", ok: true, detail: "React 19 + TanStack Start" },
    { key: "db", label: "Databáza (D1)", ok: dbOk, detail: dbOk ? "pripojená" : "nedostupná" },
    { key: "map", label: "Map engine", ok: true, detail: "LocalCanvas (dependency-free)" },
    { key: "runtime", label: "Runtime", ok: true, detail: HF_ENV ?? "production" },
  ];
  const safety = [
    { label: "Raw dáta read-only", ok: true },
    { label: "Owner masking na serveri (full/summary/denied)", ok: true },
    { label: "No auto-WMS (ortofoto manuálne)", ok: true },
    { label: "No outreach / no external AI", ok: true },
    { label: "Vlastnícke adresy/RČ sa neukladajú", ok: true },
  ];
  const blockers = [
    { label: "Demo prihlasovacia fráza — pred handoffom rotovať", severity: "warning", key: "demo_auth" },
    { label: "Geometry precision coverage neumožňuje plošné tvrdenia o hraniciach", severity: "warning", key: "geometry" },
    { label: "Parcela↔LV canonical linker (VGI↔SPI) — needs_review", severity: "warning", key: "linker" },
  ];
  return {
    version: "0.4.0-internal",
    build: "phase-4",
    releaseReadiness: "ready_with_warnings",
    handoff: "blocked_for_handoff",
    services,
    safety,
    blockers,
    counts,
  };
});

// ——— Fáza 4: Report Builder obsah + Export Safety (9.20) ———
export const getReportContent = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    const access = ownerAccess(role);
    const report = (await q<ReportRow & { ku_name: string }>(
      `SELECT r.*, d.ku_name AS ku_name FROM reports r JOIN datasets d ON d.id = r.dataset_id WHERE r.id = ?`,
      [data.id],
    ))[0] ?? null;
    if (!report) return { report: null, dataset: null, sections: [], exportSafety: null };
    const dataset = (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [report.dataset_id]))[0] ?? null;

    type Sect = { kind: string; title: string; rows: string[][]; head: string[]; masked?: boolean };
    const sections: Sect[] = [];

    if (report.kind === "evidence_list") {
      const lvs = await q<Lv>("SELECT lv_no, co_owners FROM lvs WHERE dataset_id = ? ORDER BY co_owners DESC LIMIT 12", [report.dataset_id]);
      if (access === "full") {
        for (const lv of lvs) {
          const owners = await q<LvOwner>("SELECT name, share FROM lv_owners WHERE dataset_id = ? AND lv_no = ? ORDER BY is_company DESC, name LIMIT 12", [report.dataset_id, lv.lv_no]);
          sections.push({
            kind: "lv",
            title: `LV ${lv.lv_no} — ${lv.co_owners} vlastníkov`,
            head: ["Vlastník", "Podiel"],
            rows: owners.map((o) => [o.name, o.share ?? "—"]),
          });
        }
      } else {
        sections.push({
          kind: "lv-masked",
          title: "Listy vlastníctva (súhrn)",
          head: ["LV", "Počet vlastníkov"],
          rows: lvs.map((l) => [String(l.lv_no), String(l.co_owners)]),
          masked: true,
        });
      }
    } else if (report.kind === "parcel_pack") {
      const parcels = await q<Parcel>("SELECT parcel_no, area_m2, geometry_quality FROM parcels WHERE dataset_id = ? ORDER BY parcel_no LIMIT 60", [report.dataset_id]);
      sections.push({
        kind: "parcels",
        title: `Parcely (${parcels.length})`,
        head: ["Parcela", "Výmera (m²)", "Geometria"],
        rows: parcels.map((p) => [p.parcel_no, String(p.area_m2), p.geometry_quality]),
      });
    } else {
      const n = (await q<{ n: number }>("SELECT COUNT(*) AS n FROM parcels WHERE dataset_id = ?", [report.dataset_id]))[0]?.n ?? 0;
      sections.push({ kind: "map", title: "Mapový list", head: ["Položka", "Hodnota"], rows: [["Parcely v datasete", String(n)], ["Engine", "LocalCanvas"], ["Podklad", "ZBGIS ortofoto (manuálne)"]] });
    }

    const exportSafety = {
      ownerAccess: access,
      exportAllowed: canExport(role),
      role,
    };
    return { report, dataset, sections, exportSafety };
  });

// ——— Fáza 3: Zoning / ÚP + Access Review ———
export const listZoning = createServerFn({ method: "GET" }).handler(async () => {
  const sources = await q<ZoningSource & { ku_name: string }>(
    `SELECT z.*, d.ku_name AS ku_name FROM zoning_sources z JOIN datasets d ON d.id = z.dataset_id ORDER BY z.dataset_id, z.id`,
  );
  const findings = await q<ZoningFinding & { ku_name: string }>(
    `SELECT z.*, d.ku_name AS ku_name FROM zoning_findings z JOIN datasets d ON d.id = z.dataset_id ORDER BY z.category, z.id`,
  );
  return { sources, findings };
});

export const addZoningFinding = createServerFn({ method: "POST" })
  .validator(
    z.object({
      datasetId: z.string(),
      category: z.enum(["zoning", "access"]),
      target: z.string().optional(),
      label: z.string().min(3),
      status: z.enum(["screening", "possible", "unclear", "review", "unknown"]),
      note: z.string().optional(),
      role: roleSchema, token: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie pridať screening finding." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare(
      "INSERT INTO zoning_findings (dataset_id, category, target, label, status, note, source_ref) VALUES (?, ?, ?, ?, ?, ?, 'manual review')",
    )
      .bind(data.datasetId, data.category, data.target ?? null, data.label, data.status, data.note ?? null)
      .run();
    await logAudit("zoning.finding", role, `${data.category} finding „${data.label}" (${data.status}).`, data.datasetId);
    return { ok: true };
  });

// ——— Fáza 3: Cases ———
export const listCases = createServerFn({ method: "GET" }).handler(async () => {
  return await q<Case & { ku_name: string; note_count: number }>(
    `SELECT c.*, d.ku_name AS ku_name,
       (SELECT COUNT(*) FROM case_notes n WHERE n.case_id = c.id) AS note_count
     FROM cases c JOIN datasets d ON d.id = c.dataset_id ORDER BY c.id DESC`,
  );
});

export type CaseLink = { id: number; case_id: number; link_type: string; dataset_id: string | null; ref: string; label: string | null; created_at: string };
export const getCase = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const c = (await q<Case & { ku_name: string }>(
      `SELECT c.*, d.ku_name AS ku_name FROM cases c JOIN datasets d ON d.id = c.dataset_id WHERE c.id = ?`,
      [data.id],
    ))[0] ?? null;
    const notes = await q<CaseNote>("SELECT * FROM case_notes WHERE case_id = ? ORDER BY id", [data.id]);
    // Spis = všetko na jednom mieste: prepojené entity + dealy + história (fail-soft pred migráciou 0064).
    const links = await q<CaseLink>("SELECT * FROM case_links WHERE case_id = ? ORDER BY link_type, id", [data.id]).catch(() => []);
    const deals = await q<DealRow>("SELECT * FROM deals WHERE case_id = ? ORDER BY updated_at DESC", [data.id]).catch(() => []);
    const history = await q<AuditRow>("SELECT * FROM audit_log WHERE detail LIKE ? ORDER BY id DESC LIMIT 25", [`%case #${data.id}%`]).catch(() => []);
    return { case: c, notes, links, deals, history };
  });

export const linkCaseEntity = createServerFn({ method: "POST" })
  .validator(z.object({ caseId: z.number(), linkType: z.enum(["parcel", "lv", "owner", "deal", "doc"]), datasetId: z.string().optional(), ref: z.string().min(1), label: z.string().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number | null; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    try {
      const res = await DB.prepare("INSERT INTO case_links (case_id, link_type, dataset_id, ref, label) VALUES (?,?,?,?,?)")
        .bind(data.caseId, data.linkType, data.datasetId ?? null, data.ref, data.label ?? null).run();
      await logAudit("case.link", u.role, `Case #${data.caseId} + ${data.linkType}: ${data.label ?? data.ref}`);
      return { ok: true, id: res.meta?.last_row_id ?? null };
    } catch (e) { return { ok: false, message: String((e as Error)?.message ?? e) }; }
  });

export const unlinkCaseEntity = createServerFn({ method: "POST" })
  .validator(z.object({ linkId: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false };
    await DB.prepare("DELETE FROM case_links WHERE id = ?").bind(data.linkId).run();
    await logAudit("case.unlink", u.role, `Case link #${data.linkId} odstránený.`);
    return { ok: true };
  });

export const createCase = createServerFn({ method: "POST" })
  .validator(
    z.object({
      datasetId: z.string(),
      title: z.string().min(3),
      kind: z.enum(["vysporiadanie", "screening", "pristup", "ine"]),
      nextSteps: z.string().optional(),
      linkedRef: z.string().optional(),
      role: roleSchema,
      token: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number | null; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const res = await DB.prepare(
      "INSERT INTO cases (dataset_id, title, kind, status, owner_role, linked_ref, next_steps) VALUES (?, ?, ?, 'open', ?, ?, ?)",
    )
      .bind(data.datasetId, data.title, data.kind, u.role, data.linkedRef ?? null, data.nextSteps ?? null)
      .run();
    await logAudit("case.create", u.role, `Case „${data.title}" (${data.kind}).`, data.datasetId);
    return { ok: true, id: res.meta?.last_row_id ?? null };
  });

export const updateCaseStatus = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), status: z.enum(["open", "review", "done"]), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE cases SET status = ? WHERE id = ?").bind(data.status, data.id).run();
    await logAudit("case.status", u.role, `Case #${data.id} → ${data.status}.`);
    return { ok: true };
  });

export const addCaseNote = createServerFn({ method: "POST" })
  .validator(z.object({ caseId: z.number(), body: z.string().min(2), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("INSERT INTO case_notes (case_id, author_role, body) VALUES (?, ?, ?)")
      .bind(data.caseId, u.role, data.body)
      .run();
    await logAudit("case.note", u.role, `Poznámka k case #${data.caseId}.`);
    return { ok: true };
  });

// ——— Fáza C: georeferencované ÚP rastre (R2 STORAGE + kontrolné body) ———
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

type RasterRow = {
  id: string; name: string; kind: string; mime: string | null;
  width: number | null; height: number | null;
  transform_json: string | null; points_json: string | null; opacity: number; note: string | null;
};

export const listRasters = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    return await q<RasterRow>(
      "SELECT id, name, kind, mime, width, height, transform_json, points_json, opacity, note FROM up_rasters WHERE dataset_id = ? ORDER BY created_at",
      [data.datasetId],
    );
  });

export const getRasterData = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; dataUrl?: string }> => {
    const { STORAGE } = bindings();
    if (!STORAGE) return { ok: false };
    const row = (await q<{ r2_key: string; mime: string | null }>("SELECT r2_key, mime FROM up_rasters WHERE id = ?", [data.id]))[0];
    if (!row) return { ok: false };
    const obj = await STORAGE.get(row.r2_key);
    if (!obj) return { ok: false };
    const buf = new Uint8Array(await obj.arrayBuffer());
    return { ok: true, dataUrl: `data:${row.mime ?? "image/png"};base64,${bytesToB64(buf)}` };
  });

export const uploadRaster = createServerFn({ method: "POST" })
  .validator(z.object({
    datasetId: z.string(),
    name: z.string().min(1),
    kind: z.string().default("up"),
    mime: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    dataBase64: z.string().min(16).max(12_000_000), // ~9 MB binárne
    role: roleSchema, token: z.string().optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie nahrať podklad." };
    const { DB, STORAGE } = bindings();
    if (!DB || !STORAGE) return { ok: false, message: "Úložisko (R2) nie je dostupné." };
    const id = `r-${data.datasetId}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `up/${data.datasetId}/${id}`;
    await STORAGE.put(key, b64ToBytes(data.dataBase64), { httpMetadata: { contentType: data.mime } });
    await DB.prepare(
      "INSERT INTO up_rasters (id, dataset_id, name, kind, r2_key, mime, width, height, opacity, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(id, data.datasetId, data.name, data.kind, key, data.mime, data.width, data.height, 0.7, role)
      .run();
    await logAudit("raster.upload", role, `Podklad „${data.name}" (${data.width}×${data.height}) nahratý pre k.ú.`, data.datasetId);
    return { ok: true, id };
  });

export const saveGeoref = createServerFn({ method: "POST" })
  .validator(z.object({
    id: z.string(),
    transform: z.object({ a: z.number(), b: z.number(), c: z.number(), d: z.number(), e: z.number(), f: z.number() }),
    points: z.array(z.object({ px: z.number(), py: z.number(), lng: z.number(), lat: z.number() })).min(3).max(20),
    role: roleSchema, token: z.string().optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie georeferencovať." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE up_rasters SET transform_json = ?, points_json = ? WHERE id = ?")
      .bind(JSON.stringify(data.transform), JSON.stringify(data.points), data.id)
      .run();
    await logAudit("raster.georef", role, `Podklad ${data.id} georeferencovaný (${data.points.length} kontrolných bodov).`);
    return { ok: true };
  });

export const updateRaster = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), opacity: z.number().min(0).max(1).optional(), note: z.string().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false };
    if (data.opacity != null) await DB.prepare("UPDATE up_rasters SET opacity = ? WHERE id = ?").bind(data.opacity, data.id).run();
    if (data.note != null) await DB.prepare("UPDATE up_rasters SET note = ? WHERE id = ?").bind(data.note, data.id).run();
    return { ok: true };
  });

export const deleteRaster = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie mazať podklad." };
    const { DB, STORAGE } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const row = (await q<{ r2_key: string }>("SELECT r2_key FROM up_rasters WHERE id = ?", [data.id]))[0];
    if (row && STORAGE) await STORAGE.delete(row.r2_key);
    await DB.prepare("DELETE FROM up_rasters WHERE id = ?").bind(data.id).run();
    await logAudit("raster.delete", role, `Podklad ${data.id} odstránený.`);
    return { ok: true };
  });

// ——— Fáza 6: Dokumenty (PDF/DOCX/GP/ZPMZ/zmluvy) v R2, prepojené na spis/LV/parcelu/vlastníka ———
export type DocRow = { id: string; dataset_id: string; case_id: number | null; subject_type: string | null; subject_ref: string | null; name: string; kind: string; mime: string | null; size_bytes: number | null; note: string | null; created_by: string | null; created_at: string };
export const DOC_KINDS = ["vypis", "GP", "ZPMZ", "zmluva", "foto", "ine"] as const;
// Zoznam dokumentov pre spis alebo subjekt (LV/parcela/vlastník). Fail-soft pred 0068.
export const listDocuments = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string().optional(), caseId: z.number().optional(), subjectType: z.string().optional(), subjectRef: z.string().optional() }))
  .handler(async ({ data }): Promise<DocRow[]> => {
    const cond: string[] = []; const args: unknown[] = [];
    if (data.caseId != null) { cond.push("case_id = ?"); args.push(data.caseId); }
    else if (data.datasetId && data.subjectType && data.subjectRef) { cond.push("dataset_id = ? AND subject_type = ? AND subject_ref = ?"); args.push(data.datasetId, data.subjectType, data.subjectRef); }
    else if (data.datasetId) { cond.push("dataset_id = ?"); args.push(data.datasetId); }
    else return [];
    return q<DocRow>(`SELECT id, dataset_id, case_id, subject_type, subject_ref, name, kind, mime, size_bytes, note, created_by, created_at FROM documents WHERE ${cond.join(" AND ")} ORDER BY created_at DESC`, args).catch(() => []);
  });
// Nahranie dokumentu (klient pošle base64). Gate canRunPipeline. Bytes → R2, metadáta → D1.
export const uploadDocument = createServerFn({ method: "POST" })
  .validator(z.object({
    datasetId: z.string(), caseId: z.number().optional(), subjectType: z.string().optional(), subjectRef: z.string().optional(),
    name: z.string().min(1).max(200), kind: z.enum(["vypis", "GP", "ZPMZ", "zmluva", "foto", "ine"]).default("ine"), mime: z.string(), sizeBytes: z.number().int().nonnegative(),
    dataBase64: z.string().min(8).max(13_000_000), // ~9,7 MB binárne
    role: roleSchema, token: z.string().optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie nahrať dokument." };
    const { DB, STORAGE } = bindings();
    if (!DB || !STORAGE) return { ok: false, message: "Úložisko (R2) nie je dostupné." };
    const id = `doc-${data.datasetId}-${Math.random().toString(36).slice(2, 9)}`;
    const key = `docs/${data.datasetId}/${id}`;
    await STORAGE.put(key, b64ToBytes(data.dataBase64), { httpMetadata: { contentType: data.mime } });
    await DB.prepare(
      "INSERT INTO documents (id, dataset_id, case_id, subject_type, subject_ref, name, kind, mime, size_bytes, r2_key, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(id, data.datasetId, data.caseId ?? null, data.subjectType ?? null, data.subjectRef ?? null, data.name, data.kind, data.mime, data.sizeBytes, key, role)
      .run();
    // ak visí na spise, prepoj aj cez case_links (doc) — nadväzuje na Fázu 1
    if (data.caseId != null) { try { await DB.prepare("INSERT INTO case_links (case_id, link_type, dataset_id, ref, label) VALUES (?,?,?,?,?)").bind(data.caseId, "doc", data.datasetId, id, data.name).run(); } catch { /* case_links voliteľné */ } }
    await logAudit("document.upload", role, `Dokument „${data.name}" (${data.kind}) nahratý.`, data.datasetId);
    return { ok: true, id };
  });
// Stiahnutie/zobrazenie — R2 get → data: URL (v prehliadači appky, nie artifact).
export const getDocumentData = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; dataUrl?: string; name?: string; mime?: string }> => {
    const { STORAGE } = bindings();
    if (!STORAGE) return { ok: false };
    const row = (await q<{ r2_key: string; mime: string | null; name: string }>("SELECT r2_key, mime, name FROM documents WHERE id = ?", [data.id]))[0];
    if (!row) return { ok: false };
    const obj = await STORAGE.get(row.r2_key);
    if (!obj) return { ok: false };
    const buf = new Uint8Array(await obj.arrayBuffer());
    return { ok: true, name: row.name, mime: row.mime ?? "application/octet-stream", dataUrl: `data:${row.mime ?? "application/octet-stream"};base64,${bytesToB64(buf)}` };
  });
export const deleteDocument = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie mazať dokument." };
    const { DB, STORAGE } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const row = (await q<{ r2_key: string }>("SELECT r2_key FROM documents WHERE id = ?", [data.id]))[0];
    if (row && STORAGE) await STORAGE.delete(row.r2_key);
    await DB.prepare("DELETE FROM documents WHERE id = ?").bind(data.id).run();
    try { await DB.prepare("DELETE FROM case_links WHERE link_type='doc' AND ref = ?").bind(data.id).run(); } catch { /* voliteľné */ }
    await logAudit("document.delete", role, `Dokument ${data.id} odstránený.`);
    return { ok: true };
  });

// ——— Príležitosti pre mapový režim (parcela↔skóre) ———
export const getMapOpportunities = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    // Zvýraznenie top-deal LV (default váhy) → ich geometrické parcely.
    return await q<{ parcel_id: string; score: number; kind: string }>(
      `SELECT p.id AS parcel_id,
         CAST(ROUND(100 * ( (MIN(s.co_owners,20)/20.0)*0.30 + s.has_spf*0.25 + s.dedic*0.15 + s.buildable*0.15 + s.absenter_ratio*0.10 + s.clean_title*0.05 )) AS INTEGER) AS score,
         ('LV ' || s.lv_no || ' · ' || s.co_owners || ' spoluvl.' || CASE WHEN s.has_spf=1 THEN ' · SPF' ELSE '' END) AS kind
       FROM lv_signals s
       JOIN parcels p ON p.dataset_id = s.dataset_id AND p.lv_no = s.lv_no
       WHERE s.dataset_id = ? AND p.geometry_json IS NOT NULL
       ORDER BY score DESC
       LIMIT 80`,
      [data.datasetId],
    );
  });

// ——— Fáza D: Územnoplánovacia informácia (body z georeferencovaného ÚP rastra) ———
type UpInfoRow = { id: string; lat: number; lng: number; parcel_no: string | null; functional_area: string | null; regulativ: string | null; note: string | null; created_at: string };
export const listUpInfo = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    return await q<UpInfoRow>(
      "SELECT id, lat, lng, parcel_no, functional_area, regulativ, note, created_at FROM up_info WHERE dataset_id = ? ORDER BY created_at DESC",
      [data.datasetId],
    );
  });
export const addUpInfo = createServerFn({ method: "POST" })
  .validator(z.object({
    datasetId: z.string(), lat: z.number(), lng: z.number(),
    parcelNo: z.string().optional(), functionalArea: z.string().min(1), regulativ: z.string().optional(), note: z.string().optional(), role: roleSchema, token: z.string().optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie zapisovať ÚP info." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const id = `upi-${data.datasetId}-${Math.random().toString(36).slice(2, 7)}`;
    await DB.prepare(
      "INSERT INTO up_info (id, dataset_id, lat, lng, parcel_no, functional_area, regulativ, note, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
    )
      .bind(id, data.datasetId, data.lat, data.lng, data.parcelNo ?? null, data.functionalArea, data.regulativ ?? null, data.note ?? null, role)
      .run();
    await logAudit("upinfo.add", role, `ÚP info „${data.functionalArea}" pridané.`, data.datasetId);
    return { ok: true, id };
  });
export const deleteUpInfo = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false };
    const { DB } = bindings();
    if (!DB) return { ok: false };
    await DB.prepare("DELETE FROM up_info WHERE id = ?").bind(data.id).run();
    await logAudit("upinfo.delete", role, `ÚP info ${data.id} odstránené.`);
    return { ok: true };
  });
export const getUpInfo = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const row = (await q<UpInfoRow & { dataset_id: string }>(
      "SELECT id, dataset_id, lat, lng, parcel_no, functional_area, regulativ, note, created_at FROM up_info WHERE id = ?",
      [data.id],
    ))[0] ?? null;
    const dataset = row ? (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [row.dataset_id]))[0] ?? null : null;
    return { row, dataset };
  });

// ——— Owner intelligence: cross-k.ú. vyhľadávanie vlastníkov (dedup naprieč LV/k.ú.) ———
type OwnerHit = { name: string; is_company: number; ico: string | null; birth_date: string | null; dataset_id: string; ku_name: string; lv_no: number; share: string | null };
type OwnerOccurrence = { dataset_id: string; ku_name: string; lv_no: number; share: string | null };
type OwnerGroup = { name: string; is_company: number; ico: string | null; birth_date: string | null; occurrences: OwnerOccurrence[]; lvCount: number; kuCount: number };
export const searchOwnersGlobal = createServerFn({ method: "POST" })
  .validator(z.object({ q: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    const access = ownerAccess(role);
    const query = data.q.trim();
    if (access !== "full") return { access, results: [] as OwnerGroup[], total: 0 };
    if (query.length < 2) return { access, results: [] as OwnerGroup[], total: 0 };
    const isIco = /^\d{5,8}$/.test(query);
    const rows = await q<OwnerHit>(
      `SELECT o.name, o.is_company, o.ico, o.birth_date, o.dataset_id, d.ku_name AS ku_name, o.lv_no, o.share
       FROM lv_owners o JOIN datasets d ON d.id = o.dataset_id
       WHERE ${isIco ? "o.ico = ?" : "o.name LIKE ?"}
       ORDER BY o.name LIMIT 400`,
      [isIco ? query : `%${query}%`],
    );
    // zoskupenie na identitu vlastníka (meno + dátum narodenia / IČO)
    const map = new Map<string, { name: string; is_company: number; ico: string | null; birth_date: string | null; occurrences: { dataset_id: string; ku_name: string; lv_no: number; share: string | null }[] }>();
    for (const r of rows) {
      const key = (r.ico && r.is_company) ? `ico:${r.ico}` : `${r.name}|${r.birth_date ?? ""}`;
      let g = map.get(key);
      if (!g) { g = { name: r.name, is_company: r.is_company, ico: r.ico, birth_date: r.birth_date, occurrences: [] }; map.set(key, g); }
      g.occurrences.push({ dataset_id: r.dataset_id, ku_name: r.ku_name, lv_no: r.lv_no, share: r.share });
    }
    const results = Array.from(map.values())
      .map((g) => ({ ...g, lvCount: g.occurrences.length, kuCount: new Set(g.occurrences.map((o) => o.dataset_id)).size }))
      .sort((a, b) => b.lvCount - a.lvCount)
      .slice(0, 120);
    return { access, results, total: results.length };
  });

// ——— Živý lookup do RPO (Register právnických osôb, ŠÚ SR) — obohatenie firemných vlastníkov ———
type RpoHit = { name: string | null; ico: string | null; address: string | null; legal_form: string | null; established: string | null; terminated: string | null; statutory: { role: string; name: string }[]; source: string };
export const lookupRpo = createServerFn({ method: "POST" })
  .validator(z.object({ q: z.string().min(2), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; results: RpoHit[]; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canSeeOwners(role)) return { ok: false, results: [], message: "Rola nemá oprávnenie k owner detailu." };
    const query = data.q.trim();
    const isIco = /^\d{5,8}$/.test(query);
    const url = `https://api.statistics.sk/rpo/v1/search?${isIco ? "identifier" : "fullName"}=${encodeURIComponent(query)}`;
    const first = (a: unknown): unknown => (Array.isArray(a) && a.length ? a[0] : null);
    const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" ? (x as Record<string, unknown>) : null);
    const val = (x: unknown): string | null => {
      if (x == null) return null;
      if (typeof x === "string") return x;
      if (typeof x === "object" && x && "value" in (x as Record<string, unknown>)) return String((x as Record<string, unknown>).value ?? "") || null;
      return null;
    };
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "tri-lipy/1.0 (kataster)" }, signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) return { ok: false, results: [], message: `RPO odpovedalo ${res.status}.` };
      const json = (await res.json()) as { results?: unknown[] };
      const arr = Array.isArray(json.results) ? json.results : [];
      const results: RpoHit[] = arr.slice(0, 8).map((e0) => {
        const e = obj(e0) ?? {};
        const addrObj = obj(first(e.addresses));
        let address: string | null = null;
        if (addrObj) {
          address = val(addrObj.formatedAddress) ?? val(addrObj.formattedAddress);
          if (!address) {
            const pc = first(addrObj.postalCodes);
            address = [val(addrObj.street), val(addrObj.buildingNumber) ?? val(addrObj.regNumber), val(addrObj.municipality), val(pc)].filter(Boolean).join(", ") || null;
          }
        }
        return {
          name: val(first(e.fullNames)) ?? val(e.fullName) ?? null,
          ico: val(first(e.identifiers)) ?? val(e.identifier) ?? (isIco ? query : null),
          address,
          legal_form: val(obj(first(e.legalForms))?.value) ?? null,
          established: val(e.establishment) ?? null,
          terminated: val(e.termination) ?? null,
          statutory: [],
          source: "RPO / ŠÚ SR (api.statistics.sk)",
        };
      });
      // Detail najlepšej zhody (/entity/<id>) → aktuálni štatutári (koho osloviť) + právna forma.
      const id0 = obj(first(arr))?.id;
      if (results[0] && id0 != null) {
        try {
          const ctrl2 = new AbortController();
          const to2 = setTimeout(() => ctrl2.abort(), 7000);
          const dres = await fetch(`https://api.statistics.sk/rpo/v1/entity/${String(id0)}`, { headers: { accept: "application/json", "user-agent": "tri-lipy/1.0 (kataster)" }, signal: ctrl2.signal });
          clearTimeout(to2);
          if (dres.ok) {
            const detail = obj(await dres.json()) ?? {};
            results[0].statutory = asArr(detail.statutoryBodies)
              .map((s0) => obj(s0))
              .filter((o): o is Record<string, unknown> => !!o && o.validTo == null)
              .map((o) => {
                const pn = obj(o.personName);
                const nm = pn ? (val(pn.formatedName) ?? val(pn.formattedName)) : null;
                const role2 = val(o.statutoryBodyMember) ?? val(o.stakeholderType) ?? "štatutár";
                return { role: role2 ?? "štatutár", name: nm ?? "" };
              })
              .filter((x) => x.name)
              .slice(0, 8);
            results[0].legal_form = results[0].legal_form ?? val(obj(first(detail.legalForms))?.value);
          }
        } catch { /* detail best-effort */ }
      }
      await logAudit("owner.rpo.lookup", role, `RPO lookup „${query}" — ${results.length} výsledkov.`);
      return { ok: true, results };
    } catch (err) {
      return { ok: false, results: [], message: "RPO nedostupné (timeout/sieť)." };
    }
  });

// ——— Deal pipeline: signály + skóre (laditeľné váhy na klientovi) ———
export type LvSignal = {
  dataset_id: string; lv_no: number; co_owners: number; has_spf: number;
  oldest_birth_year: number | null; dedic: number; buildable: number; clean_title: number;
  absenter_ratio: number; total_area: number; ku_name: string;
};
export const getDeals = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string().optional() }))
  .handler(async ({ data }) => {
    // Top-N podľa predpočítaného signal_score (index, migrácia 0051) — bez LIMIT vracia 76k riadkov
    // a CF Worker prekročí resource limit. 1500 najlepších pokryje príležitosti; stránka doskóruje klientsky.
    const where = data.datasetId ? "WHERE s.dataset_id = ?" : "";
    const args = data.datasetId ? [data.datasetId, 1500] : [1500];
    return await q<LvSignal>(
      `SELECT s.dataset_id, s.lv_no, s.co_owners, s.has_spf, s.oldest_birth_year, s.dedic, s.buildable, s.clean_title, s.absenter_ratio, s.total_area, d.ku_name AS ku_name
       FROM lv_signals s JOIN datasets d ON d.id = s.dataset_id ${where}
       ORDER BY s.signal_score DESC LIMIT ?`,
      args,
    );
  });

// ——— Deal pipeline: deal = LV, vlastníci ako úkony (Bod 2b) ———
type DealRow = { id: string; dataset_id: string; lv_no: number; ku_name: string | null; status: string; score: number | null; note: string | null; created_at: string; updated_at: string; case_id?: number | null; odkup_eur?: number | null; next_step?: string | null };
// Slovenské labely pre stavy pipeline (kľúče = DEAL_STATUSES). nájdi → konaj → uzavri.
export const DEAL_STAGE_LABEL: Record<string, string> = { new: "Nájdený", checking: "Preverujeme", contacted: "Kontakt", negotiation: "Rokovanie", offer: "Ponuka", agreement: "Dohoda", closed_won: "Kúpené", closed_lost: "Zamietnuté" };
type DealTaskRow = { id: number; deal_id: string; owner_name: string; share: string | null; addr: string | null; is_company: number; state: string; note: string | null };
type DealNoteRow = { id: number; deal_id: string; author_role: string | null; body: string; created_at: string };
const DEAL_STATUSES = ["new", "checking", "contacted", "negotiation", "offer", "agreement", "closed_won", "closed_lost"] as const;
const TASK_STATES = ["pending", "contacted", "agreed", "signed", "declined"] as const;

export const createDeal = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema, caseId: z.number().optional(), odkupEur: z.number().optional(), nextStep: z.string().optional(), token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá plný prístup na založenie dealu." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const existing = (await q<{ id: string }>("SELECT id FROM deals WHERE dataset_id = ? AND lv_no = ? LIMIT 1", [data.datasetId, data.lvNo]))[0];
    if (existing) {
      if (data.caseId) { try { await DB.prepare("INSERT INTO case_links (case_id, link_type, dataset_id, ref, label) VALUES (?,?,?,?,?)").bind(data.caseId, "deal", data.datasetId, existing.id, `Deal LV ${data.lvNo}`).run(); } catch { /* case_links pred 0064 */ } }
      return { ok: true, id: existing.id };
    }
    const sig = (await q<{ co_owners: number; has_spf: number; dedic: number; buildable: number; clean_title: number; absenter_ratio: number }>(
      "SELECT co_owners, has_spf, dedic, buildable, clean_title, absenter_ratio FROM lv_signals WHERE dataset_id = ? AND lv_no = ?",
      [data.datasetId, data.lvNo],
    ))[0];
    const score = sig
      ? Math.round(100 * ((Math.min(sig.co_owners, 20) / 20) * 0.3 + sig.has_spf * 0.25 + sig.dedic * 0.15 + sig.buildable * 0.15 + sig.absenter_ratio * 0.1 + sig.clean_title * 0.05))
      : null;
    const ku = (await q<{ ku_name: string }>("SELECT ku_name FROM datasets WHERE id = ?", [data.datasetId]))[0]?.ku_name ?? null;
    const id = `deal-${data.datasetId}-${data.lvNo}-${Math.random().toString(36).slice(2, 6)}`;
    await DB.prepare("INSERT INTO deals (id, dataset_id, lv_no, ku_name, status, score, created_by, case_id, odkup_eur, next_step) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, data.datasetId, data.lvNo, ku, "new", score, role, data.caseId ?? null, data.odkupEur ?? null, data.nextStep ?? null).run();
    if (data.caseId) { try { await DB.prepare("INSERT INTO case_links (case_id, link_type, dataset_id, ref, label) VALUES (?,?,?,?,?)").bind(data.caseId, "deal", data.datasetId, id, `Deal LV ${data.lvNo}`).run(); } catch { /* case_links pred 0064 */ } }
    const owners = await q<{ name: string; share: string | null; is_company: number; addr_obec: string | null; addr_cislo: string | null; addr_psc: string | null }>(
      "SELECT name, share, is_company, addr_obec, addr_cislo, addr_psc FROM lv_owners WHERE dataset_id = ? AND lv_no = ? ORDER BY is_company DESC, name",
      [data.datasetId, data.lvNo],
    );
    const stmt = DB.prepare("INSERT INTO deal_tasks (deal_id, owner_name, share, addr, is_company, state) VALUES (?,?,?,?,?, 'pending')");
    const batch = owners.map((o) => {
      const addr = [o.addr_cislo ? `č. ${o.addr_cislo}` : "", o.addr_obec, o.addr_psc].filter(Boolean).join(", ");
      return stmt.bind(id, o.name, o.share, addr || null, o.is_company);
    });
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    await logAudit("deal.create", role, `Deal LV ${data.lvNo} — ${owners.length} vlastníkov ako úkony.`, data.datasetId);
    return { ok: true, id };
  });

export const listDeals = createServerFn({ method: "GET" }).handler(async () => {
  return await q<DealRow & { task_count: number; task_done: number; total_area: number | null }>(
    `SELECT d.*, (SELECT COUNT(*) FROM deal_tasks t WHERE t.deal_id = d.id) AS task_count,
       (SELECT COUNT(*) FROM deal_tasks t WHERE t.deal_id = d.id AND t.state IN ('agreed','signed')) AS task_done,
       (SELECT s.total_area FROM lv_signals s WHERE s.dataset_id = d.dataset_id AND s.lv_no = d.lv_no) AS total_area
     FROM deals d ORDER BY d.updated_at DESC`,
  );
});

export const getDeal = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    const access = ownerAccess(role);
    const deal = (await q<DealRow>("SELECT * FROM deals WHERE id = ?", [data.id]))[0] ?? null;
    const notes = await q<DealNoteRow>("SELECT * FROM deal_notes WHERE deal_id = ? ORDER BY id DESC", [data.id]);
    let tasks = await q<DealTaskRow>("SELECT * FROM deal_tasks WHERE deal_id = ? ORDER BY is_company DESC, id", [data.id]);
    if (access !== "full") tasks = tasks.map((t) => ({ ...t, owner_name: "Vlastník (chránené)", addr: null }));
    return { deal, tasks, notes, access };
  });

export const updateDealStatus = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), status: z.enum(DEAL_STATUSES), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá oprávnenie meniť deal." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE deals SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(data.status, data.id).run();
    await logAudit("deal.status", role, `Deal ${data.id} → ${DEAL_STAGE_LABEL[data.status] ?? data.status}.`);
    return { ok: true };
  });

// Úprava hodnoty odkupu / ďalšieho kroku / poznámky dealu (aditívne stĺpce z 0064).
export const updateDeal = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema, odkupEur: z.number().nullable().optional(), nextStep: z.string().nullable().optional(), note: z.string().optional(), token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá oprávnenie meniť deal." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const sets: string[] = []; const args: unknown[] = [];
    if (data.odkupEur !== undefined) { sets.push("odkup_eur = ?"); args.push(data.odkupEur); }
    if (data.nextStep !== undefined) { sets.push("next_step = ?"); args.push(data.nextStep); }
    if (data.note !== undefined) { sets.push("note = ?"); args.push(data.note); }
    if (!sets.length) return { ok: true };
    sets.push("updated_at = datetime('now')");
    try {
      await DB.prepare(`UPDATE deals SET ${sets.join(", ")} WHERE id = ?`).bind(...args, data.id).run();
      await logAudit("deal.update", role, `Deal ${data.id} upravený.`);
      return { ok: true };
    } catch (e) { return { ok: false, message: String((e as Error)?.message ?? e) }; }
  });

export const updateDealTask = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), state: z.enum(TASK_STATES), note: z.string().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá oprávnenie meniť úkon." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.note != null) await DB.prepare("UPDATE deal_tasks SET state = ?, note = ? WHERE id = ?").bind(data.state, data.note, data.id).run();
    else await DB.prepare("UPDATE deal_tasks SET state = ? WHERE id = ?").bind(data.state, data.id).run();
    return { ok: true };
  });

export const addDealNote = createServerFn({ method: "POST" })
  .validator(z.object({ dealId: z.string(), body: z.string().min(1), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Vyžaduje prihlásenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false };
    await DB.prepare("INSERT INTO deal_notes (deal_id, author_role, body) VALUES (?, ?, ?)").bind(data.dealId, u.role, data.body).run();
    await DB.prepare("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").bind(data.dealId).run();
    return { ok: true };
  });

// ——— Dashboard (KPI naprieč dátami) — D1-safe: signal_score index + cache 60 min (ťažké COUNT-y len raz/hodina). ———
export type Dashboard = {
  scope: string; cached?: boolean; ageDays?: number;
  kataster: { datasets: number; parcels: number; owners: number; lvs: number; area_ha: number };
  deal: { hot: number; open_deals: number; top: Array<{ dataset_id: string; ku_name: string | null; lv_no: number; score: number }> };
  trh: { medians: { pozemok: number | null; byt: number | null; dom: number | null }; listings: number; opps: number };
  up: { obce: number; docs: number; changes_7d: number; changes_30d: number };
  alerts: Array<{ kind: string; body: string; created_at: string }>;
  // Fáza 4 — vždy čerstvé (lacné dopočty nad malými tabuľkami, mimo 12h cache):
  pipeline: { open: number; value_set: number; value_est: number; won_eur: number; lost: number;
    stages: Array<{ status: string; count: number; value_eur: number }> };
  cases: { open: number; review: number; done: number; potential_eur: number; linked_lvs: number };
  status: { last_import: string | null; last_import_ku: string | null; last_scrape: string | null; last_alert: string | null };
  changes: { d7: number; d30: number; last: string | null };
};

// Fáza 4: lacné, vždy čerstvé sekcie dashboardu (pipeline hodnota+fázy, cases, čerstvosť dát, zmeny).
// Hodnota dealu = zadané odkup_eur, inak AVM fallback (total_area × medián €/m² pozemku). Malé tabuľky.
async function dashboardFresh(medPozemok: number | null): Promise<Pick<Dashboard, "pipeline" | "cases" | "status" | "changes">> {
  const num = async (sql: string, args: unknown[] = []): Promise<number> => { try { return (await q<{ n: number }>(sql, args))[0]?.n ?? 0; } catch { return 0; } };
  const mpz = medPozemok && medPozemok > 0 ? medPozemok : 0;
  // Dealy + výmera prepojeného LV (PK join, lacné). Hodnota = odkup_eur ?? total_area×medián.
  const deals = await q<{ status: string; odkup_eur: number | null; total_area: number | null }>(
    "SELECT d.status, d.odkup_eur, s.total_area FROM deals d LEFT JOIN lv_signals s ON s.dataset_id=d.dataset_id AND s.lv_no=d.lv_no").catch(() => []);
  const est = (area: number | null) => (mpz && area ? Math.round(area * mpz) : 0);
  const stageMap = new Map<string, { count: number; value_eur: number }>();
  let value_set = 0, value_est = 0, won_eur = 0, lost = 0, open = 0;
  for (const d of deals) {
    const val = d.odkup_eur != null ? d.odkup_eur : est(d.total_area);
    const st = stageMap.get(d.status) ?? { count: 0, value_eur: 0 };
    st.count++; st.value_eur += val; stageMap.set(d.status, st);
    if (d.status === "closed_won") { won_eur += (d.odkup_eur ?? val); }
    else if (d.status === "closed_lost") { lost++; }
    else { open++; if (d.odkup_eur != null) value_set += d.odkup_eur; else value_est += est(d.total_area); }
  }
  const stages = [...stageMap.entries()].map(([status, v]) => ({ status, ...v }));
  // Cases + hodnota prepojených LV (AVM potenciál otvorených spisov).
  const caseCounts = await q<{ status: string; n: number }>("SELECT status, COUNT(*) n FROM cases GROUP BY status").catch(() => []);
  const cCount = (s: string) => caseCounts.find((r) => r.status === s)?.n ?? 0;
  const caseLvs = await q<{ total_area: number | null }>(
    "SELECT s.total_area FROM cases c JOIN case_links cl ON cl.case_id=c.id AND cl.link_type='lv' LEFT JOIN lv_signals s ON s.dataset_id=cl.dataset_id AND s.lv_no=CAST(cl.ref AS INTEGER) WHERE c.status IN ('open','review')").catch(() => []);
  const potential_eur = caseLvs.reduce((a, r) => a + est(r.total_area), 0);
  // Čerstvosť dát.
  const lastImp = (await q<{ u: string | null; ku: string | null }>("SELECT updated_at u, ku_name ku FROM datasets ORDER BY updated_at DESC LIMIT 1").catch(() => []))[0];
  const lastScrape = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='last_refresh'").catch(() => []))[0]?.value ?? null;
  const lastAlert = (await q<{ r: string | null }>("SELECT MAX(last_run) r FROM saved_search").catch(() => []))[0]?.r ?? null;
  // Zmeny (Fáza 3).
  const d7 = await num("SELECT COUNT(*) n FROM change_log WHERE detected_at >= datetime('now','-7 days')");
  const d30 = await num("SELECT COUNT(*) n FROM change_log WHERE detected_at >= datetime('now','-30 days')");
  const lastChg = (await q<{ d: string | null }>("SELECT MAX(detected_at) d FROM change_log").catch(() => []))[0]?.d ?? null;
  return {
    pipeline: { open, value_set, value_est, won_eur, lost, stages },
    cases: { open: cCount("open"), review: cCount("review"), done: cCount("done"), potential_eur, linked_lvs: caseLvs.length },
    status: { last_import: lastImp?.u ?? null, last_import_ku: lastImp?.ku ?? null, last_scrape: lastScrape, last_alert: lastAlert },
    changes: { d7, d30, last: lastChg },
  };
}
export const getDashboard = createServerFn({ method: "POST" })
  .validator(z.object({ refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<Dashboard> => {
    // Cache 12 h — ťažké COUNT-y (parcely 132k, vlastníci 952k) sa rátajú max ~2×/deň (D1 free tier). „Obnoviť" vynúti prepočet.
    const cached = await regCacheRead("dashboard:sr", !!data.refresh, 12 * 3600);
    if (cached) {
      const p = cached.payload as Dashboard;
      const fresh = await dashboardFresh(p.trh?.medians?.pozemok ?? null); // pipeline/cases/status/changes vždy čerstvé
      return { ...p, ...fresh, cached: true, ageDays: cached.ageDays };
    }
    const num = async (sql: string, args: unknown[] = []): Promise<number> => { try { return (await q<{ n: number }>(sql, args))[0]?.n ?? 0; } catch { return 0; } };
    // Predpočítané (0062): parcely/vlastníci/výmera ako SUM z malej datasets tabuľky — nie COUNT/SUM skeny nad 952k+ riadkami.
    const dstat = (await q<{ ds: number; p: number; o: number; a: number }>(
      "SELECT COUNT(*) AS ds, COALESCE(SUM(n_parcels),0) AS p, COALESCE(SUM(n_owners),0) AS o, COALESCE(SUM(sum_area_m2),0) AS a FROM datasets").catch(() => []))[0];
    const datasets = dstat?.ds ?? 0;
    const parcels = dstat?.p ?? 0;
    const owners = dstat?.o ?? 0;
    const lvs = await num("SELECT COUNT(*) n FROM lv_signals");
    const area = dstat?.a ?? 0;
    // Deal hot/top z predpočítaného signal_score (index 0051) — lacné.
    const hot = await num("SELECT COUNT(*) n FROM lv_signals WHERE signal_score >= 60");
    const open_deals = await num("SELECT COUNT(*) n FROM deals WHERE status NOT IN ('closed_won','closed_lost')");
    let top: Dashboard["deal"]["top"] = [];
    try {
      top = await q<{ dataset_id: string; ku_name: string | null; lv_no: number; score: number }>(
        `SELECT s.dataset_id, d.ku_name, s.lv_no, ROUND(s.signal_score) AS score FROM lv_signals s JOIN datasets d ON d.id=s.dataset_id ORDER BY s.signal_score DESC LIMIT 5`);
    } catch { /* noop */ }
    const med = async (pt: string): Promise<number | null> => { try { return (await q<{ m: number }>("SELECT median_eur_m2 m FROM market_index WHERE ptype=? AND deal='predaj' AND obec IS NULL ORDER BY day DESC LIMIT 1", [pt]))[0]?.m ?? null; } catch { return null; } };
    const listings = await num("SELECT COUNT(*) n FROM market_listings");
    const opps = await num("SELECT COUNT(*) n FROM market_opportunities");
    const up_obce = await num("SELECT COUNT(*) n FROM up_registry");
    const up_docs = await num("SELECT COALESCE(SUM(docs),0) n FROM up_registry");
    const ch7 = await num("SELECT COUNT(*) n FROM up_changes WHERE detected_at >= datetime('now','-7 days')");
    const ch30 = await num("SELECT COUNT(*) n FROM up_changes WHERE detected_at >= datetime('now','-30 days')");
    let alerts: Dashboard["alerts"] = [];
    try { alerts = await q<{ kind: string; body: string; created_at: string }>("SELECT kind, body, created_at FROM notifications ORDER BY id DESC LIMIT 8"); } catch { /* noop */ }
    const medPozemok = await med("pozemok");
    const fresh = await dashboardFresh(medPozemok); // pipeline/cases/status/changes — vždy čerstvé
    const out: Dashboard = {
      scope: "SR",
      kataster: { datasets, parcels, owners, lvs, area_ha: Math.round(area / 10000) },
      deal: { hot, open_deals, top },
      trh: { medians: { pozemok: medPozemok, byt: await med("byt"), dom: await med("dom") }, listings, opps },
      up: { obce: up_obce, docs: up_docs, changes_7d: ch7, changes_30d: ch30 },
      alerts,
      ...fresh,
    };
    try { await regCacheWrite("dashboard:sr", "dashboard", out); } catch { /* noop */ }
    return out;
  });

// ——— GDPR: práva dotknutých osôb + suppression (koho nespracúvať/neoslovovať) ———
function normName(s: string): string { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
// Plain helper (volateľný z iných server fns): je meno/LV/parcela v suppression?
async function isSuppressed(name?: string | null, kuCode?: string | null, lvNo?: string | null, parcelNo?: string | null): Promise<boolean> {
  try {
    if (name) { if ((await q<{ n: number }>("SELECT COUNT(*) n FROM suppression WHERE kind='name' AND key=?", [normName(name)]))[0]?.n) return true; }
    if (kuCode && lvNo) { if ((await q<{ n: number }>("SELECT COUNT(*) n FROM suppression WHERE kind='lv' AND key=?", [`${kuCode}:${lvNo}`]))[0]?.n) return true; }
    if (kuCode && parcelNo) { if ((await q<{ n: number }>("SELECT COUNT(*) n FROM suppression WHERE kind='parcel' AND key=?", [`${kuCode}:${parcelNo}`]))[0]?.n) return true; }
  } catch { /* tabuľka nemusí existovať pred migráciou */ }
  return false;
}
// Množina normalizovaných mien v suppression (na hromadné označenie vlastníkov v LV).
async function suppressedNameSet(): Promise<Set<string>> {
  try { return new Set((await q<{ key: string }>("SELECT key FROM suppression WHERE kind='name'")).map((r) => r.key)); }
  catch { return new Set(); }
}
export type DsrRow = { id: number; kind: string; subject_name: string; subject_ku: string | null; subject_lv: string | null; reason: string | null; status: string; created_at: string; resolved_at: string | null };
export const submitDataSubjectRequest = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), kind: z.enum(["erasure", "objection", "access", "rectification"]), subjectName: z.string().min(2), subjectKu: z.string().optional(), subjectLv: z.string().optional(), reason: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    const r = await q<{ id: number }>(
      "INSERT INTO data_subject_requests (kind,subject_name,subject_ku,subject_lv,reason,status,by_user) VALUES (?,?,?,?,?,'new',?) RETURNING id",
      [data.kind, data.subjectName.trim(), data.subjectKu ?? null, data.subjectLv ?? null, data.reason ?? null, u.id]);
    if (data.kind === "objection" || data.kind === "erasure") {
      await q("INSERT INTO suppression (kind,key,orig,reason) VALUES ('name',?,?,?)", [normName(data.subjectName), data.subjectName.trim(), data.kind]);
    }
    // do auditu NIE meno dotknutej osoby — len ID žiadosti (meno je v data_subject_requests, len pre admina)
    await logAudit("gdpr.request", u.role, `Žiadosť ${data.kind} #${r[0]?.id ?? "?"}`);
    return { ok: true, id: r[0]?.id };
  });
export const listDataSubjectRequests = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ access: boolean; requests: DsrRow[]; suppressionCount: number }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { access: false, requests: [], suppressionCount: 0 };
    const requests = await q<DsrRow>("SELECT id,kind,subject_name,subject_ku,subject_lv,reason,status,created_at,resolved_at FROM data_subject_requests ORDER BY id DESC LIMIT 200");
    const suppressionCount = (await q<{ n: number }>("SELECT COUNT(*) n FROM suppression"))[0]?.n ?? 0;
    return { access: true, requests, suppressionCount };
  });
// Hľadanie záznamov osoby (náhľad pred výmazom aj právo na prístup čl. 15). Meno sa rozdelí na slová
// a záznam musí obsahovať KAŽDÉ z nich (poradie „Ján Novák" vs „Novák Ján" nevadí). SQLite `lower()`
// nezmenší diakritiku (Š, Č…), preto sa každé slovo skúša aj v zadanom tvare. Je to len NÁHĽAD —
// o tom, čo patrí danej osobe, rozhoduje admin zaškrtnutím (rovnaké meno môžu mať dvaja ľudia).
function subjectNameCond(name: string): { cond: string[]; args: unknown[] } | null {
  const toks = name.trim().split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
  if (!toks.length) return null;
  const cond: string[] = []; const args: unknown[] = [];
  for (const t of toks) { cond.push("(name LIKE ? OR lower(name) LIKE ?)"); args.push(`%${t}%`, `%${t.toLowerCase()}%`); }
  return { cond, args };
}
async function findSubjectRows(name: string, ku?: string | null, lv?: string | null) {
  const nc = subjectNameCond(name);
  if (!nc) return [];
  const { cond, args } = nc;
  if (ku && ku.trim()) { cond.push("dataset_id LIKE ?"); args.push(`%${ku.trim()}%`); }
  const lvn = lv && /^\d+$/.test(lv.trim()) ? Number(lv.trim()) : null;
  if (lvn != null) { cond.push("lv_no = ?"); args.push(lvn); }
  return q<{ id: number; dataset_id: string; lv_no: number; name: string; born_name: string | null; birth_date: string | null; addr_obec: string | null; addr_cislo: string | null; addr_psc: string | null; is_company: number; share: string | null }>(
    `SELECT id, dataset_id, lv_no, name, born_name, birth_date, addr_obec, addr_cislo, addr_psc, is_company, share FROM lv_owners WHERE ${cond.join(" AND ")} ORDER BY dataset_id, lv_no LIMIT 300`, args);
}
// Tá istá osoba v EVIDENCII DOPYTU (kupci, migrácia 0090) — zadaná ručne alebo prišla ako lead z OS TRI LIPY.
// Bez filtra k.ú./LV: dopyt nie je viazaný na LV a „lokality" sú voľný text.
export type SubjectBuyerRow = { id: number; name: string; kind: string; source: string; external_id: string | null; ptype: string; locations: string | null; contact: string | null; status: string; created_at: string };
async function findSubjectBuyers(name: string): Promise<SubjectBuyerRow[]> {
  const nc = subjectNameCond(name);
  if (!nc) return [];
  return q<SubjectBuyerRow>(
    `SELECT id, name, kind, source, external_id, ptype, locations, contact, status, created_at FROM buyer_requests WHERE ${nc.cond.join(" AND ")} ORDER BY id DESC LIMIT 100`, nc.args).catch(() => []);
}
// Vymazaný lead z OS TRI LIPY — kľúč v suppression, aby ho ďalšie poslanie z OS nevrátilo.
const erasedBuyerKey = (source: string, externalId: string) => `${source}:${externalId}`;
// Kľúč vymazaného záznamu vlastníka — nesie ho suppression, aby ho ďalší import k.ú. nevrátil.
const erasedKey = (datasetId: string, lvNo: number, name: string) => `${datasetId}:${lvNo}:${normName(name)}`;

// VÝMAZ (čl. 17). Predtým: `DELETE … WHERE lower(name) LIKE '%meno%'` naprieč VŠETKÝMI k.ú. — výmaz
// „Ján Novák" by zmazal aj „Ján Nováková", „Jána Nováka ml." a každého menovca (nevratne), a ďalší
// import k.ú. by vymazanú osobu aj tak vrátil. Teraz sa mažú LEN záznamy, ktoré admin v náhľade
// zaškrtol (podľa id), a každý dostane trvalý záznam v suppression (kind='erased_owner'), ktorý
// ingestDataset rešpektuje. Meno pre „neoslovovať" sa berie zo žiadosti v DB, nie z požiadavky.
export const applyErasure = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), requestId: z.number().int(), ownerIds: z.array(z.number().int()).max(300).default([]),
    buyerIds: z.array(z.number().int()).max(100).default([]) }))
  .handler(async ({ data }): Promise<{ ok: boolean; removed?: number; work?: number; buyers?: number; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže vykonať výmaz." };
    const req = (await q<{ id: number; kind: string; subject_name: string; status: string }>(
      "SELECT id, kind, subject_name, status FROM data_subject_requests WHERE id = ?", [data.requestId]))[0];
    if (!req || req.kind !== "erasure") return { ok: false, message: "Žiadosť o výmaz neexistuje." };
    const ids = [...new Set(data.ownerIds)];
    const bids = [...new Set(data.buyerIds)];
    if (!ids.length && !bids.length) return { ok: false, message: "Nie je vybraný žiadny záznam." };
    const ph = ids.map(() => "?").join(",");
    const rows = ids.length ? await q<{ id: number; dataset_id: string; lv_no: number; name: string }>(
      `SELECT id, dataset_id, lv_no, name FROM lv_owners WHERE id IN (${ph})`, ids) : [];
    const bph = bids.map(() => "?").join(",");
    const buyers = bids.length ? await q<{ id: number; source: string; external_id: string | null }>(
      `SELECT id, source, external_id FROM buyer_requests WHERE id IN (${bph})`, bids).catch(() => []) : [];
    if (!rows.length && !buyers.length) return { ok: false, message: "Vybrané záznamy už neexistujú." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nedostupná." };
    const ownerStmts = rows.length ? [
      ...rows.map((r) => DB.prepare("INSERT INTO suppression (kind,key,orig,reason) VALUES ('erased_owner',?,?,?)")
        .bind(erasedKey(r.dataset_id, r.lv_no, r.name), `${r.dataset_id} LV${r.lv_no}`, `erasure #${req.id}`)),
      DB.prepare(`DELETE FROM lv_owners WHERE id IN (${ph})`).bind(...rows.map((r) => r.id)),
    ] : [];
    // tie isté osoby v pracovných záznamoch (záznam kontaktu, úlohy dealu) — len PRESNÁ zhoda k.ú.+LV+meno
    const workStmts = [
      ...rows.map((r) => DB.prepare("DELETE FROM contact_log WHERE dataset_id = ? AND lv_no = ? AND owner_name = ?").bind(r.dataset_id, r.lv_no, r.name)),
      ...rows.map((r) => DB.prepare("DELETE FROM deal_tasks WHERE owner_name = ? AND deal_id IN (SELECT id FROM deals WHERE dataset_id = ? AND lv_no = ?)").bind(r.name, r.dataset_id, r.lv_no)),
    ];
    // evidencia dopytu: záznam + jeho videné zhody; lead z OS TRI LIPY dostane kľúč, aby sa ďalším poslaním nevrátil
    const bIds = buyers.map((b) => b.id);
    const buyerStmts = buyers.length ? [
      ...buyers.filter((b) => b.source !== "manual" && b.external_id).map((b) =>
        DB.prepare("INSERT INTO suppression (kind,key,orig,reason) VALUES ('erased_buyer',?,?,?)")
          .bind(erasedBuyerKey(b.source, b.external_id as string), `dopyt #${b.id}`, `erasure #${req.id}`)),
      DB.prepare(`DELETE FROM buyer_match_seen WHERE request_id IN (${bIds.map(() => "?").join(",")})`).bind(...bIds),
      DB.prepare(`DELETE FROM buyer_requests WHERE id IN (${bIds.map(() => "?").join(",")})`).bind(...bIds),
    ] : [];
    const stmts = [
      ...ownerStmts, ...workStmts, ...buyerStmts,
      DB.prepare("INSERT INTO suppression (kind,key,orig,reason) SELECT 'name',?,?,'erasure' WHERE NOT EXISTS (SELECT 1 FROM suppression WHERE kind='name' AND key=?)")
        .bind(normName(req.subject_name), req.subject_name, normName(req.subject_name)),
      DB.prepare("UPDATE data_subject_requests SET status='resolved', resolved_at=datetime('now') WHERE id=?").bind(req.id),
    ];
    const res = await DB.batch(stmts);   // jedna transakcia — buď všetko, alebo nič
    const work = res.slice(ownerStmts.length, ownerStmts.length + workStmts.length).reduce((acc, x) => acc + (x.meta?.changes ?? 0), 0);
    await logAudit("gdpr.erasure", u.role, `Výmaz podľa žiadosti #${req.id} (${rows.length} záznamov lv_owners, ${work} pracovných záznamov, ${buyers.length} záznamov evidencie dopytu)`);
    return { ok: true, removed: rows.length, work, buyers: buyers.length };
  });
export const getDataSubjectRecord = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), name: z.string().min(2), ku: z.string().optional(), lv: z.string().optional() }))
  .handler(async ({ data }): Promise<{ access: boolean; rows: Awaited<ReturnType<typeof findSubjectRows>>; buyers: SubjectBuyerRow[]; suppressed: boolean }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { access: false, rows: [], buyers: [], suppressed: false };
    return { access: true, rows: await findSubjectRows(data.name, data.ku, data.lv), buyers: await findSubjectBuyers(data.name), suppressed: await isSuppressed(data.name) };
  });

// ——— Bod 4: záloha D1 (export-only, gated admin/manažér) ———
export const exportBackup = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; json?: string; message?: string }> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    if (role !== "admin" && role !== "manager") return { ok: false, message: "Zálohu môže exportovať len admin alebo manažér." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const tables = (await q<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    )).map((t) => t.name);
    // BEZ tajomstiev: záloha obsahovala živé session tokeny (30 dní vydávať sa za kohokoľvek),
    // hashe hesiel a market_meta.alert_secret (zápis do všetkých ingest endpointov).
    const SKIP = new Set(["sessions"]);
    const dump: Record<string, unknown[]> = {};
    for (const t of tables) {
      if (SKIP.has(t)) continue;
      try { dump[t] = await q<Record<string, unknown>>(`SELECT * FROM ${t}`); } catch { dump[t] = []; }
    }
    if (dump.users) dump.users = dump.users.map((r) => { const { pass_hash: _p, salt: _s, ...rest } = r as Record<string, unknown>; return rest; });
    if (dump.market_meta) dump.market_meta = dump.market_meta.map((r) => {
      const row = r as Record<string, unknown>;
      return /secret|token|key/i.test(String(row.key ?? "")) ? { ...row, value: "[odstránené]" } : row;
    });
    await logAudit("backup.export", role, `Záloha D1: ${tables.length} tabuliek.`);
    return { ok: true, json: JSON.stringify({ app: "tri-lipy-kataster", exported_at: new Date().toISOString(), tables: dump }) };
  });

// ——— Evidenčný list (Bod C) — C-KN parcely + historický UŽÍVATEĽ (uz.CEL cez pa.CEL), NIE vlastník ———
export const getEvidencnyList = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), celok: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }) => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const role = await roleFromToken(data.token);
    const access = ownerAccess(role);
    const dataset = (await q<Dataset>("SELECT * FROM datasets WHERE id = ?", [data.datasetId]))[0] ?? null;
    const cel = (await q<{ celok: number; uzivatel: string | null; ico: string | null }>(
      "SELECT celok, uzivatel, ico FROM celky WHERE dataset_id = ? AND celok = ?",
      [data.datasetId, data.celok],
    ))[0] ?? null;
    const parcels = await q<{ parcel_no: string; area_m2: number; use_type: string | null }>(
      "SELECT parcel_no, area_m2, use_type FROM parcels WHERE dataset_id = ? AND celok = ? ORDER BY CAST(parcel_no AS INTEGER), parcel_no",
      [data.datasetId, data.celok],
    );
    // Meno užívateľa je osobný údaj → len pre full access; parcely (čísla/výmery) sú OK.
    const uzivatel = access === "full" ? (cel?.uzivatel ?? null) : null;
    const isCompany = !!cel?.ico;
    return { dataset, celok: data.celok, uzivatel, ico: cel?.ico ?? null, isCompany, parcels, access };
  });

// Užívateľ pre celok (identify na mape) — gatované.
export const getCelokUser = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), celok: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ uzivatel: string | null; ico: string | null }> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const access = ownerAccess(await roleFromToken(data.token));
    const cel = (await q<{ uzivatel: string | null; ico: string | null }>(
      "SELECT uzivatel, ico FROM celky WHERE dataset_id = ? AND celok = ?",
      [data.datasetId, data.celok],
    ))[0] ?? null;
    return { uzivatel: access === "full" ? (cel?.uzivatel ?? null) : null, ico: cel?.ico ?? null };
  });

// ——— BPEJ zóny pre mapovú vrstvu (Bod B) ———
export const listBpejZones = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    return await q<{ code: string; skupina: number | null; geometry_json: string }>(
      "SELECT code, skupina, geometry_json FROM bpej_zones WHERE dataset_id = ?",
      [data.datasetId],
    );
  });

// Cenník odvodov za odňatie poľnohospodárskej pôdy (NV 58/2013 Z.z.) — 9 skupín kvality.
export const getBpejCennik = createServerFn({ method: "GET" }).handler(async () => {
  return await q<{ skupina: number; eur_m2: number; eur_m2_docasne: number | null; popis: string | null }>(
    "SELECT skupina, eur_m2, eur_m2_docasne, popis FROM bpej_cennik ORDER BY skupina",
  );
});

// ——— Bod B: egress self-test — overí, či Worker dokáže outbound fetch na verejné registre ———
type EgressProbe = { id: string; label: string; ok: boolean; status: number | null; ms: number; sample: string | null; error: string | null };
export const egressSelfTest = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ allowed: boolean; anyOk: boolean; probes: EgressProbe[] }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canSign(role)) return { allowed: false, anyOk: false, probes: [] };
    const targets: { id: string; label: string; url: string }[] = [
      { id: "rpo", label: "RPO — Register právnických osôb (ŠÚ SR)", url: "https://api.statistics.sk/rpo/v1/search?identifier=17335345" },
      { id: "rpvs", label: "RPVS — Register partnerov verejného sektora", url: "https://rpvs.gov.sk/opendatav2/Partneri?%24top=1" },
      { id: "ov", label: "Obchodný vestník (justice.gov.sk)", url: "https://www.justice.gov.sk/robots.txt" },
    ];
    const probes: EgressProbe[] = [];
    for (const t of targets) {
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 7000);
        const res = await fetch(t.url, { headers: { accept: "application/json,text/plain,*/*" }, signal: ctrl.signal });
        clearTimeout(to);
        const txt = await res.text();
        probes.push({ id: t.id, label: t.label, ok: res.ok, status: res.status, ms: Date.now() - t0, sample: txt.slice(0, 160) || null, error: null });
      } catch (e) {
        probes.push({ id: t.id, label: t.label, ok: false, status: null, ms: Date.now() - t0, sample: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const anyOk = probes.some((p) => p.ok);
    await logAudit("egress.selftest", role, `Egress self-test: ${probes.filter((p) => p.ok).length}/${probes.length} OK.`);
    return { allowed: true, anyOk, probes };
  });

// ——— Bod 2: živé verejné registre s D1 cache (7 dní + refresh) ———
const REG_TTL = 7 * 24 * 3600;
const asObj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" ? (x as Record<string, unknown>) : null);
const asVal = (x: unknown): string | null => {
  if (x == null) return null;
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  return null;
};
const asArr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

async function regCacheRead(key: string, refresh: boolean, ttl: number = REG_TTL): Promise<{ payload: unknown; ageDays: number } | null> {
  if (refresh) return null;
  const row = (await q<{ payload: string; fetched_at: number }>("SELECT payload, fetched_at FROM register_cache WHERE cache_key = ?", [key]))[0];
  if (!row) return null;
  const age = Math.floor(Date.now() / 1000) - row.fetched_at;
  if (age > ttl) return null;
  try { return { payload: JSON.parse(row.payload), ageDays: Math.floor(age / 86400) }; } catch { return null; }
}
async function regCacheWrite(key: string, kind: string, payload: unknown) {
  const { DB } = bindings();
  if (!DB) return;
  await DB.prepare(
    "INSERT INTO register_cache (cache_key, kind, payload, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, kind=excluded.kind",
  ).bind(key, kind, JSON.stringify(payload), Math.floor(Date.now() / 1000)).run();
}
async function fetchJsonTimed(url: string, ms = 9000): Promise<unknown> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "tri-lipy/1.0 (kataster)" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(to); }
}

type RpvsKuv = { name: string; birth: string | null; pep: boolean; current: boolean };
type RpvsResult = { found: boolean; name: string | null; ico: string | null; vlozka: number | null; kuv: RpvsKuv[]; funkcionari: string[]; cached?: boolean; ageDays?: number; message?: string };

// RPVS — Register partnerov verejného sektora: koneční užívatelia výhod (KÚV) + PEP + štruktúra.
export const lookupRpvs = createServerFn({ method: "POST" })
  .validator(z.object({ ico: z.string().min(5), role: roleSchema, token: z.string().optional(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<RpvsResult> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canSeeOwners(role)) return { found: false, name: null, ico: null, vlozka: null, kuv: [], funkcionari: [], message: "Rola nemá owner prístup." };
    const ico = data.ico.replace(/\D/g, "");
    if (ico.length < 5) return { found: false, name: null, ico, vlozka: null, kuv: [], funkcionari: [], message: "Neplatné IČO." };
    const key = `rpvs:ico:${ico}`;
    const cached = await regCacheRead(key, !!data.refresh);
    if (cached) return { ...(cached.payload as RpvsResult), cached: true, ageDays: cached.ageDays };
    const url = `https://rpvs.gov.sk/opendatav2/Partneri?$filter=PartneriVerejnehoSektora/any(p:p/Ico eq '${ico}')&$expand=KonecniUzivateliaVyhod,PartneriVerejnehoSektora,VerejniFunkcionari`;
    let out: RpvsResult = { found: false, name: null, ico, vlozka: null, kuv: [], funkcionari: [] };
    try {
      const json = asObj(await fetchJsonTimed(encodeURI(url))) ?? {};
      const p = asObj(asArr(json.value)[0]);
      if (p) {
        const pvs = asObj(asArr(p.PartneriVerejnehoSektora)[0]) ?? {};
        const kuv: RpvsKuv[] = asArr(p.KonecniUzivateliaVyhod).map((k0) => {
          const k = asObj(k0) ?? {};
          const nm = [asVal(k.TitulPred), asVal(k.Meno), asVal(k.Priezvisko), asVal(k.TitulZa)].filter(Boolean).join(" ").trim();
          return { name: nm || asVal(k.ObchodneMeno) || "—", birth: (asVal(k.DatumNarodenia) ?? "").slice(0, 10) || null, pep: k.JeVerejnyCinitel === true, current: !asVal(k.PlatnostDo) };
        });
        const vf = asArr(p.VerejniFunkcionari).map((f0) => { const f = asObj(f0) ?? {}; return [asVal(f.Meno), asVal(f.Priezvisko)].filter(Boolean).join(" "); }).filter(Boolean);
        out = { found: true, name: asVal(pvs.ObchodneMeno), ico, vlozka: typeof p.CisloVlozky === "number" ? p.CisloVlozky : null, kuv, funkcionari: vf };
      }
      await regCacheWrite(key, "rpvs", out);
      await logAudit("rpvs.lookup", role, `RPVS IČO ${ico}: ${out.found ? out.kuv.length + " KÚV" : "bez záznamu"}.`);
    } catch (e) {
      return { found: false, name: null, ico, vlozka: null, kuv: [], funkcionari: [], message: e instanceof Error ? e.message : "chyba spojenia" };
    }
    return out;
  });

// ——— ÚP zóny (funkčné plochy ako polygóny) + auto priradenie parcele ———
type UpZoneRow = {
  id: number; code: string | null; name: string | null; ipp: number | null; izp: number | null; kz: number | null;
  character: string | null; kategoria: string | null; pripustne: string | null; podmienecne: string | null; nepripustne: string | null; geometry_json: string;
};
const UPZONE_COLS = "id,code,name,ipp,izp,kz,character,kategoria,pripustne,podmienecne,nepripustne,geometry_json";

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function zoneContains(geojson: string, lng: number, lat: number): boolean {
  try {
    const g = JSON.parse(geojson) as { type: string; coordinates: unknown };
    const polys = g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : g.type === "Polygon" ? [g.coordinates as number[][][]] : [];
    for (const poly of polys) if (poly[0] && pointInRing(lng, lat, poly[0])) return true;
    return false;
  } catch { return false; }
}

export const listUpZones = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }) => {
    return await q<UpZoneRow>(`SELECT ${UPZONE_COLS} FROM up_zones WHERE dataset_id = ?`, [data.datasetId]);
  });

// getParcelZone — ÚP zóna obsahujúca centroid parcely (alebo null → klient použije proxy z druhu).
export const getParcelZone = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lat: z.number(), lng: z.number() }))
  .handler(async ({ data }): Promise<UpZoneRow | null> => {
    const zones = await q<UpZoneRow>(`SELECT ${UPZONE_COLS} FROM up_zones WHERE dataset_id = ?`, [data.datasetId]);
    for (const zn of zones) if (zoneContains(zn.geometry_json, data.lng, data.lat)) return zn;
    return null;
  });

// importUpZones — GeoJSON FeatureCollection → up_zones (regulatív z properties alebo z číselníka podľa kódu).
export const importUpZones = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), geojson: z.string(), role: roleSchema, token: z.string().optional(), replace: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, count: 0, message: "Rola nemá oprávnenie importovať ÚP." };
    const { DB } = bindings();
    if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
    let fc: unknown;
    try { fc = JSON.parse(data.geojson); } catch { return { ok: false, count: 0, message: "Neplatný GeoJSON." }; }
    const fco = fc as { type?: string; features?: unknown[] };
    const feats: unknown[] = Array.isArray(fco?.features) ? fco.features : fco?.type === "Feature" ? [fc] : [];
    if (!feats.length) return { ok: false, count: 0, message: "GeoJSON neobsahuje features." };
    if (data.replace) await DB.prepare("DELETE FROM up_zones WHERE dataset_id = ?").bind(data.datasetId).run();
    const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const str = (v: unknown): string | null => (v == null ? null : String(v));
    const stmts = [];
    for (const f0 of feats) {
      const f = f0 as { geometry?: { type?: string }; properties?: Record<string, unknown> };
      const g = f?.geometry;
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
      const p = f?.properties ?? {};
      const code = str(p.kod ?? p.code ?? p.KOD ?? p.regulativ ?? p.funkcia ?? p.FUNKCIA);
      const name = str(p.nazov ?? p.name ?? p.NAZOV ?? p.nazov_fp ?? p.popis);
      let ipp = num(p.ipp ?? p.IPP), izp = num(p.izp ?? p.IZP), kz = num(p.kz ?? p.KZ);
      let character = str(p.charakter ?? p.character), kategoria = str(p.kategoria);
      let pripustne = str(p.pripustne), podmienecne = str(p.podmienecne), nepripustne = str(p.nepripustne);
      const reg = code ? regulativByCode(code) : undefined;
      if (reg) {
        ipp = ipp ?? reg.ipp; izp = izp ?? reg.izp; kz = kz ?? reg.kz;
        character = character ?? reg.character; kategoria = kategoria ?? reg.kategoria;
        pripustne = pripustne ?? reg.pripustne; podmienecne = podmienecne ?? reg.podmienecne; nepripustne = nepripustne ?? reg.nepripustne;
      }
      stmts.push(
        DB.prepare("INSERT INTO up_zones (dataset_id,code,name,ipp,izp,kz,character,kategoria,pripustne,podmienecne,nepripustne,geometry_json,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'import')")
          .bind(data.datasetId, code, name, ipp, izp, kz, character, kategoria, pripustne, podmienecne, nepripustne, JSON.stringify(g)),
      );
      if (stmts.length >= 2000) break;
    }
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    await logAudit("up.zones.import", role, `Import ÚP zón: ${stmts.length} zón.`, data.datasetId);
    return { ok: true, count: stmts.length };
  });

// ——— Trhové ceny (scrape inzercie) — Worker fetchne verejný market-data.json a uloží do D1 ———
type MarketMeta = { generated?: string; counts?: Record<string, number> };

// Per-typ rozumné hranice €/m² (cena za meter²) — mimo nich = zjavný mis-parse
// (napr. €/m² zamenené za celkovú cenu, alebo celková cena / zlú výmeru) → vylúči sa z mediánov.
const PPM2_BOUNDS: Record<string, [number, number]> = {
  pozemok: [0.5, 1500], byt: [150, 15000], dom: [80, 15000], chata: [20, 8000],
};
const ppm2Sane = (ptype: unknown, v: number | null): number | null => {
  if (v == null || !isFinite(v) || v <= 0) return null;
  const [lo, hi] = PPM2_BOUNDS[String(ptype)] ?? [1, 15000];
  return v >= lo && v <= hi ? Math.round(v * 10) / 10 : null;
};
const PRICE_MAX = 30_000_000; // nad túto celkovú cenu = zjavný mis-parse (telefón/ID/€-m² × výmera)
const priceSane = (v: number | null): number | null => (v != null && isFinite(v) && v >= 300 && v <= PRICE_MAX ? v : null);
// Normalizácia „obec"/okres na kanonický okres (bazos „obec" = okresné mesto; Nominatim county = „okres X").
const OKRES_ALIAS: Record<string, string> = {
  "Nové Mesto n.Váhom": "Nové Mesto nad Váhom", "Nové Mesto n. Váhom": "Nové Mesto nad Váhom",
  "Štúrovo": "Nové Zámky", "Hurbanovo": "Komárno", "Hrubá Borša": "Senec", "Vyšné Ružbachy": "Stará Ľubovňa",
};
const normOkres = (okresRow: unknown, obec: unknown): string | null => {
  let o = (asVal(okresRow) ?? asVal(obec) ?? "").trim();
  if (!o) return null;
  o = o.replace(/^okres\s+/i, "");
  if (/^Bratislava/i.test(o)) o = "Bratislava";
  else if (/^Košice/i.test(o) && o !== "Košice-okolie") o = "Košice";
  return OKRES_ALIAS[o] ?? o;
};
// Pipeline autorizácia: buď session rola s právom pipeline, ALEBO platný market secret (cloud
// GitHub Action nemá session, len ALERT_SECRET). Bez toho ingestMarketAll volal refresh* s rolou od
// klienta; po hardeningu rola ide zo session → server-side volanie bez tokenu padlo na „viewer"
// a ingest do D1 prestal fungovať (origin svieži, D1 zastaraný).
// A7 (review 2026-11-10): ingest stiahne JSON a ZAPÍŠE ho do D1 (ceny, inzeráty, ÚP číselník). URL prichádzala
// v požiadavke a nebola obmedzená → stačila rola analytik a vlastná URL a appka by naplnila databázu
// podvrhnutými cenami/odkazmi. Zdroj musí byť náš repozitár tri-lipy-market (tam publikuje scraper aj Mac).
// `new URL` normalizuje `..` aj `user@host`, takže porovnanie prefixu po normalizácii je bezpečné.
const TRUSTED_DATA_PREFIX = "https://raw.githubusercontent.com/kristiakbohus-hub/tri-lipy-market/";
function trustedDataUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try { const u = new URL(url); return u.protocol === "https:" && u.href.startsWith(TRUSTED_DATA_PREFIX); } catch { return false; }
}
const UNTRUSTED_MSG = "Zdroj dát musí byť repozitár tri-lipy-market (raw.githubusercontent.com/kristiakbohus-hub/tri-lipy-market/…).";

// Porovnanie secretu v konštantnom čase (A8) — `!==` skončí na prvom rozdielnom znaku.
function secretEq(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

async function pipelineAuthed(role: Role, pipelineSecret?: string): Promise<boolean> {
  if (canRunPipeline(role)) return true;
  if (!pipelineSecret) return false;
  const expected = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'"))[0]?.value;
  return secretEq(pipelineSecret, expected);
}

export const refreshMarketData = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, token: z.string().optional(), url: z.string().url().optional(), pipelineSecret: z.string().optional(), persist: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; index: number; opps: number; generated?: string; chunks?: number; phChunks?: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, alebo pipeline secret (cloud ingest)
    if (!(await pipelineAuthed(role, data.pipelineSecret))) return { ok: false, index: 0, opps: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, index: 0, opps: 0, message: "Databáza nedostupná." };
    let url = data.url;
    if (url && !trustedDataUrl(url)) return { ok: false, index: 0, opps: 0, message: UNTRUSTED_MSG };
    // persist=false: URL pripnuté na konkrétny commit (cloud ingest) sa NEukladá ako trvalý zdroj
    if (url && data.persist !== false) await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('source_url',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(url).run();
    else if (!url) url = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='source_url'"))[0]?.value;
    if (!url) return { ok: false, index: 0, opps: 0, message: "Nie je nastavené zdrojové URL (market-data.json)." };
    if (!trustedDataUrl(url)) return { ok: false, index: 0, opps: 0, message: UNTRUSTED_MSG };
    let json: unknown;
    try { json = await fetchJsonTimed(url, 15000); } catch (e) { return { ok: false, index: 0, opps: 0, message: e instanceof Error ? e.message : "Fetch zlyhal." }; }
    const j = asObj(json) ?? {};
    const idx = asArr(j.index), opps = asArr(j.opportunities);
    const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const s = (v: unknown) => asVal(v);
    const idxStmts = idx.map((r0) => { const r = asObj(r0) ?? {}; return DB.prepare(
      "INSERT INTO market_index (okres,obec,ptype,deal,day,median_eur_m2,p25,p75,cnt) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(okres,obec,ptype,deal,day) DO UPDATE SET median_eur_m2=excluded.median_eur_m2,p25=excluded.p25,p75=excluded.p75,cnt=excluded.cnt")
      .bind(s(r.okres), s(r.obec), s(r.ptype), s(r.deal), s(r.day), num(r.median ?? r.median_eur_m2), num(r.p25), num(r.p75), num(r.cnt)); });
    const oppStmts = opps.map((o0) => { const o = asObj(o0) ?? {}; return DB.prepare(
      "INSERT INTO market_opportunities (source,ext_id,url,title,ptype,deal,okres,obec,area_m2,rooms,price_eur,price_per_m2,first_seen,last_seen,days_on_market,price_drop_pct,below_market_pct,flags,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(source,ext_id) DO UPDATE SET url=excluded.url,title=excluded.title,price_eur=excluded.price_eur,price_per_m2=excluded.price_per_m2,last_seen=excluded.last_seen,days_on_market=excluded.days_on_market,price_drop_pct=excluded.price_drop_pct,below_market_pct=excluded.below_market_pct,flags=excluded.flags,updated_at=datetime('now')")
      .bind(s(o.source), s(o.ext_id), s(o.url), s(o.title), s(o.ptype), s(o.deal), s(o.okres), s(o.obec), num(o.area ?? o.area_m2), num(o.rooms), num(o.price ?? o.price_eur), num(o.ppm2 ?? o.price_per_m2), s(o.first_seen), s(o.last_seen), num(o.dom ?? o.days_on_market), num(o.drop_pct ?? o.price_drop_pct), num(o.below_pct ?? o.below_market_pct), s(o.flags)); });
    for (let i = 0; i < idxStmts.length; i += 50) await DB.batch(idxStmts.slice(i, i + 50));
    // Príležitosti sú ZOZNAM DŇA, nie história: dovtedy sa len pridávali, takže v appke ostávali aj
    // mesiace mŕtve inzeráty (z augusta). Pri novom neprázdnom zozname sa starý nahradí.
    if (oppStmts.length) await DB.prepare("DELETE FROM market_opportunities").run();
    for (let i = 0; i < oppStmts.length; i += 50) await DB.batch(oppStmts.slice(i, i + 50));
    const generated = (asObj(j.meta) as MarketMeta | null)?.generated ?? s(j.generated) ?? undefined;
    await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('last_refresh',datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now')").run();
    if (generated) await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('generated',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(generated).run();
    const chunks = typeof j.listings_chunks === "number" ? j.listings_chunks : 0;
    await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('listings_chunks',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(chunks)).run();
    const phChunks = typeof j.pricehistory_chunks === "number" ? j.pricehistory_chunks : 0;
    await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('pricehistory_chunks',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(phChunks)).run();
    if (asVal(j.mode) === "full" && generated) await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('last_full',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(generated).run();
    await logAudit("market.refresh", role, `Trhové dáta: ${idxStmts.length} index, ${oppStmts.length} príležitostí, ${chunks} chunkov.`);
    return { ok: true, index: idxStmts.length, opps: oppStmts.length, generated, chunks, phChunks };
  });

// Chunkovaný ingest inzerátov (market-listings-<i>.json) — Worker fetchne chunk a upsertne (história navždy).
export const refreshMarketListings = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url(), role: roleSchema, token: z.string().optional(), pipelineSecret: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, alebo pipeline secret (cloud ingest)
    if (!(await pipelineAuthed(role, data.pipelineSecret))) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
    if (!trustedDataUrl(data.url)) return { ok: false, count: 0, message: UNTRUSTED_MSG };
    let arr: unknown[];
    try { const j = await fetchJsonTimed(data.url, 20000); arr = Array.isArray(j) ? j : asArr((asObj(j) ?? {}).listings); }
    catch (e) { return { ok: false, count: 0, message: e instanceof Error ? e.message : "Fetch zlyhal." }; }
    const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const s = (v: unknown) => asVal(v);
    const stmts = arr.map((o0) => {
      const o = asObj(o0) ?? {};
      const area = num(o.area_m2 ?? o.area), price = priceSane(num(o.price_eur ?? o.price));
      // ppm2 (cena za m²): najprv zo zdroja s clampom; ak chýba a poznáme celkovú cenu + výmeru, dopočítaj a clampni.
      let ppm2 = ppm2Sane(o.ptype, num(o.ppm2));
      if (ppm2 == null && area && area > 5 && price && price > 0) ppm2 = ppm2Sane(o.ptype, price / area);
      const okres = normOkres(o.okres, o.obec);
      return DB.prepare(
      "INSERT INTO market_listings (source,ext_id,url,title,ptype,deal,obec,psc,lat,lng,area_m2,rooms,price_eur,ppm2,first_seen,last_seen,first_price,flags,okres,removed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,ext_id) DO UPDATE SET url=excluded.url,title=excluded.title,ptype=excluded.ptype,obec=excluded.obec,psc=excluded.psc,lat=excluded.lat,lng=excluded.lng,area_m2=excluded.area_m2,price_eur=excluded.price_eur,ppm2=excluded.ppm2,last_seen=excluded.last_seen,flags=excluded.flags,okres=excluded.okres,removed_at=excluded.removed_at")
      .bind(s(o.source) ?? "bazos", s(o.ext_id), s(o.url), s(o.title), s(o.ptype), s(o.deal), s(o.obec), s(o.psc), num(o.lat), num(o.lng), area, num(o.rooms), price, ppm2, s(o.first_seen ?? o.listed), s(o.last_seen), priceSane(num(o.first_price ?? o.price_eur ?? o.price)), s(o.flags), okres, s(o.removed_at)); });
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    return { ok: true, count: stmts.length };
  });

// ——— Per-inzerát história ceny: ingest chunku (market-pricehistory-<i>.json) + fetch krivky ———
export const refreshMarketPriceHistory = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url(), role: roleSchema, token: z.string().optional(), pipelineSecret: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, alebo pipeline secret (cloud ingest)
    if (!(await pipelineAuthed(role, data.pipelineSecret))) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
    if (!trustedDataUrl(data.url)) return { ok: false, count: 0, message: UNTRUSTED_MSG };
    let arr: unknown[];
    try { const j = await fetchJsonTimed(data.url, 20000); arr = Array.isArray(j) ? j : asArr((asObj(j) ?? {}).history); }
    catch (e) { return { ok: false, count: 0, message: e instanceof Error ? e.message : "Fetch zlyhal." }; }
    const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const s = (v: unknown) => asVal(v);
    const valid = arr.filter((o0) => { const o = asObj(o0) ?? {}; return o.ext_id != null && o.day != null; });
    const stmts = valid.map((o0) => {
      const o = asObj(o0) ?? {};
      return DB.prepare(
        "INSERT INTO market_price_history (source,ext_id,day,price_eur,ppm2) VALUES (?,?,?,?,?) ON CONFLICT(source,ext_id,day) DO UPDATE SET price_eur=excluded.price_eur,ppm2=excluded.ppm2")
        .bind(s(o.source) ?? "bazos", s(o.ext_id), s(o.day), num(o.price_eur ?? o.price), num(o.ppm2));
    });
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    return { ok: true, count: stmts.length };
  });

// ——— AVM (odhad hodnoty) — €/m² per okres × druh pozemku ———
// Kalibrované defaulty €/m² (Kysuce) — orná/les/záhrada sa na trhu takmer nepredávajú, tak default.
const AVM_DEFAULT: Record<string, number> = { stavebny: 45, zastavany: 40, zahrada: 15, polnohosp: 1.5, les: 1.0, ostatna: 8, vodna: 0.3 };
export function avmCategory(druh: string | null | undefined): keyof typeof AVM_DEFAULT {
  const t = (druh ?? "").toLowerCase();
  if (/zastavan|nádvor|nadvor/.test(t)) return "zastavany";
  if (/záhrad|zahrad/.test(t)) return "zahrada";
  if (/les/.test(t)) return "les";
  if (/vodn/.test(t)) return "vodna";
  if (/orn|trávn|travn|ttp|lúk|luk|chme|vinic|ovoc|sad|pasien|poľnohos|polnohos/.test(t)) return "polnohosp";
  return "ostatna";
}
const _avmMedian = (a: number[]): number | null => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Prepočíta avm_index (€/m² stavebných pozemkov per okres, asking medián + realized blend). Volá sa pri ingeste.
async function computeAvmIndex(): Promise<number> {
  const { DB } = bindings();
  if (!DB) return 0;
  const ask = await q<{ okres: string; ppm2: number }>("SELECT okres, ppm2 FROM market_listings WHERE ptype='pozemok' AND removed_at IS NULL AND ppm2 BETWEEN 5 AND 300 AND lower(title) LIKE '%stavebn%' AND okres IS NOT NULL");
  const rel = await q<{ okres: string; ppm2: number }>("SELECT okres, ppm2 FROM market_listings WHERE ptype='pozemok' AND removed_at IS NOT NULL AND (julianday(removed_at)-julianday(last_seen))<=14 AND ppm2 BETWEEN 5 AND 300 AND lower(title) LIKE '%stavebn%' AND okres IS NOT NULL");
  const A: Record<string, number[]> = {}, R: Record<string, number[]> = {};
  for (const r of ask) (A[r.okres] ??= []).push(r.ppm2);
  for (const r of rel) (R[r.okres] ??= []).push(r.ppm2);
  const stmts: ReturnType<typeof DB.prepare>[] = [];
  for (const ok of new Set([...Object.keys(A), ...Object.keys(R)])) {
    const a = A[ok] ?? [], rr = R[ok] ?? [], na = a.length, nr = rr.length;
    const ma = _avmMedian(a), mr = _avmMedian(rr);
    let ppm2: number | null = null, basis = "asking";
    if (nr >= 5) { ppm2 = mr; basis = "realized"; }
    else if (nr >= 3 && na >= 3 && mr != null && ma != null) { ppm2 = Math.round((mr * 0.6 + ma * 0.4) * 10) / 10; basis = "blend"; }
    else if (na >= 3) { ppm2 = ma; basis = "asking"; }
    else continue;
    stmts.push(DB.prepare("INSERT INTO avm_index (okres,ppm2_stavebny,n_asking,ppm2_realized,n_realized,basis,updated) VALUES (?,?,?,?,?,?,date('now')) ON CONFLICT(okres) DO UPDATE SET ppm2_stavebny=excluded.ppm2_stavebny,n_asking=excluded.n_asking,ppm2_realized=excluded.ppm2_realized,n_realized=excluded.n_realized,basis=excluded.basis,updated=excluded.updated").bind(ok, ppm2, na, mr, nr, basis));
  }
  for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
  return stmts.length;
}

// B5: denný refresh obec_market_median (medián stavebných €/m² per obec z inzerátov). Obce bez dát (seed dediny) sa NEprepíšu.
async function computeObecMarket(): Promise<number> {
  const { DB } = bindings();
  if (!DB) return 0;
  const rows = await q<{ obec: string; ppm2: number }>("SELECT obec, ppm2 FROM market_listings WHERE ptype='pozemok' AND removed_at IS NULL AND ppm2 BETWEEN 5 AND 300 AND lower(title) LIKE '%stavebn%' AND obec IS NOT NULL");
  const G: Record<string, number[]> = {};
  for (const r of rows) (G[r.obec] ??= []).push(r.ppm2);
  const stmts: ReturnType<typeof DB.prepare>[] = [];
  for (const obec of Object.keys(G)) {
    const arr = G[obec];
    if (arr.length < 3) continue;
    const med = _avmMedian(arr);
    if (med == null) continue;
    stmts.push(DB.prepare("INSERT INTO obec_market_median (obec,median_ppm2,n,ptype,updated) VALUES (?,?,?,'pozemok',date('now')) ON CONFLICT(obec) DO UPDATE SET median_ppm2=excluded.median_ppm2,n=excluded.n,updated=excluded.updated").bind(obec, med, arr.length));
  }
  for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
  return stmts.length;
}

// ——— Zmeny na úradných tabuliach obcí (Mac ÚP monitor → appka) ———
// Monitor sleduje 1027 obcí a denne nájde ~100–400 zmien, ale publikoval ich len na GitHub, odkiaľ
// ich v appke nikto nečítal — karta „Čo sa zmenilo" preto ukazovala nulu. Navyše ten publish bol
// pokazený (git push s check=False a nepodmieneným „publikované"), takže súbor na GitHube stál
// 4 dni. Preto ide Mac priamo sem, rovnakým vzorom ako ostatné ingesty.
//
// POZOR: je to CELÁ úradná tabuľa, nie len územný plán. Z jedného behu malo vzťah k pozemkom
// alebo výstavbe 8 z 270 záznamov. Preto `relevance` a preto to nikde nevolám „zmeny ÚP".
export const ingestObecChanges = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    rows: z.array(z.object({
      obec: z.string().min(1).max(120), kuCode: z.string().max(10).optional(),
      title: z.string().max(400).optional(), url: z.string().max(600).optional(),
      change: z.string().max(20).optional(), relevance: z.string().max(20).optional(),
      okres: z.string().max(60).nullable().optional(),
      detectedAt: z.string().max(32).optional(),
    })).max(2000),
    // Register ÚP stránok obcí (k.ú. → obec → URL). Cesta existuje, ALE ⚠ NEPLNIŤ JU ZO
    // `up-registry.json` MONITORA: z 1027 obcí má ku_code len 4 a jeden z tých štyroch je
    // NESPRÁVNY — tvrdí `800376 = Turzovka`, pričom 800376 je Babkov (okres Žilina) a Turzovka je
    // 866083 (okres Čadca). Appka by potom pre žilinské k.ú. hľadala územný plán Turzovky.
    // Správny zdroj priradenia je ÚGKK gazetteer (viď 40_UP_GEOREF/up_obec_web.py, ktorý doménu
    // obce aj OVERÍ). Kým to nie je odvodené odtiaľ, sem sa register neposiela.
    registry: z.array(z.object({
      kuCode: z.string().min(1).max(10), obec: z.string().max(120).optional(),
      upPageUrl: z.string().max(600).optional(),
    })).max(3000).optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    // INSERT OR IGNORE + UNIQUE → opakovaný push to neduplikuje a nepotrebuje reset
    const stmt = DB.prepare(
      `INSERT OR IGNORE INTO obec_changes (obec,ku_code,title,url,change,relevance,detected_at,okres)
       VALUES (?,?,?,?,?,?,?,?)`);
    // ISO timestamp z monitora má „T" („2026-10-08T07:05:39"), ale SQLite `datetime()` dáva medzeru.
    // V ASCII je „T" (0x54) VÄČŠIE než medzera (0x20), takže „…09T05:00" > „…09 12:00" — obecný
    // záznam z rána sa v spojenom prúde radil NAD katastrálny z poobedia a „najnovšie prvé"
    // nebola pravda; rovnako klamalo porovnanie na hranici dátumového filtra. Normalizujeme pri
    // zápise, nie pri čítaní, aby to platilo pre každý dotaz.
    const norm = (t: string | undefined) => (t ? t.replace("T", " ").slice(0, 19) : null);
    const batch = data.rows.map((r) => stmt.bind(
      r.obec, r.kuCode ?? null, r.title ?? null, r.url ?? null,
      r.change ?? null, r.relevance ?? "ine", norm(r.detectedAt), r.okres ?? null));
    for (let i = 0; i < batch.length; i += 50) await DB.batch(batch.slice(i, i + 50));
    let reg = 0;
    if (data.registry?.length) {
      const rs = DB.prepare(
        `INSERT INTO up_registry (ku_code,obec,up_page_url) VALUES (?,?,?)
         ON CONFLICT(ku_code) DO UPDATE SET obec=COALESCE(excluded.obec,up_registry.obec),
                                           up_page_url=COALESCE(excluded.up_page_url,up_registry.up_page_url)`);
      const rb = data.registry.map((r) => rs.bind(r.kuCode, r.obec ?? null, r.upPageUrl ?? null));
      for (let i = 0; i < rb.length; i += 50) await DB.batch(rb.slice(i, i + 50));
      reg = rb.length;
    }
    return { ok: true, inserted: data.rows.length + reg };
  });

// ——— Záznam kontaktu s vlastníkom (od nálezu k osloveniu) ———
// Appka príležitosť našla a tam to skončilo. Nikde nebolo, komu sa už volalo, čo odpovedal a kedy
// sa ozvať znova — pri 117 zhodách naprieč 30 k.ú. sa to v hlave neudrží a dá sa volať dvakrát
// tomu istému alebo zabudnúť na toho, kto povedal „o rok".
// `owner_name` je OWNER-SENSITIVE ako lv_owners → čítanie rolovo gatované, zápis cez rolu zo session.
export const CONTACT_CHANNELS = ["list", "telefon", "email", "osobne", "ine"] as const;
export const CONTACT_OUTCOMES = ["odoslane", "nezastihnuty", "zaujem", "nezaujem", "rozmysli", "dohoda", "odmietol"] as const;   // odoslane = list odoslaný, čaká na odpoveď
export type ContactRow = {
  id: number; dataset_id: string | null; lv_no: number | null; parcel_no: string | null;
  owner_name: string | null; channel: string; outcome: string; note: string | null;
  next_at: string | null; author: string | null; created_at: string;
};

export const addContact = createServerFn({ method: "POST" })
  .validator(z.object({
    token: z.string().optional(),
    datasetId: z.string().optional(), lvNo: z.number().optional(), parcelNo: z.string().optional(),
    ownerName: z.string().max(300).optional(),
    channel: z.enum(CONTACT_CHANNELS), outcome: z.enum(CONTACT_OUTCOMES),
    note: z.string().max(2000).optional(), nextAt: z.string().max(10).optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = data.token ? await userFromToken(data.token).catch(() => null) : null;
    if (!u) return { ok: false, message: "Zápis kontaktu vyžaduje prihlásenie." };
    const role = (u.role ?? "viewer") as Role;
    if (!canSeeOwners(role)) return { ok: false, message: "Rola nemá prístup k údajom o vlastníkoch." };
    await q(`INSERT INTO contact_log (dataset_id,lv_no,parcel_no,owner_name,channel,outcome,note,next_at,user_id,author)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [data.datasetId ?? null, data.lvNo ?? null, data.parcelNo ?? null, data.ownerName ?? null,
       data.channel, data.outcome, data.note ?? null, data.nextAt || null, u.id, u.name ?? u.email]);
    await q("INSERT INTO activity (user_id,author,action,subject_type,subject_id,detail) VALUES (?,?,?,?,?,?)",
      [u.id, u.name ?? u.email, "contact.add", "lv", `${data.datasetId ?? "?"}/${data.lvNo ?? "?"}`,
       `${data.channel} → ${data.outcome}`]).catch(() => {});
    return { ok: true };
  });

export const getContacts = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().optional(), datasetId: z.string().optional(), lvNo: z.number().optional() }))
  .handler(async ({ data }): Promise<ContactRow[]> => {
    const role = await roleFromToken(data.token);
    if (!canSeeOwners(role)) return [];     // mená vlastníkov sú owner-sensitive
    const cond: string[] = []; const args: unknown[] = [];
    if (data.datasetId) { cond.push("dataset_id = ?"); args.push(data.datasetId); }
    if (data.lvNo != null) { cond.push("lv_no = ?"); args.push(data.lvNo); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return q<ContactRow>(
      `SELECT id,dataset_id,lv_no,parcel_no,owner_name,channel,outcome,note,next_at,author,created_at
       FROM contact_log ${where} ORDER BY id DESC LIMIT 200`, args).catch(() => []);
  });

// Mazanie: záznam bez možnosti opravy je pasca — preklep by v histórii ostal navždy a pri ďalšom
// hovore by zavádzal. Mazať smie AUTOR záznamu alebo admin; cudzí záznam nie, aby sa nedala
// prepisovať história kolegu.
export const deleteContact = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().optional(), id: z.number() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = data.token ? await userFromToken(data.token).catch(() => null) : null;
    if (!u) return { ok: false, message: "Mazanie vyžaduje prihlásenie." };
    const r = (await q<{ user_id: string | null }>("SELECT user_id FROM contact_log WHERE id = ?", [data.id]).catch(() => []))[0];
    if (!r) return { ok: false, message: "Záznam neexistuje." };
    if (r.user_id !== u.id && u.role !== "admin") {
      return { ok: false, message: "Zmazať môže len autor záznamu alebo admin." };
    }
    await q("DELETE FROM contact_log WHERE id = ?", [data.id]);
    await q("INSERT INTO activity (user_id,author,action,subject_type,subject_id,detail) VALUES (?,?,?,?,?,?)",
      [u.id, u.name ?? u.email, "contact.delete", "contact", String(data.id), "zmazaný záznam kontaktu"]).catch(() => {});
    return { ok: true };
  });

// „Koho zavolať" — čo má naplánovaný návrat a termín už nastal alebo sa blíži.
export const getFollowUps = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().optional(), days: z.number().min(0).max(365).optional() }))
  .handler(async ({ data }): Promise<ContactRow[]> => {
    const role = await roleFromToken(data.token);
    if (!canSeeOwners(role)) return [];
    const d = data.days ?? 7;
    return q<ContactRow>(
      `SELECT id,dataset_id,lv_no,parcel_no,owner_name,channel,outcome,note,next_at,author,created_at
       FROM contact_log
       WHERE next_at IS NOT NULL AND date(next_at) <= date('now', ?)
       ORDER BY date(next_at) ASC LIMIT 200`, [`+${d} days`]).catch(() => []);
  });

// ——— Kontrola dát: hľadá miesta, kde si appka protirečí ———
// Dôvod vzniku (2026-10-08): za jeden deň sa našlo šesť chýb, ktoré mali jedno spoločné — vyzerali
// ako dáta. Chipy dostupnosti sa nezobrazovali NIKDY (parser čakal iný tvar kľúča), dossier tvrdil
// nulovú zastavateľnosť ako fakt, detektor zmien vrátil pol milióna falošných zmien, počty na
// kartách ignorovali filter, prázdny výsledok bol prehltnutá SQL chyba a štyri datasety mali
// nesprávny okres, podľa ktorého sa vyberá trhová cena (Žilina dostávala cenu Čadce).
// Žiadnu z nich nenahlásilo nič — našli sa náhodou. Tieto kontroly hľadajú ROZPORY, nie chyby:
// dve miesta v dátach, ktoré sa nemôžu obe zhodovať s pravdou.
export type SanityCheck = {
  key: string; title: string; detail: string;
  level: "ok" | "warn" | "fail";
  n: number; sample: string | null;
};
export const getDataSanity = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<SanityCheck[]> => {
    const out: SanityCheck[] = [];
    const one = async <T>(sql: string, args: unknown[] = []) => (await q<T>(sql, args).catch(() => []))[0];
    const add = (key: string, title: string, n: number, detail: string, sample: string | null,
                 warnOver = 0) =>
      out.push({ key, title, n, detail, sample, level: n > warnOver ? (n > warnOver * 10 ? "fail" : "warn") : "ok" });

    // 1) hlavička datasetu vs. skutočné riadky — presne trieda chyby, ktorá dnes unikla
    const poc = await q<{ id: string; ku_name: string; dek: number; real: number }>(
      `SELECT d.id, d.ku_name, COALESCE(d.n_parcels,0) AS dek,
              (SELECT COUNT(*) FROM parcels p WHERE p.dataset_id = d.id) AS real
       FROM datasets d`).catch(() => []);
    const rozdiel = poc.filter((r) => r.dek > 0 && Math.abs(r.dek - r.real) > Math.max(5, r.dek * 0.02));
    add("pocty_datasetu", "Hlavička datasetu nesúhlasí so skutočnými parcelami", rozdiel.length,
        "Karta datasetu ukazuje počet z hlavičky. Ak nesúhlasí s počtom riadkov, jedno z tých čísel klame.",
        rozdiel.slice(0, 4).map((r) => `${r.ku_name}: hlavička ${r.dek}, riadkov ${r.real}`).join(" · ") || null);

    // 2) dataset tvrdí 100 % geometrie, ale parcely ju nemajú
    const geo = await q<{ ku_name: string; n: number }>(
      `SELECT d.ku_name, COUNT(*) AS n FROM datasets d JOIN parcels p ON p.dataset_id = d.id
       WHERE d.geometry_coverage >= 100 AND (p.geometry_json IS NULL OR p.geometry_json = '')
       GROUP BY d.id ORDER BY n DESC`).catch(() => []);
    add("geometria", "Dataset tvrdí 100 % geometrie, ale parcely ju nemajú", geo.length,
        "Pokrytie geometriou je v hlavičke napevno 100 %. Ak parcely geometriu nemajú, mapa aj dossier to nemajú z čoho vykresliť.",
        geo.slice(0, 4).map((r) => `${r.ku_name}: ${r.n} parciel`).join(" · ") || null);

    // 3) okres datasetu bez trhového podkladu → AVM padá na kódové defaulty
    const bezAvm = await q<{ ku_name: string; okres: string }>(
      `SELECT d.ku_name,
              TRIM(REPLACE(SUBSTR(d.region, 1, INSTR(d.region || ' · ', ' · ') - 1), 'okres ', '')) AS okres
       FROM datasets d
       WHERE okres NOT IN (SELECT okres FROM avm_index)`).catch(() => []);
    add("avm_okres", "Okres datasetu nemá trhový podklad", bezAvm.length,
        "Odhad hodnoty sa vyberá podľa okresu z regiónu datasetu. Bez riadku v trhovom indexe padne na kódový default — a nikde to nie je vidieť.",
        bezAvm.slice(0, 5).map((r) => `${r.ku_name} → „${r.okres}"`).join(" · ") || null);

    // 4) trhová cena bez porovnateľných
    const bezComp = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM avm_index WHERE ppm2_stavebny IS NOT NULL AND COALESCE(n_asking,0) + COALESCE(n_realized,0) < 3");
    add("avm_comps", "Trhová cena opretá o menej než 3 porovnateľné", bezComp?.n ?? 0,
        "Medián z jednej či dvoch ponúk nie je trh. Cena sa použije, ale nemá váhu.", null);

    // 5) príležitosti pre k.ú., ktoré v appke nie je ako dataset
    // POZOR na fallback: `datasets.ku_code` nie je vyplnený u starších importov, preto sa dataset
    // v celom kóde hľadá ako `ku_code = ? OR id = 'kn-' || ?`. Prvá verzia tejto kontroly ho
    // vynechala a nahlásila 225 „osirelých" príležitostí, ktoré v skutočnosti dataset majú.
    // Kontrola, ktorá kričí nadarmo, je horšia než žiadna.
    const sirotyLs = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM landsearch_results lr
       WHERE NOT EXISTS (SELECT 1 FROM datasets d
                         WHERE d.ku_code = lr.kod_ku OR d.id = 'kn-' || lr.kod_ku)`);
    add("siroty_landsearch", "Príležitosti pre k.ú. bez datasetu", sirotyLs?.n ?? 0,
        "Celok sa zobrazí, ale nedá sa z neho otvoriť dossier ani založiť deal — chýba dataset, na ktorý by sa napojil.", null);

    // 5b) dataset bez vyplneného kódu k.ú. — kvôli tomu musí každý dotaz nosiť fallback na id
    const bezKodu = await q<{ id: string; ku_name: string }>(
      "SELECT id, ku_name FROM datasets WHERE ku_code IS NULL OR TRIM(ku_code) = ''").catch(() => []);
    add("dataset_bez_kodu", "Dataset bez vyplneného kódu k.ú.", bezKodu.length,
        "Kvôli tomu musí každý dotaz hľadať dataset aj podľa id („kn-<kód>\"). Kde sa na ten fallback zabudne, dataset sa „nenájde\" a dáta vyzerajú ako osirelé.",
        bezKodu.slice(0, 5).map((r) => `${r.ku_name} (${r.id})`).join(" · ") || null);

    // 6) scenár narazil na strop profilu → zoznam je odrezaný, nie úplný
    const strop = await q<{ kod_ku: string; purpose: string; n: number }>(
      `SELECT kod_ku, purpose, COUNT(*) AS n FROM landsearch_results
       GROUP BY kod_ku, purpose HAVING n >= 25 ORDER BY n DESC`).catch(() => []);
    // Narazenie na NASTAVENÝ strop je očakávané správanie, nie protirečenie — nikdy to teda nie je
    // „rozpor", najviac upozornenie. Inak by karta svietila načerveno trvalo a podkopala by dôveru
    // v tie kontroly, ktoré naozaj niečo našli.
    out.push({
      key: "strop_profilu", title: "Scenár narazil na strop počtu výsledkov", n: strop.length,
      detail: "Push posiela najviac 25–40 celkov na profil. Kde sa strop dosiahol, zoznam je odrezaný podľa skóre — nie je to chyba, ale nie je to ani všetko, čo v k.ú. je. Ak chceš úplný zoznam, treba zdvihnúť cap v profile.",
      sample: strop.slice(0, 4).map((r) => `${r.kod_ku}/${r.purpose}: ${r.n}`).join(" · ") || null,
      level: strop.length > 0 ? "warn" : "ok",
    });

    // 6b) alerting beží, ale nemá čo kontrolovať — cron hlási `checked=0` do logu, ktorý nikto
    // nečíta, takže nečinnosť bola neviditeľná. Mechanizmus je v poriadku; chýba zapnutý alert.
    const ss = await one<{ vsetky: number; s_alertom: number }>(
      "SELECT COUNT(*) AS vsetky, COALESCE(SUM(alert = 1), 0) AS s_alertom FROM saved_search");
    const vs = ss?.vsetky ?? 0, sa = ss?.s_alertom ?? 0;
    out.push({
      key: "alerting_necinny", title: "Upozorňovanie na uložené hľadania je nečinné",
      n: vs === 0 ? 1 : (sa === 0 ? vs : 0),
      detail: vs === 0
        ? "Nie je uložené žiadne hľadanie, takže denný cron nemá čo kontrolovať — v logu hlási checked=0. Ulož si hľadanie v Prieskume a zapni mu alert."
        : sa === 0
          ? `Uložených hľadaní je ${vs}, ale ani jedno nemá zapnutý alert — cron teda beží naprázdno. Alert sa zapína pri uloženom hľadaní v Prieskume.`
          : `Upozorňovanie je aktívne na ${sa} z ${vs} uložených hľadaní.`,
      sample: null,
      level: vs === 0 || sa === 0 ? "warn" : "ok",
    });

    // 6c) duplicitné obecné zmeny — UNIQUE je na (obec,title,change,detected_at), takže keď monitor
    // nahlási tú istú zmenu znova s novým časom, prejde druhýkrát. Nech je to vidno.
    const dup = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (SELECT obec, title, change FROM obec_changes
                                  GROUP BY obec, title, change HAVING COUNT(*) > 1)`);
    add("obec_duplikaty", "Tá istá obecná zmena je v zozname viackrát", dup?.n ?? 0,
        "UNIQUE drží (obec, názov, typ, čas detekcie). Ak monitor nahlási tú istú zmenu znova s iným časom, prejde druhýkrát a v prúde sa zopakuje.",
        null, 5);

    // 6d) k.ú. bez známej ÚP stránky — up_registry je to, z čoho appka hľadá územný plán pre k.ú.
    // Pokrytie tu bolo neviditeľné, takže nebolo ako zistiť, či register vôbec niečo obsahuje.
    const bezUpStranky = await q<{ ku_name: string; ku_code: string }>(
      `SELECT d.ku_name, d.ku_code FROM datasets d
       WHERE NOT EXISTS (SELECT 1 FROM up_registry r
                         WHERE (r.ku_code = d.ku_code OR r.ku_code = REPLACE(d.id, 'kn-', ''))
                           AND r.up_page_url IS NOT NULL AND TRIM(r.up_page_url) <> '')`).catch(() => []);
    add("bez_up_stranky", "k.ú. bez známej stránky územného plánu", bezUpStranky.length,
        "Z registra sa dohľadáva, kde obec zverejňuje územný plán. Bez záznamu sa preň nedá ísť automaticky. Plní `40_UP_GEOREF/up_registry_push.py` z ÚGKK gazetteera (nie z monitorového súboru — ten má nesprávne priradenia).",
        bezUpStranky.slice(0, 5).map((r) => r.ku_name).join(" · ") || null);

    // 7) LV bez jediného vlastníka
    const lvBez = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lvs l
       WHERE NOT EXISTS (SELECT 1 FROM lv_owners o WHERE o.dataset_id = l.dataset_id AND o.lv_no = l.lv_no)`);
    add("lv_bez_vlastnika", "List vlastníctva bez jediného vlastníka", lvBez?.n ?? 0,
        "Každé LV má mať vlastníka. Ak nemá, prepojenie sa pri importe nechytilo a výpis bude prázdny.", null, 10);

    // 8) parcely bez LV
    const pAll = await one<{ n: number }>("SELECT COUNT(*) AS n FROM parcels");
    const pBez = await one<{ n: number }>("SELECT COUNT(*) AS n FROM parcels WHERE lv_no IS NULL");
    const podiel = pAll?.n ? Math.round(100 * (pBez?.n ?? 0) / pAll.n) : 0;
    // Prah je na PODIELE, nie na počte — pri 300 000 parcelách je absolútne číslo neinterpretovateľné
    // a kontrola by svietila načerveno vždy.
    out.push({
      key: "parcely_bez_lv", title: "Parcely bez priradeného LV", n: pBez?.n ?? 0,
      detail: `Bez LV sa k parcele nedá dohľadať vlastník ani ťarchy — scenáre ju preskočia. Je to ${podiel} % všetkých parciel; časť je normálna (E-parcely a parcely bez zápisu), podozrivé je až to, keď podiel vyskočí.`,
      sample: `${(pBez?.n ?? 0).toLocaleString("sk-SK")} z ${(pAll?.n ?? 0).toLocaleString("sk-SK")}`,
      level: podiel >= 50 ? "fail" : podiel >= 30 ? "warn" : "ok",
    });

    return out;
  });

// ——— História zmien naprieč k.ú. (čo sa zmenilo od minule) ———
// `up_changes` (dokumenty ÚP) aj `change_log` (katastrálne polia) sa PLNILI, ale v appke sa dali
// vidieť len po jednom datasete — takže „čo je nové" sa nedalo zistiť bez preklikania 30 k.ú.
// Ranný brífing ukazuje len posledné 2 dni a len ÚP. Toto je spoločný prúd oboch zdrojov.
export type ChangeFeedRow = {
  src: string;              // 'up' = dokument územného plánu, 'kataster' = zmena v evidencii
  dataset_id: string | null; ku_name: string | null;
  label: string | null;     // názov dokumentu / entita+pole
  url: string | null;
  change_kind: string | null;   // new | changed | removed | added
  importance: string | null;
  lv_no: number | null; parcel_no: string | null;
  old_value: string | null; new_value: string | null;
  detected_at: string | null;
};
export const getChangeFeed = createServerFn({ method: "POST" })
  .validator(z.object({ days: z.number().min(1).max(365).optional(), src: z.string().optional() }).optional())
  .handler(async ({ data }): Promise<ChangeFeedRow[]> => {
    const d = data?.days ?? 30;
    const want = data?.src ?? "";
    const out: ChangeFeedRow[] = [];
    if (want === "" || want === "up") {
      const up = await q<ChangeFeedRow>(
        `SELECT 'up' AS src, c.dataset_id, ds.ku_name, c.title AS label, c.url, c.change AS change_kind,
                NULL AS importance, NULL AS lv_no, NULL AS parcel_no,
                NULL AS old_value, NULL AS new_value, c.detected_at
         FROM up_changes c LEFT JOIN datasets ds ON ds.id = c.dataset_id
         WHERE c.detected_at >= datetime('now', ?) ORDER BY c.detected_at DESC, c.id DESC LIMIT 200`,
        [`-${d} days`]).catch(() => []);
      out.push(...up);
    }
    if (want === "" || want === "obec") {
      const ob = await q<ChangeFeedRow>(
        `SELECT 'obec' AS src, NULL AS dataset_id, obec AS ku_name, title AS label, url,
                change AS change_kind, relevance AS importance, NULL AS lv_no, NULL AS parcel_no,
                NULL AS old_value, NULL AS new_value, detected_at
         FROM obec_changes
         WHERE detected_at >= datetime('now', ?)
         ORDER BY (relevance <> 'ine') DESC, detected_at DESC, id DESC LIMIT 200`,
        [`-${d} days`]).catch(() => []);
      out.push(...ob);
    }
    if (want !== "up" && want !== "obec") {
      const kn = await q<ChangeFeedRow>(
        `SELECT 'kataster' AS src, c.dataset_id, ds.ku_name,
                (c.entity || CASE WHEN c.field IS NULL THEN '' ELSE ' · ' || c.field END) AS label,
                NULL AS url, c.change_type AS change_kind, c.importance, c.lv_no, c.parcel_no,
                c.old_value, c.new_value, c.detected_at
         FROM change_log c LEFT JOIN datasets ds ON ds.id = c.dataset_id
         WHERE c.detected_at >= datetime('now', ?) ORDER BY c.detected_at DESC, c.id DESC LIMIT 200`,
        [`-${d} days`]).catch(() => []);
      out.push(...kn);
    }
    out.sort((a, b) => String(b.detected_at ?? "").localeCompare(String(a.detected_at ?? "")));
    return out.slice(0, 300);
  });

// ——— Na čom AVM stojí: stav avm_index per okres (podklad pre kalibráciu) ———
// Doteraz bola „kalibrácia" panel ~20 ručne nastaviteľných koeficientov a používateľ NEVIDEL, či
// odhad stojí na realizovaných cenách alebo len na inzerátoch. `avm_index.basis` to vie, len to
// nebolo nikde zobrazené. Bez tohto čísla sa koeficienty ladia naslepo.
export type AvmIndexRow = {
  okres: string; ppm2_stavebny: number | null; n_asking: number | null;
  ppm2_realized: number | null; n_realized: number | null; basis: string | null; updated: string | null;
};
export const getAvmIndex = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<AvmIndexRow[]> =>
    await q<AvmIndexRow>(
      `SELECT okres, ppm2_stavebny, n_asking, ppm2_realized, n_realized, basis, updated
       FROM avm_index ORDER BY (basis='realized') DESC, n_realized DESC, okres`).catch(() => []));

export type AvmEstimate = { okres: string | null; category: string; ppm2AsIs: number; valueAsIs: number | null; ppm2Stavebny: number | null; valuePotential: number | null; marginPct: number | null; basis: string; nComps: number };
// Odhad hodnoty parcely: ako-je (podľa druhu) vs potenciál (ak stavebné) → dev margin.
export const getParcelAvm = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string().optional(), druh: z.string().optional(), areaM2: z.number(), buildable: z.boolean().optional() }))
  .handler(async ({ data }): Promise<AvmEstimate> => {
    const cat = avmCategory(data.druh);
    const row = data.okres ? (await q<{ ppm2_stavebny: number; basis: string; n_asking: number; n_realized: number }>("SELECT ppm2_stavebny, basis, n_asking, n_realized FROM avm_index WHERE okres = ?", [data.okres]))[0] : undefined;
    const ppm2Stavebny = row?.ppm2_stavebny ?? null;
    const ppm2AsIs = cat === "stavebny" ? (ppm2Stavebny ?? AVM_DEFAULT.stavebny) : AVM_DEFAULT[cat];
    const area = data.areaM2 || 0;
    const valueAsIs = area > 0 ? Math.round(ppm2AsIs * area) : null;
    // potenciál = ak je (alebo môže byť) stavebné → stavebný €/m²
    const potPpm2 = ppm2Stavebny ?? AVM_DEFAULT.stavebny;
    const valuePotential = (data.buildable && area > 0 && cat !== "stavebny") ? Math.round(potPpm2 * area) : null;
    const marginPct = valuePotential && valueAsIs ? Math.round((valuePotential - valueAsIs) / valuePotential * 100) : null;
    return { okres: data.okres ?? null, category: cat, ppm2AsIs, valueAsIs, ppm2Stavebny, valuePotential, marginPct, basis: row?.basis ?? "default", nComps: (row?.n_realized ?? 0) + (row?.n_asking ?? 0) };
  });

export type LvParcelAvm = { asIs: number | null; potential: number | null; margin: number | null; category: string };
// AVM per parcela pre LV výpis: ako-je (podľa druhu) vs potenciál (ako stavebné) + margin. Kľúč = "parcel_no|register".
export const getLvAvm = createServerFn({ method: "POST" })
  .validator(z.object({ kodKu: z.string(), parcels: z.array(z.object({ key: z.string(), druh: z.string().nullable().optional(), areaM2: z.number().nullable().optional() })) }))
  .handler(async ({ data }): Promise<Record<string, LvParcelAvm>> => {
    const okres = (await q<{ okres: string }>("SELECT TRIM(REPLACE(SUBSTR(region,1,INSTR(region || ' · ', ' · ')-1),'okres ','')) okres FROM datasets WHERE ku_code = ? LIMIT 1", [data.kodKu]))[0]?.okres;
    const stav = okres ? (await q<{ p: number }>("SELECT ppm2_stavebny p FROM avm_index WHERE okres = ?", [okres]))[0]?.p ?? null : null;
    const stavPpm2 = stav ?? AVM_DEFAULT.stavebny;
    const out: Record<string, LvParcelAvm> = {};
    for (const p of data.parcels) {
      const area = p.areaM2 ?? 0;
      const cat = avmCategory(p.druh);
      const asIsPpm2 = cat === "stavebny" ? stavPpm2 : AVM_DEFAULT[cat];
      const potential = area > 0 ? Math.round(stavPpm2 * area) : null;
      const asIs = area > 0 ? Math.round(asIsPpm2 * area) : null;
      const margin = potential && asIs && cat !== "stavebny" ? Math.round((potential - asIs) / potential * 100) : null;
      out[p.key] = { asIs, potential, margin, category: cat };
    }
    return out;
  });

// Ingest datasetu k.ú. (parcely/LV/vlastníci/BPEJ) cez secret — pre auto-publish z 41_IMPORT pipeline.
// Chunkovaný: prvý call reset=true (DELETE staré + upsert datasets), ďalšie appendujú. Owner PII masking rieši server pri čítaní.
export const ingestDataset = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(), kodKu: z.string(), reset: z.boolean().optional(),
    resetTitles: z.boolean().optional(),
    dataset: z.object({ kuName: z.string().optional(), region: z.string().optional(), knType: z.string().optional(), nParcels: z.number().optional(), nOwners: z.number().optional(), sumArea: z.number().optional() }).optional(),
    parcels: z.array(z.object({ parcelNo: z.string(), knType: z.string().optional(), areaM2: z.number().nullable().optional(), useType: z.string().nullable().optional(), lvNo: z.string().nullable().optional(), centroidLat: z.number().nullable().optional(), centroidLng: z.number().nullable().optional(), geometryJson: z.string().nullable().optional(), bpej: z.string().nullable().optional(), bpejSkupina: z.number().nullable().optional() })).optional(),
    lvs: z.array(z.object({ lvNo: z.string(), coOwners: z.number().nullable().optional(), note: z.string().nullable().optional() })).optional(),
    owners: z.array(z.object({ lvNo: z.string(), name: z.string().nullable().optional(), share: z.string().nullable().optional(), isCompany: z.number().nullable().optional(), birthDate: z.string().nullable().optional(), title: z.string().nullable().optional(), bornName: z.string().nullable().optional(), ico: z.string().nullable().optional(), addrObec: z.string().nullable().optional(), addrCislo: z.string().nullable().optional(), addrPsc: z.string().nullable().optional() })).optional(),
    bpej: z.array(z.object({ code: z.string(), skupina: z.number().nullable().optional(), geometryJson: z.string().nullable().optional() })).optional(),
    signals: z.array(z.object({ lvNo: z.string(), coOwners: z.number().nullable().optional(), hasSpf: z.number().nullable().optional(), dedic: z.number().nullable().optional(), buildable: z.number().nullable().optional(), cleanTitle: z.number().nullable().optional(), absenterRatio: z.number().nullable().optional(), totalArea: z.number().nullable().optional() })).optional(),
    titles: z.array(z.object({ lvNo: z.string(), kind: z.string(), txt: z.string() })).optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string; parcels?: number; owners?: number }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "DB nedostupná" };
    const expected = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'"))[0]?.value;
    if (!secretEq(data.secret, expected)) return { ok: false, message: "Neplatný secret" };
    const did = `kn-${data.kodKu}`;
    // Cielené premazanie LEN titulov/tiarch — lv_titles nemá unique kľúč, takže opakovaný push bez
    // neho duplikuje riadky. `reset` sa na to použiť nedá, ten zmaže aj parcely, vlastníkov a signály.
    if (data.resetTitles) {
      await DB.prepare("DELETE FROM lv_titles WHERE dataset_id=?").bind(did).run();
    }
    if (data.reset) {
      await DB.batch([
        DB.prepare("DELETE FROM parcels WHERE dataset_id=?").bind(did),
        DB.prepare("DELETE FROM lvs WHERE dataset_id=?").bind(did),
        DB.prepare("DELETE FROM lv_owners WHERE dataset_id=?").bind(did),
        DB.prepare("DELETE FROM bpej_zones WHERE dataset_id=?").bind(did),
        DB.prepare("DELETE FROM lv_signals WHERE dataset_id=?").bind(did),
        DB.prepare("DELETE FROM lv_titles WHERE dataset_id=?").bind(did),
      ]);
    }
    // Upsert hlavičky datasetu BOL vnútri `if (reset)`, takže opraviť len metadáta (názov, okres)
    // sa nedalo bez zmazania parciel, LV, vlastníkov, signálov a titulov. Pritom práve okres bol
    // u 4 datasetov nesprávny (Žilina/Ružomberok mali „okres Čadca", viď _region v dataset pushi),
    // a podľa okresu appka vyberá trhovú cenu pre AVM. Preto sa upsert robí vždy, keď príde
    // `dataset` blok, a počty sa pri vynechaní ZACHOVAJÚ (COALESCE) — metadátová oprava nesmie
    // vynulovať to, čo už v riadku je.
    if (data.dataset) {
      const d = data.dataset;
      // Dva kroky zámerne: `ku_name` aj `region` sú NOT NULL, takže nový riadok potrebuje záložné
      // hodnoty — ale metadátová oprava existujúceho riadku nesmie prepísať to, čo neposlala.
      // ON CONFLICT by to nerozlíšilo (excluded by už obsahovalo zálohu), preto INSERT OR IGNORE
      // na založenie a potom UPDATE s COALESCE na to, čo volajúci naozaj dodal.
      await DB.prepare("INSERT OR IGNORE INTO datasets (id,ku_code,ku_name,region,kn_type,status,geometry_coverage,canonical_confidence,import_version,updated_at,note,n_parcels,n_owners,sum_area_m2) VALUES (?,?,?,?,?,?,?,?,?,date('now'),?,?,?,?)")
        .bind(did, data.kodKu, d.kuName ?? data.kodKu, d.region ?? `k.ú. ${data.kodKu}`, d.knType ?? "C-KN",
              "ready_with_warnings", 100, 0.85, "import_auto", `Auto import ${data.kodKu} (41_IMPORT).`,
              d.nParcels ?? null, d.nOwners ?? null, d.sumArea ?? null).run();
      await DB.prepare("UPDATE datasets SET ku_name=COALESCE(?,ku_name), region=COALESCE(?,region), kn_type=COALESCE(?,kn_type), n_parcels=COALESCE(?,n_parcels), n_owners=COALESCE(?,n_owners), sum_area_m2=COALESCE(?,sum_area_m2), updated_at=date('now') WHERE id=?")
        .bind(d.kuName ?? null, d.region ?? null, d.knType ?? null,
              d.nParcels ?? null, d.nOwners ?? null, d.sumArea ?? null, did).run();
    }
    try {
      const slug = (s: string) => s.replace(/\//g, "-");
      const toInt = (v: unknown): number | null => { if (v == null || v === "") return null; const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : null; };
      const stmts: ReturnType<typeof DB.prepare>[] = [];
      // parcels: id je TEXT PK; area_m2 INTEGER NOT NULL DEFAULT 0; lv_no INTEGER (nullable)
      for (const p of data.parcels ?? []) stmts.push(DB.prepare("INSERT OR REPLACE INTO parcels (id,dataset_id,parcel_no,kn_type,area_m2,use_type,lv_no,geometry_quality,centroid_lat,centroid_lng,geometry_json,bpej,bpej_skupina) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${did}-${slug(p.parcelNo)}`, did, p.parcelNo, p.knType ?? "C-KN", Math.round(p.areaM2 ?? 0), p.useType ?? null, toInt(p.lvNo), "derived", p.centroidLat ?? null, p.centroidLng ?? null, p.geometryJson ?? null, p.bpej ?? null, p.bpejSkupina ?? null));
      // lvs/lv_owners/bpej_zones: id je INTEGER AUTOINCREMENT → VYNECHAŤ; lv_no INTEGER NOT NULL
      for (const l of data.lvs ?? []) { const lv = toInt(l.lvNo); if (lv == null) continue; stmts.push(DB.prepare("INSERT INTO lvs (dataset_id,lv_no,co_owners,note) VALUES (?,?,?,?)").bind(did, lv, l.coOwners ?? 0, l.note ?? null)); }
      // GDPR: vlastník vymazaný na žiadosť (čl. 17) sa pri reimporte NEVRÁTI (suppression kind='erased_owner').
      const erased = new Set((await q<{ key: string }>("SELECT key FROM suppression WHERE kind='erased_owner' AND key LIKE ?", [`${did}:%`]).catch(() => [])).map((r) => r.key));
      for (const o of data.owners ?? []) { const lv = toInt(o.lvNo); if (lv == null) continue; if (erased.has(erasedKey(did, lv, o.name ?? "?"))) continue; stmts.push(DB.prepare("INSERT INTO lv_owners (dataset_id,lv_no,name,share,is_company,birth_date,title,born_name,ico,addr_obec,addr_cislo,addr_psc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(did, lv, o.name ?? "?", o.share ?? null, o.isCompany ?? 0, o.birthDate ?? null, o.title ?? null, o.bornName ?? null, o.ico ?? null, o.addrObec ?? null, o.addrCislo ?? null, o.addrPsc ?? null)); }
      for (const b of data.bpej ?? []) { if (!b.geometryJson) continue; stmts.push(DB.prepare("INSERT INTO bpej_zones (dataset_id,code,skupina,geometry_json) VALUES (?,?,?,?)").bind(did, b.code, b.skupina ?? null, b.geometryJson)); }
      // lv_signals: PK(dataset_id,lv_no); trigger dopočíta signal_score. lv_titles: id AUTOINCREMENT (vynechať), kind+txt NOT NULL
      for (const s of data.signals ?? []) { const lv = toInt(s.lvNo); if (lv == null) continue; stmts.push(DB.prepare("INSERT OR REPLACE INTO lv_signals (dataset_id,lv_no,co_owners,has_spf,dedic,buildable,clean_title,absenter_ratio,total_area) VALUES (?,?,?,?,?,?,?,?,?)").bind(did, lv, s.coOwners ?? null, s.hasSpf ?? null, s.dedic ?? null, s.buildable ?? null, s.cleanTitle ?? null, s.absenterRatio ?? null, s.totalArea ?? null)); }
      for (const t of data.titles ?? []) { const lv = toInt(t.lvNo); if (lv == null) continue; stmts.push(DB.prepare("INSERT INTO lv_titles (dataset_id,lv_no,kind,txt) VALUES (?,?,?,?)").bind(did, lv, t.kind || "titul", t.txt || "—")); }
      for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
      return { ok: true, parcels: (data.parcels ?? []).length, owners: (data.owners ?? []).length };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "ingest error" };
    }
  });

// Kompletný market ingest cez secret (pre GitHub Actions curl) — index+opps+listing chunky+pricehistory z verejného URL.
// Auth: x-alert-secret === D1 market_meta.alert_secret. Zvnútra volá role-guarded fns ako 'admin' (secret už overil).
// Stepový ingest trhových dát — každý krok je samostatný HTTP request, aby žiaden neprekročil
// limit Workera (~1000 subrequestov). Monolitný beh (data + 14 chunkov listings + pricehistory +
// AVM v jednom requeste = ~1300 subreq) ho prekračoval → `curl` v GitHub Action padal → D1 ostal
// zastaraný, hoci origin bol svieži. Teraz to cloud workflow poženie po krokoch (ako /ceny z prehliadača):
//   {step:"data"}                 → index + opportunities + meta; vráti chunks/phChunks
//   {step:"listings", chunk:i}    → jeden market-listings-<i>.json
//   {step:"pricehistory", chunk:i}→ jeden market-pricehistory-<i>.json
//   {step:"compute"}              → prepočet AVM (z inzerátov) + obecné mediány
// Bez `step` (staré volanie `{}`) = "data" — ostane spätne kompatibilné (krok nepadne, D1 dostane
// aspoň index+opps+meta), kým sa workflow zaktualizuje na plnú sekvenciu.
type MarketStepResult = { ok: boolean; step?: string; chunk?: number; message?: string;
  index?: number; opps?: number; listings?: number; ph?: number; chunks?: number; phChunks?: number;
  generated?: string; avm?: number; obm?: number };
export const ingestMarketAll = createServerFn({ method: "POST" })
  .validator(z.object({ secret: z.string(), step: z.enum(["data", "listings", "pricehistory", "compute"]).optional(), chunk: z.number().int().min(0).optional(),
    // ref = commit SHA, ktorý cloud práve publikoval. Súbory sa čítajú z neho, nie z „main" — raw GitHub
    // drží „main" pár minút vo vyrovnávacej pamäti a pri opakovanom pokuse by vrátil starší stav.
    ref: z.string().regex(/^[0-9a-f]{7,40}$/).optional() }))
  .handler(async ({ data }): Promise<MarketStepResult> => {
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "DB nedostupná" };
    const expected = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'"))[0]?.value;
    if (!secretEq(data.secret, expected)) return { ok: false, message: "Neplatný secret" };
    const src0 = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='source_url'"))[0]?.value;
    if (!src0) return { ok: false, message: "Chýba source_url v market_meta" };
    const src = data.ref ? src0.replace("/main/", `/${data.ref}/`) : src0;
    const adminRole = "admin" as Role;
    const ps = data.secret;
    const step = data.step ?? "data";
    if (step === "data") {
      const r = await refreshMarketData({ data: { role: adminRole, pipelineSecret: ps, ...(data.ref ? { url: src, persist: false } : {}) } });
      return { ok: r.ok, step, message: r.message, index: r.index, opps: r.opps, chunks: r.chunks, phChunks: r.phChunks, generated: r.generated };
    }
    if (step === "listings") {
      const i = data.chunk ?? 0;
      const u = src.replace("market-data.json", `market-listings-${i}.json`);
      const r = await refreshMarketListings({ data: { url: u, role: adminRole, pipelineSecret: ps } });
      return { ok: r.ok, step, chunk: i, listings: r.count, message: r.message };
    }
    if (step === "pricehistory") {
      const i = data.chunk ?? 0;
      const u = src.replace("market-data.json", `market-pricehistory-${i}.json`);
      const r = await refreshMarketPriceHistory({ data: { url: u, role: adminRole, pipelineSecret: ps } });
      return { ok: r.ok, step, chunk: i, ph: r.count, message: r.message };
    }
    // step === "compute" — AVM sa počíta z inzerátov, preto AŽ po ingeste listings
    const avm = await computeAvmIndex().catch(() => 0);
    const obm = await computeObecMarket().catch(() => 0);
    return { ok: true, step: "compute", avm, obm };
  });

export type PricePoint = { day: string; price_eur: number | null; ppm2: number | null };
export const getListingPriceHistory = createServerFn({ method: "POST" })
  .validator(z.object({ source: z.string(), ext_id: z.string() }))
  .handler(async ({ data }): Promise<PricePoint[]> => {
    return await q<PricePoint>("SELECT day, price_eur, ppm2 FROM market_price_history WHERE source = ? AND ext_id = ? ORDER BY day", [data.source, data.ext_id]);
  });

export type MarketListing = {
  source: string | null; ext_id: string | null; url: string | null; title: string | null; ptype: string | null; deal: string | null;
  obec: string | null; okres: string | null; psc: string | null; lat: number | null; lng: number | null; area_m2: number | null; price_eur: number | null; ppm2: number | null;
  first_seen: string | null; last_seen: string | null; flags: string | null;
};
const ML_COLS = "source,ext_id,url,title,ptype,deal,obec,okres,psc,lat,lng,area_m2,price_eur,ppm2,first_seen,last_seen,flags";

export const getMarketListings = createServerFn({ method: "POST" })
  .validator(z.object({ obec: z.string().optional(), ptype: z.string().optional(), deal: z.string().optional(), priceMax: z.number().optional(), ppm2Max: z.number().optional(), onlyOpps: z.boolean().optional(), removed: z.boolean().optional(), limit: z.number().optional(), offset: z.number().optional() }))
  .handler(async ({ data }): Promise<{ rows: MarketListing[]; total: number }> => {
    const where: string[] = ["(price_eur IS NULL OR price_eur <= " + PRICE_MAX + ")"]; const args: unknown[] = [];
    if (data.obec) { where.push("(obec LIKE ? OR okres LIKE ?)"); args.push(`%${data.obec}%`, `%${data.obec}%`); }
    if (data.ptype) { where.push("ptype = ?"); args.push(data.ptype); }
    if (data.deal) { where.push("deal = ?"); args.push(data.deal); }
    if (data.priceMax) { where.push("price_eur <= ?"); args.push(data.priceMax); }
    if (data.ppm2Max) { where.push("ppm2 <= ?"); args.push(data.ppm2Max); }
    if (data.onlyOpps) where.push("flags IS NOT NULL AND flags <> ''");
    const lastFull = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='last_full'"))[0]?.value;
    if (lastFull) { if (data.removed) { where.push("last_seen < ?"); args.push(lastFull); } else { where.push("last_seen >= ?"); args.push(lastFull); } }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = (await q<{ n: number }>(`SELECT COUNT(*) AS n FROM market_listings ${w}`, args))[0]?.n ?? 0;
    const rows = await q<MarketListing>(`SELECT ${ML_COLS} FROM market_listings ${w} ORDER BY last_seen DESC, price_eur DESC LIMIT ? OFFSET ?`, [...args, data.limit ?? 50, data.offset ?? 0]);
    return { rows, total };
  });

// Inzeráty v okolí parcely (piny na mape) — bounding box podľa lat/lng.
export const getMarketListingsNear = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().optional() }))
  .handler(async ({ data }): Promise<MarketListing[]> => {
    const r = data.radiusKm ?? 8;
    const dLat = r / 111, dLng = r / (111 * Math.cos(data.lat * Math.PI / 180) || 1);
    return await q<MarketListing>(
      `SELECT ${ML_COLS} FROM market_listings WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND (price_eur IS NULL OR price_eur <= ${PRICE_MAX}) ORDER BY last_seen DESC LIMIT 60`,
      [data.lat - dLat, data.lat + dLat, data.lng - dLng, data.lng + dLng]);
  });

type MarketOverviewRow = { okres: string; ptype: string; deal: string; median_eur_m2: number; cnt: number };
export const getMarketStats = createServerFn({ method: "GET" }).handler(async (): Promise<{ meta: Record<string, string>; latest: string | null; overview: MarketOverviewRow[] }> => {
  const meta = await q<{ key: string; value: string }>("SELECT key,value FROM market_meta");
  const latest = (await q<{ d: string }>("SELECT MAX(day) AS d FROM market_index"))[0]?.d ?? null;
  const overview = latest ? await q<{ okres: string; ptype: string; deal: string; median_eur_m2: number; cnt: number }>(
    "SELECT okres,ptype,deal,median_eur_m2,cnt FROM market_index WHERE day=? AND obec IS NULL ORDER BY cnt DESC LIMIT 800", [latest]) : [];
  return { meta: Object.fromEntries(meta.map((m) => [m.key, m.value])) as Record<string, string>, latest, overview };
});

// ——— Cenové poklesy (motivovaný predajca) — primárny deal signál, cache 6 h (D1-safe) ———
export type PriceDrop = { ptype: string; first_price: number; price_eur: number; drop_pct: number; obec: string | null; okres: string | null; url: string | null; title: string | null; first_seen: string | null; last_seen: string | null };
export const getPriceDrops = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, minDrop: z.number().optional(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ drops: PriceDrop[]; cached?: boolean; ageDays?: number }> => {
    const okresy = ["Čadca", "Kysucké Nové Mesto", "Žilina"];
    const minDrop = Math.max(1, Math.min(90, data.minDrop ?? 8));
    const key = `pricedrops:${minDrop}`;
    const cached = await regCacheRead(key, !!data.refresh, 6 * 3600);
    if (cached) return { drops: cached.payload as PriceDrop[], cached: true, ageDays: cached.ageDays };
    const ph = okresy.map(() => "?").join(",");
    let drops: PriceDrop[] = [];
    try {
      drops = await q<PriceDrop>(
        `SELECT ptype, first_price, price_eur, ROUND((first_price-price_eur)*100.0/first_price,1) AS drop_pct,
                obec, okres, url, title, first_seen, last_seen
         FROM market_listings
         WHERE okres IN (${ph}) AND (deal='predaj' OR deal IS NULL)
           AND first_price IS NOT NULL AND price_eur IS NOT NULL AND first_price > price_eur AND first_price > 0
           AND (first_price - price_eur) * 100.0 / first_price >= ?
         ORDER BY drop_pct DESC LIMIT 200`, [...okresy, minDrop]);
    } catch { drops = []; }
    await regCacheWrite(key, "pricedrops", drops);
    return { drops };
  });

// ——— Stavebné pozemky (podľa názvu) — akvizičná inteligencia pre development; comps stavebné-vs-stavebné, cache 6 h ———
export type BuildingDeal = { obec: string | null; okres: string | null; area_m2: number | null; price_eur: number | null; ppm2: number | null; below_pct: number | null; drop_pct: number | null; url: string | null; title: string | null };
export const getBuildingLand = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ deals: BuildingDeal[]; medians: Record<string, number>; cached?: boolean; ageDays?: number }> => {
    const key = "buildingland:v1";
    const cached = await regCacheRead(key, !!data.refresh, 6 * 3600);
    if (cached) { const p = cached.payload as { deals: BuildingDeal[]; medians: Record<string, number> }; return { ...p, cached: true, ageDays: cached.ageDays }; }
    type Row = { obec: string | null; okres: string | null; area_m2: number | null; price_eur: number | null; ppm2: number | null; first_price: number | null; url: string | null; title: string | null };
    let rows: Row[] = [];
    try {
      rows = await q<Row>(
        `SELECT obec, okres, area_m2, price_eur, ppm2, first_price, url, title
         FROM market_listings
         WHERE okres IN ('Čadca','Kysucké Nové Mesto','Žilina') AND ptype='pozemok' AND (deal='predaj' OR deal IS NULL)
           AND ppm2 IS NOT NULL AND ppm2 > 0 AND price_eur >= 2000
           AND (lower(title) LIKE '%stavebn%' OR lower(title) LIKE '%ibv%' OR lower(title) LIKE '%na výstavbu%' OR lower(title) LIKE '%intravil%' OR lower(title) LIKE '%pre rd%')
           AND lower(title) NOT LIKE '%les%' AND lower(title) NOT LIKE '%orn%pôd%' AND lower(title) NOT LIKE '%poľnohosp%'
         LIMIT 500`);
    } catch { rows = []; }
    const band = (a: number | null) => (!a ? 0 : a < 1000 ? 0 : a < 3000 ? 1 : 2);
    const buckets = new Map<string, number[]>();
    for (const r of rows) { const k = `${r.okres}|${band(r.area_m2)}`; const arr = buckets.get(k) ?? []; arr.push(r.ppm2 as number); buckets.set(k, arr); }
    const med = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const medByBucket = new Map<string, number>();
    for (const [k, v] of buckets) { if (v.length >= 5) { const m = med(v); if (m) medByBucket.set(k, m); } }
    const medians: Record<string, number> = {};
    for (const ok of ["Čadca", "Kysucké Nové Mesto", "Žilina"]) { const all = rows.filter((r) => r.okres === ok).map((r) => r.ppm2 as number); const m = med(all); if (m) medians[ok] = Math.round(m); }
    const deals: BuildingDeal[] = rows.map((r) => {
      const m = medByBucket.get(`${r.okres}|${band(r.area_m2)}`) ?? (r.okres ? medians[r.okres] : null);
      const below = m && r.ppm2 ? Math.round((m - (r.ppm2 as number)) / m * 100) : null;
      const drop = r.first_price && r.price_eur && r.first_price > r.price_eur ? Math.round((r.first_price - r.price_eur) / r.first_price * 100) : null;
      return { obec: r.obec, okres: r.okres, area_m2: r.area_m2, price_eur: r.price_eur, ppm2: r.ppm2, below_pct: below, drop_pct: drop, url: r.url, title: r.title };
    }).sort((a, b) => (b.below_pct ?? -999) - (a.below_pct ?? -999)).slice(0, 120);
    await regCacheWrite(key, "buildingland", { deals, medians });
    return { deals, medians };
  });

// Rozdeľovník Kraj → Okres → Lokalita: medián €/m² na 3 úrovniach z market_listings.
// Medián počítaný cez window-funkcie; per-typ ppm2 clamp vylúči mis-parse (€/m² vs celková cena).
export type MarketTreeRow = { grain: "kraj" | "okres" | "obec"; kraj: string; okres: string | null; obec: string | null; ptype: string; median_eur_m2: number; cnt: number };
export const getMarketTree = createServerFn({ method: "POST" })
  .validator(z.object({ deal: z.string().optional(), activeOnly: z.boolean().optional(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<MarketTreeRow[]> => {
    const deal = data.deal ?? "predaj";
    // Cache 6 h — inak sken ~40k market_listings pri každom načítaní /ceny (D1 read-limit).
    const cacheKey = `markettree:${deal}:${data.activeOnly !== false ? 1 : 0}`;
    const treeCached = await regCacheRead(cacheKey, !!data.refresh, 6 * 3600);
    if (treeCached) return treeCached.payload as MarketTreeRow[];
    const lastFull = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='last_full'"))[0]?.value;
    const activeClause = (data.activeOnly !== false && lastFull) ? "AND ml.last_seen >= ?" : "";
    const args: unknown[] = [deal];
    if (activeClause) args.push(lastFull);
    const sql = `
      WITH base AS (
        SELECT COALESCE(NULLIF(k.kraj,''),'(neurčené)') AS kraj,
               COALESCE(NULLIF(ml.okres,''),'(neurčené)') AS okres,
               COALESCE(NULLIF(ml.obec,''),'(neurčené)')  AS obec,
               ml.ptype AS ptype, ml.ppm2 AS ppm2
        FROM market_listings ml
        LEFT JOIN okres_kraj k ON k.okres = ml.okres
        WHERE ml.deal = ? AND ml.ppm2 IS NOT NULL ${activeClause}
          AND ( (ml.ptype='pozemok' AND ml.ppm2 BETWEEN 0.5 AND 1500)
             OR (ml.ptype='byt'     AND ml.ppm2 BETWEEN 150 AND 15000)
             OR (ml.ptype='dom'     AND ml.ppm2 BETWEEN 80 AND 15000)
             OR (ml.ptype='chata'   AND ml.ppm2 BETWEEN 20 AND 8000)
             OR (ml.ptype NOT IN ('pozemok','byt','dom','chata') AND ml.ppm2 BETWEEN 1 AND 15000) )
      ),
      ro AS (SELECT kraj,okres,obec,ptype,ppm2, ROW_NUMBER() OVER (PARTITION BY kraj,okres,obec,ptype ORDER BY ppm2) rn, COUNT(*) OVER (PARTITION BY kraj,okres,obec,ptype) c FROM base),
      rk AS (SELECT kraj,okres,ptype,ppm2,      ROW_NUMBER() OVER (PARTITION BY kraj,okres,ptype ORDER BY ppm2) rn,     COUNT(*) OVER (PARTITION BY kraj,okres,ptype) c FROM base),
      rj AS (SELECT kraj,ptype,ppm2,            ROW_NUMBER() OVER (PARTITION BY kraj,ptype ORDER BY ppm2) rn,           COUNT(*) OVER (PARTITION BY kraj,ptype) c FROM base)
      SELECT 'obec' AS grain, kraj, okres, obec, ptype, ROUND(AVG(ppm2)) AS median_eur_m2, MAX(c) AS cnt FROM ro WHERE rn IN ((c+1)/2,(c+2)/2) GROUP BY kraj,okres,obec,ptype
      UNION ALL
      SELECT 'okres' AS grain, kraj, okres, NULL AS obec, ptype, ROUND(AVG(ppm2)) AS median_eur_m2, MAX(c) AS cnt FROM rk WHERE rn IN ((c+1)/2,(c+2)/2) GROUP BY kraj,okres,ptype
      UNION ALL
      SELECT 'kraj' AS grain, kraj, NULL AS okres, NULL AS obec, ptype, ROUND(AVG(ppm2)) AS median_eur_m2, MAX(c) AS cnt FROM rj WHERE rn IN ((c+1)/2,(c+2)/2) GROUP BY kraj,ptype`;
    const treeRows = await q<MarketTreeRow>(sql, args);
    await regCacheWrite(cacheKey, "markettree", treeRows);
    return treeRows;
  });

export const getMarketSeries = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string(), ptype: z.string(), deal: z.string() }))
  .handler(async ({ data }) => {
    return await q<{ day: string; median_eur_m2: number; cnt: number }>(
      "SELECT day,median_eur_m2,cnt FROM market_index WHERE okres=? AND ptype=? AND deal=? AND obec IS NULL ORDER BY day", [data.okres, data.ptype, data.deal]);
  });

// ——— Trhová história: pohyb cien v čase podľa podmienok (market_index denne) + najväčšie cenové pohyby inzerátov ———
export type PriceTrendPoint = { day: string; median_eur_m2: number; p25: number | null; p75: number | null; cnt: number };
export type PriceMover = { source: string | null; ext_id: string | null; title: string | null; url: string | null; obec: string | null; area_m2: number | null; first_price: number | null; price_eur: number | null; ppm2: number | null; last_seen: string | null; drop_pct: number };
export const getMarketHistory = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string().optional(), obec: z.string().optional(), ptype: z.string(), deal: z.string().optional() }))
  .handler(async ({ data }): Promise<{ series: PriceTrendPoint[]; movers: PriceMover[]; deal: string; ptype: string }> => {
    const deal = data.deal ?? "predaj";
    const w: string[] = ["ptype = ?", "deal = ?"]; const a: unknown[] = [data.ptype, deal];
    if (data.obec) { w.push("obec = ?"); a.push(data.obec); }
    else if (data.okres) { w.push("okres = ?", "obec IS NULL"); a.push(data.okres); }
    else { w.push("okres IS NULL", "obec IS NULL"); }
    const series = await q<PriceTrendPoint>(
      `SELECT day, median_eur_m2, p25, p75, cnt FROM market_index WHERE ${w.join(" AND ")} ORDER BY day`, a);
    // najväčšie pohyby cien (pôvodná → aktuálna) pre podmienky — z market_listings (first_price vs price_eur)
    const lw: string[] = ["ptype = ?", "first_price IS NOT NULL", "price_eur IS NOT NULL", "first_price <> price_eur", `price_eur <= ${PRICE_MAX}`]; const la: unknown[] = [data.ptype];
    if (data.obec) { lw.push("obec = ?"); la.push(data.obec); } else if (data.okres) { lw.push("okres = ?"); la.push(data.okres); }
    const rows = await q<Omit<PriceMover, "drop_pct">>(
      `SELECT source, ext_id, title, url, obec, area_m2, first_price, price_eur, ppm2, last_seen FROM market_listings WHERE ${lw.join(" AND ")} ORDER BY ABS(price_eur - first_price) DESC LIMIT 40`, la);
    const movers: PriceMover[] = rows.map((r) => ({ ...r, drop_pct: r.first_price && r.price_eur ? Math.round((1 - r.price_eur / r.first_price) * 100) : 0 }));
    return { series, movers, deal, ptype: data.ptype };
  });

export type MarketOpp = {
  source: string | null; url: string | null; title: string | null; ptype: string | null; deal: string | null;
  okres: string | null; obec: string | null; area_m2: number | null; price_eur: number | null; price_per_m2: number | null;
  days_on_market: number | null; price_drop_pct: number | null; below_market_pct: number | null; flags: string | null;
};
export const getMarketOpportunities = createServerFn({ method: "POST" })
  .validator(z.object({ flag: z.string().optional(), okres: z.string().optional() }))
  .handler(async ({ data }): Promise<MarketOpp[]> => {
    const where: string[] = []; const args: unknown[] = [];
    if (data.flag) { where.push("flags LIKE ?"); args.push(`%${data.flag}%`); }
    if (data.okres) { where.push("okres=?"); args.push(data.okres); }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    return await q<MarketOpp>(
      `SELECT source,url,title,ptype,deal,okres,obec,area_m2,price_eur,price_per_m2,days_on_market,price_drop_pct,below_market_pct,flags FROM market_opportunities ${w} ORDER BY (COALESCE(below_market_pct,0)+COALESCE(price_drop_pct,0)) DESC LIMIT 100`, args);
  });

// ——— Deal radar: kombinovaný ranking najlepších príležitostí naprieč SR (LV signály + trhové pod cenou) ———
export type RadarLv = { dataset_id: string; ku_name: string; lv_no: number; score: number; reasons: string[]; co_owners: number; total_area: number; has_spf: number; okres: string | null; avm_eur: number | null };
// ——— Národné geokódovanie (ZBGIS-style našepkávač miest/adries) — Nominatim SK ———
export type GeoPlace = { label: string; lat: number; lng: number; kind: string };
// Nominatim vracia `type` po anglicky („village", „administrative") a našepkávač ho zobrazoval surový.
const OSM_KIND_SK: Record<string, string> = {
  city: "mesto", town: "mesto", village: "obec", hamlet: "osada", suburb: "časť mesta",
  neighbourhood: "časť obce", quarter: "časť mesta", locality: "lokalita", isolated_dwelling: "samota",
  administrative: "územná jednotka", municipality: "obec", county: "okres", state: "kraj",
  house: "dom", residential: "zástavba", building: "budova", road: "cesta", street: "ulica",
  peak: "vrch", water: "vodná plocha", forest: "les", farmland: "pole", place_of_worship: "kostol",
};
export const geocodePlace = createServerFn({ method: "POST" })
  .validator(z.object({ q: z.string().min(2) }))
  .handler(async ({ data }): Promise<GeoPlace[]> => {
    const osmKindSk = (k: string) => OSM_KIND_SK[k] ?? (k ? k.replace(/_/g, " ") : "miesto");
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=sk&limit=6&q=${encodeURIComponent(data.q.trim())}`;
    const arr = asArr(await fetchJsonTimed(url, 6000).catch(() => []));
    const out: GeoPlace[] = [];
    for (const x0 of arr) {
      const x = asObj(x0); if (!x) continue;
      const lat = Number(x.lat), lng = Number(x.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const dn = String(x.display_name ?? "");
      out.push({ label: dn.split(",").slice(0, 3).join(",").trim() || dn.slice(0, 60), lat, lng, kind: osmKindSk(String(x.type ?? x.category ?? "")) });
    }
    return out;
  });

export type ReportParcel = {
  parcel_no: string; kn_type: string | null; area_m2: number | null; use_type: string | null;
  lv_no: number | null; celok: number | null; settled: number | null; ekn_ref: string | null;
  bpej: string | null; bpej_skupina: number | null; odnatie_eur: number | null;
  centroid_lat: number | null; centroid_lng: number | null;
  geometry_quality: GeometryQuality | null; geometry_json: string | null;
  placement: string | null;      // „v zastavanom území obce" — rozhoduje o proxy zóne, keď ÚP chýba
};
export const getParcelByNo = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), parcelNo: z.string() }))
  .handler(async ({ data }): Promise<ReportParcel | null> => {
    const r = await q<ReportParcel>(
      // placement žije v lv_parcels (nie v parcels) a dossier ho nemal → proxy zóna padala vždy
      // na „PP = poľnohospodárska, nezastavateľné", takže development potenciál hlásil 0 m²
      // a 0 € GDV aj pre zastavané pozemky v obci. Ak sa riadok nenájde, zostane null ako dosiaľ.
      `SELECT p.parcel_no,p.kn_type,p.area_m2,p.use_type,p.lv_no,p.celok,p.settled,p.ekn_ref,p.bpej,
              p.bpej_skupina,p.odnatie_eur,p.centroid_lat,p.centroid_lng,p.geometry_quality,
              p.geometry_json,
              (SELECT lp.placement FROM lv_parcels lp
                WHERE lp.dataset_id = p.dataset_id AND lp.parcel_no = p.parcel_no
                  AND lp.placement IS NOT NULL LIMIT 1) AS placement
         FROM parcels p WHERE p.dataset_id=? AND p.parcel_no=? LIMIT 1`,
      [data.datasetId, data.parcelNo]);
    return r[0] ?? null;
  });

// Druh pozemku z textu (use_type) → kód druhu + kód umiestnenia (pre computeAvm). Orientačné.
function inferDruhCodes(use: string | null | undefined): { druhCode: number | null; umCode: number | null } {
  const u = (use ?? "").toLowerCase();
  if (/zastav|nádvor|nadvor/.test(u)) return { druhCode: 9, umCode: 1 };
  if (/lesn|les\b/.test(u)) return { druhCode: 7, umCode: null };
  if (/vodn|vodná/.test(u)) return { druhCode: 8, umCode: null };
  if (/záhrad|zahrad/.test(u)) return { druhCode: 4, umCode: null };
  if (/ovoc/.test(u)) return { druhCode: 5, umCode: null };
  if (/vinic/.test(u)) return { druhCode: 3, umCode: null };
  if (/chmeľ|chmel/.test(u)) return { druhCode: 2, umCode: null };
  if (/orná|orna/.test(u)) return { druhCode: 1, umCode: null };
  if (/trávny|travny|ttp|trvalý trávn|trvaly travn/.test(u)) return { druhCode: 6, umCode: null };
  if (/ostatná|ostatna/.test(u)) return { druhCode: 10, umCode: null };
  return { druhCode: null, umCode: null };
}

// Analytická nadstavba LV — agreguje AVM naprieč C-KN parcelami LV (súčet odhadov) + reprezentatívna
// parcela (najväčšia s centroidom) pre limity/ÚP/dostupnosť (tie doťahuje UI klientsky, ako /report).
export type LvIntel = {
  okres: string | null;
  repr: { parcel_no: string; lat: number; lng: number; area_m2: number; use_type: string | null } | null;
  avm: {
    total_estimate_eur: number | null; total_low_eur: number | null; total_high_eur: number | null;
    valued: number; total_parcels: number; capped: boolean;
    ppm2_repr: number | null; klass_repr: string; confidence: AvmResult["confidence"] | "—"; factors: string[];
  };
};
// Zdieľaný agregátor AVM pre LV — súčet odhadov naprieč C-KN parcelami + reprezentatívna parcela.
async function lvAvmAggregate(datasetId: string, lvNo: number): Promise<{
  okres: string | null; total: number | null; low: number | null; high: number | null;
  valued: number; total_parcels: number; capped: boolean; repr: LvIntel["repr"]; reprAvm: AvmResult | null;
}> {
  const ds = (await q<{ region: string | null; ku_name: string | null }>("SELECT region, ku_name FROM datasets WHERE id=?", [datasetId]))[0] ?? null;
  const okres = okresFromRegion(ds?.region ?? null);
  const obec = ds?.ku_name ? ds.ku_name.replace(/^k\.ú\.\s*/i, "").trim() : null;
  const calib = await getCalibMap(); // Fáza 5: kalibrované sadzby (raz na LV, nie per parcelu)
  const parcels = await q<{ parcel_no: string; area_m2: number | null; use_type: string | null; bpej_skupina: number | null; settled: number | null; lat: number | null; lng: number | null }>(
    "SELECT parcel_no, area_m2, use_type, bpej_skupina, settled, centroid_lat AS lat, centroid_lng AS lng FROM parcels WHERE dataset_id=? AND lv_no=? AND (kn_type IS NULL OR kn_type NOT LIKE 'E%') ORDER BY area_m2 DESC",
    [datasetId, lvNo]);
  const withGeo = parcels.filter((p) => p.lat != null && p.lng != null && (p.area_m2 ?? 0) > 0);
  const CAP = 25; // strop pre počet computeAvm volaní (D1/CPU budget)
  let tot = 0, lo = 0, hi = 0, valued = 0;
  let repr: LvIntel["repr"] = null; let reprAvm: AvmResult | null = null;
  for (const p of withGeo.slice(0, CAP)) {
    const { druhCode, umCode } = inferDruhCodes(p.use_type);
    let a: AvmResult;
    try { a = await computeAvm(p.lat as number, p.lng as number, p.area_m2, druhCode, umCode, p.bpej_skupina, p.settled, okres, obec, calib); }
    catch { continue; }
    if (a.estimate_eur != null) { tot += a.estimate_eur; lo += a.low_eur ?? a.estimate_eur; hi += a.high_eur ?? a.estimate_eur; valued++; }
    if (!repr) { repr = { parcel_no: p.parcel_no, lat: p.lat as number, lng: p.lng as number, area_m2: p.area_m2 ?? 0, use_type: p.use_type }; reprAvm = a; }
  }
  return { okres, total: valued ? Math.round(tot) : null, low: valued ? Math.round(lo) : null, high: valued ? Math.round(hi) : null, valued, total_parcels: parcels.length, capped: withGeo.length > CAP, repr, reprAvm };
}

export const getLvIntel = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number() }))
  .handler(async ({ data }): Promise<LvIntel> => {
    const g = await lvAvmAggregate(data.datasetId, data.lvNo);
    return {
      okres: g.okres, repr: g.repr,
      avm: {
        total_estimate_eur: g.total, total_low_eur: g.low, total_high_eur: g.high,
        valued: g.valued, total_parcels: g.total_parcels, capped: g.capped,
        ppm2_repr: g.reprAvm?.ppm2 ?? null, klass_repr: g.reprAvm?.klass ?? "—",
        confidence: g.reprAvm?.confidence ?? "—", factors: g.reprAvm?.factors ?? [],
      },
    };
  });

// ——— Vysporiadanie & odkup podielov (Fáza 1b) — kurátorovaný § postup zo znalostnej bázy. ORIENTAČNÉ. ———
type LegalGuide = { nazov: string; zakony: string[]; postup: string[]; upozornenie: string };
const LEGAL_GUIDE: Record<string, LegalGuide> = {
  roep: { nazov: "Nesúlad C-KN / E-KN (obnova evidencie)", zakony: ["zákon č. 180/1995 Z.z. (ROEP)", "katastrálny zákon č. 162/1995 Z.z.", "vyhláška č. 461/2009 Z.z."],
    postup: ["Zistiť stav: parcela v registri E-KN (pôvodná evidencia), geometricky nezosúladená s C-KN.", "Objednať geometrický plán u autorizovaného geodeta — identifikácia E parciel na C-KN.", "Ak prebieha ROEP v k.ú.: uplatniť vlastníctvo v konaní (§ 8 zák. 180/1995).", "Zápis do katastra: návrh na zápis s geometrickým plánom a listinami.", "Pri duplicite vlastníctva riešiť určenie vlastníka (dohoda alebo súd)."],
    upozornenie: "E-KN parcely nemajú vždy zákres v C-KN; presná poloha až geometrickým plánom." },
  dedic: { nazov: "Nedokončené / dodatočné dedičské konanie", zakony: ["Občiansky zákonník § 460 a nasl. (dedenie)", "CMP č. 161/2015 Z.z. § 211 (dodatočné konanie)"],
    postup: ["Overiť, či bol majetok prejednaný v pôvodnom dedičskom konaní (LV vs osvedčenie o dedičstve).", "Ak sa objavil neprejednaný majetok: podnet na dodatočné dedičské konanie (§ 211 CMP).", "Notár (súdny komisár) zistí okruh dedičov (aj ďalšie generácie).", "Dedičia sa dohodnú / súd rozhodne → osvedčenie o dedičstve.", "Zápis nových vlastníkov do katastra (záznam)."],
    upozornenie: "Pri mŕtvych dedičoch sa okruh rozvetvuje. Owner intel pomáha identifikovať dedičov." },
  podiel: { nazov: "Zrušenie a vyporiadanie podielového spoluvlastníctva", zakony: ["Občiansky zákonník § 139–142", "§ 140 (predkupné právo spoluvlastníkov)", "§ 141 (dohoda)", "§ 142 (súdne vyporiadanie)"],
    postup: ["Zmapovať spoluvlastníkov a ich podiely (časť B).", "Ponuka odkúpenia — REŠPEKTOVAŤ predkupné právo (§ 140): najprv ostatným spoluvlastníkom.", "Dohoda o zrušení a vyporiadaní (§ 141) — písomná, so všetkými; vklad do katastra.", "Ak dohoda nie je možná: návrh na súd (§ 142).", "Reálne rozdelenie len ak je pozemok deliteľný (geometrický plán)."],
    upozornenie: "Porušenie predkupného práva (§ 140) → relatívna neplatnosť prevodu." },
  absent: { nazov: "Neznámi / absentní vlastníci", zakony: ["zákon č. 180/1995 Z.z. § 16 (SPF spravuje pozemky neznámych)", "CMP (opatrovník neznámemu vlastníkovi)"],
    postup: ["Overiť, či je vlastník naozaj neznámy, alebo len má neaktuálnu adresu.", "Pozemky neznámych spravuje SPF (§ 16) — možný nájom/odkup cez SPF.", "Pri známom vlastníkovi s neznámym pobytom: verejná vyhláška / opatrovník súdom.", "Kúpna cena pri neznámom vlastníkovi → notárska úschova.", "Owner intel (RPO/OR/RPVS) + terénne overenie."],
    upozornenie: "Absentér z adresy je len signál — over skutočné bydlisko." },
  spf: { nazov: "Podiel SPF / štátu", zakony: ["zákon č. 180/1995 Z.z.", "zákon č. 504/2003 Z.z. (nájom poľnohosp. pozemkov)"],
    postup: ["Identifikovať podiel SPF/štátu na LV.", "Žiadosť na SPF o nájom alebo odkup podielu.", "SPF posudzuje podľa zákonných podmienok.", "Nájomná / kúpna zmluva + vklad do katastra."],
    upozornenie: "Prevody SPF podliehajú zákonným obmedzeniam; nie každý podiel je voľne predajný." },
  tarcha: { nazov: "Ťarchy / nečistý právny stav", zakony: ["katastrálny zákon č. 162/1995 Z.z.", "Občiansky zákonník (záložné § 151a+, vecné bremená § 151n+)"],
    postup: ["Zistiť druh ťarchy (časť C): záložné právo, vecné bremeno, predkupné, exekúcia, nájom.", "Záložné právo: súhlas/kvitancia veriteľa → výmaz.", "Vecné bremeno: dohoda o zrušení / zánik podľa obsahu.", "Exekúcia: riešiť s exekútorom.", "Po vyriešení: návrh na výmaz z katastra."],
    upozornenie: "Bez výmazu ťarchy je prevod rizikový; niektoré vecné bremená prechádzajú na nadobúdateľa." },
};
function shareToFrac(share: string | null | undefined): number | null {
  if (!share) return null;
  const m = String(share).match(/(\d+)\s*\/\s*(\d+)/);
  if (m) { const b = Number(m[2]); return b ? Number(m[1]) / b : null; }
  const n = Number(String(share).replace(",", "."));
  return Number.isFinite(n) && n <= 1.0001 ? n : null;
}
const STATE_OWNER_RE = /pozemkov\w*\s*fond|\bSPF\b|slovensk[áa]\s+republika|štátny\s+podnik|lesy\s+(sr|slovensk)/i;

export type LvSettlement = {
  access: "full" | "summary" | "denied";
  avm_eur: number | null;
  issues: Array<{ type: string; severity: "low" | "med" | "high"; note: string; legal_refs: string[] }>;
  difficulty: "low" | "med" | "high"; potential_score: number; steps: string[];
  guides: Record<string, LegalGuide>;
  owners: Array<{ name: string; share_str: string | null; frac: number | null; is_state: boolean; is_company: boolean; est_eur: number | null; small: boolean; suppressed: boolean }>;
  private_share: number; private_total: number; spf_share: number;
  scenarios: { majority: number | null; qualified: number | null; full: number | null };
  disclaimer: string;
};
export const getLvSettlement = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<LvSettlement> => {
    // rola zo session, nie od klienta (viď roleFromToken) — `data.role` sa IGNORUJE
    const access = ownerAccess(await roleFromToken(data.token));
    const disclaimer = "Orientačné, nie právna rada — over s notárom/advokátom. § kurátorované zo znalostnej bázy.";
    const s = (await q<{ co_owners: number; has_spf: number; dedic: number; clean_title: number; absenter_ratio: number }>(
      "SELECT co_owners, has_spf, dedic, clean_title, absenter_ratio FROM lv_signals WHERE dataset_id=? AND lv_no=? LIMIT 1",
      [data.datasetId, data.lvNo]))[0] ?? { co_owners: 0, has_spf: 0, dedic: 0, clean_title: 1, absenter_ratio: 0 };
    const ekn = (await q<{ n: number }>("SELECT COUNT(*) n FROM parcels WHERE dataset_id=? AND lv_no=? AND (kn_type LIKE 'E%' OR ekn_ref IS NOT NULL)", [data.datasetId, data.lvNo]))[0]?.n ?? 0;
    const issues: LvSettlement["issues"] = [];
    const add = (type: string, sev: "low" | "med" | "high", note: string) => issues.push({ type, severity: sev, note, legal_refs: LEGAL_GUIDE[type]?.zakony ?? [] });
    if (ekn > 0) add("roep", "med", `Parcely registra E na LV (${ekn}) — nesúlad C-KN/E-KN, možná obnova evidencie.`);
    if (s.dedic) add("dedic", "high", "Nedokončené dedičské pomery — (dodatočné) dedičské konanie.");
    if ((s.co_owners ?? 0) >= 5) add("podiel", "high", `Podielové spoluvlastníctvo (${s.co_owners} vlastníkov) — fragmentácia.`);
    if ((s.absenter_ratio ?? 0) >= 0.3) add("absent", "med", `Absentní/neznámi vlastníci (~${Math.round((s.absenter_ratio ?? 0) * (s.co_owners || 1))}).`);
    if (s.has_spf) add("spf", "low", "Podiel SPF/štátu — odkup/nájom cez SPF.");
    if (s.clean_title === 0) add("tarcha", "med", "Ťarchy / nečistý právny stav — výmaz pred prevodom.");
    const hiN = issues.filter((i) => i.severity === "high").length;
    const difficulty: LvSettlement["difficulty"] = hiN >= 2 ? "high" : (hiN === 1 || issues.length >= 3) ? "med" : "low";
    const potential_score = Math.round(100 * (0.35 * Math.min((s.co_owners ?? 0) / 20, 1) + 0.25 * (s.dedic ?? 0) + 0.20 * (s.absenter_ratio ?? 0) + 0.10 * (s.has_spf ?? 0) + 0.10 * (ekn > 0 ? 1 : 0)));
    const steps: string[] = [];
    const guides: Record<string, LegalGuide> = {};
    for (const it of issues) { const g = LEGAL_GUIDE[it.type]; if (g) { guides[it.type] = g; if (g.postup[1] ?? g.postup[0]) steps.push(`${g.nazov}: ${g.postup[1] ?? g.postup[0]}`); } }

    let owners: LvSettlement["owners"] = []; let privShare = 0, privTotal = 0, spfShare = 0;
    let scenarios = { majority: null as number | null, qualified: null as number | null, full: null as number | null };
    let avm_eur: number | null = null;
    if (access === "full") {
      avm_eur = (await lvAvmAggregate(data.datasetId, data.lvNo)).total;
      const rows = await q<{ name: string; share: string | null; is_company: number; ico: string | null }>(
        "SELECT name, share, is_company, ico FROM lv_owners WHERE dataset_id=? AND lv_no=? ORDER BY is_company DESC, name", [data.datasetId, data.lvNo]);
      const SMALL = 0.05, DISCOUNT = 0.70;
      const supSet = await suppressedNameSet();
      owners = rows.map((o) => {
        const frac = shareToFrac(o.share);
        const state = STATE_OWNER_RE.test(o.name || "");
        let est: number | null = null;
        if (avm_eur != null && frac != null) { est = avm_eur * frac; if (frac < SMALL) est *= DISCOUNT; est = Math.round(est); }
        if (frac != null) { if (state) spfShare += frac; else { privShare += frac; if (est) privTotal += est; } }
        return { name: o.name, share_str: o.share, frac, is_state: state, is_company: !!o.is_company, est_eur: est, small: frac != null && frac > 0 && frac < SMALL, suppressed: supSet.has(normName(o.name)) };
      });
      const scen = (tgt: number) => avm_eur != null ? Math.round(avm_eur * Math.min(tgt, privShare)) : null;
      scenarios = { majority: scen(0.5), qualified: scen(0.667), full: scen(1.0) };
    }
    return {
      access, avm_eur, issues, difficulty, potential_score, steps, guides,
      owners, private_share: Math.round(privShare * 1000) / 1000, private_total: Math.round(privTotal), spf_share: Math.round(spfShare * 1000) / 1000,
      scenarios, disclaimer,
    };
  });

export const getDealRadar = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string().optional(), minScore: z.number().optional(), limit: z.number().optional() }))
  .handler(async ({ data }): Promise<{ lv: RadarLv[]; market: MarketOpp[] }> => {
    const limit = data.limit ?? 40;
    const minScore = data.minScore ?? 0;
    // LV číta top-N cez predpočítané signal_score (index, migrácia 0051) — ~40 riadkov/load namiesto skenu 8000.
    const lvRows = await q<NlHit & { region: string | null; signal_score: number }>(
      `SELECT sig.dataset_id, d.ku_name, d.region, sig.lv_no, sig.co_owners, sig.has_spf, sig.dedic, sig.buildable, sig.clean_title, sig.absenter_ratio, sig.total_area, sig.oldest_birth_year, sig.signal_score
       FROM lv_signals sig JOIN datasets d ON d.id = sig.dataset_id
       WHERE sig.signal_score >= ? ${data.okres ? "AND d.region LIKE ?" : ""}
       ORDER BY sig.signal_score DESC LIMIT ?`,
      data.okres ? [minScore, `%${data.okres}%`, limit] : [minScore, limit]);
    // okresný stavebný medián €/m² (pozemok) pre orientačný € potenciál LV
    const medRows = await q<{ okres: string | null; med: number | null }>(
      `SELECT okres, AVG(median_eur_m2) med FROM market_index WHERE ptype='pozemok' AND deal='predaj' AND okres IS NOT NULL GROUP BY okres`, []);
    const medByOkres = new Map<string, number>();
    for (const r of medRows) if (r.okres && r.med) medByOkres.set(r.okres, r.med);
    const medAll = medByOkres.size ? [...medByOkres.values()].reduce((a, b) => a + b, 0) / medByOkres.size : 30;
    const lv = lvRows.map((r) => {
      const okres = okresFromRegion(r.region ?? null);
      const med = (okres && medByOkres.get(okres)) || medAll;
      // buildable → stavebný medián; inak poľnohosp. sadzba (~5 % z medianu, cap 3 €/m²)
      const ppm2 = r.buildable ? med : Math.min(med * 0.05, 3);
      const avm_eur = (r.total_area ?? 0) > 0 && ppm2 > 0 ? Math.round((r.total_area ?? 0) * ppm2) : null;
      const reasons: string[] = [];
      if ((r.co_owners ?? 0) >= 5) reasons.push(`${r.co_owners} spoluvlastníkov`);
      if (r.has_spf) reasons.push("SPF / štát");
      if (r.dedic) reasons.push(`dedičské${r.oldest_birth_year ? ` (${r.oldest_birth_year})` : ""}`);
      if (r.buildable) reasons.push("stavebný potenciál");
      if ((r.absenter_ratio ?? 0) > 0) reasons.push(`absentéri ${Math.round((r.absenter_ratio ?? 0) * 100)} %`);
      if (r.clean_title) reasons.push("bez tiarch");
      return { dataset_id: r.dataset_id, ku_name: r.ku_name, lv_no: r.lv_no, score: Math.round(r.signal_score ?? 0), reasons, co_owners: r.co_owners ?? 0, total_area: r.total_area ?? 0, has_spf: r.has_spf ?? 0, okres, avm_eur };
    });
    // Trhové príležitosti čítame z predpočítanej market_opportunities (LACNÉ na čítanie — D1 free tier).
    // Sanity filter proti mis-parsovaným inzerátom (1 €/0.8 €/m²/−99 %): below≤70, ppm2≥2, cenové floory.
    // Čistotu ZDROJA rieši scraper (build_market_data má rovnaké sanity prahy) → po re-importe je tabuľka čistá.
    const mw: string[] = ["(below_market_pct IS NOT NULL OR price_drop_pct IS NOT NULL)"]; const ma: unknown[] = [];
    mw.push("(below_market_pct IS NULL OR below_market_pct <= 70)");
    mw.push("(price_drop_pct IS NULL OR price_drop_pct <= 90)");
    mw.push("(price_per_m2 IS NULL OR price_per_m2 >= 2)");
    mw.push("((ptype IN ('dom','byt','chata','chalupa') AND price_eur >= 15000) OR (ptype NOT IN ('dom','byt','chata','chalupa') AND price_eur >= 2000))");
    if (data.okres) { mw.push("okres = ?"); ma.push(data.okres); }
    const market = await q<MarketOpp>(
      `SELECT source,url,title,ptype,deal,okres,obec,area_m2,price_eur,price_per_m2,days_on_market,price_drop_pct,below_market_pct,flags FROM market_opportunities WHERE ${mw.join(" AND ")} GROUP BY url ORDER BY (COALESCE(below_market_pct,0)+COALESCE(price_drop_pct,0)) DESC LIMIT ?`, [...ma, limit]);
    return { lv, market };
  });

// ——— „DOBRÉ RÁNO" denný brífing — jedna karta: dnes dôležité + scorovaná SÚKROMNÁ inzercia (koho zavolať)
//     + naše ÚP-development príležitosti, nastaviteľné podľa lokality (okres) a typu (ptype). ———
export type MorningListing = MarketOpp & { score: number; step: string; privatny: boolean; belowAvm: number | null };
export type MorningUp = { kod_ku: string; ku_name: string | null; quality: number | null; area_m2: number | null; parcels: string | null; zone: string | null; ppf: number | null; market_ppm2: number | null; avmPpm2: number | null; avmBasis: string | null; avmPotential: number | null; avmAsIs: number | null; avmMargin: number | null };
// Zmiznuté z trhu (re-verify 301 = vymazané): zachovaný snapshot; posledná cena ≈ odhad predajnej ceny.
export type MorningGone = { url: string | null; title: string | null; ptype: string | null; okres: string | null; obec: string | null; area_m2: number | null; price_eur: number | null; first_price: number | null; days_listed: number | null; removed_at: string | null; drop_pct: number | null; privatny: boolean };
// Parser free-text promptu „hľadám chatu do 30k v Kysuciach s výhľadom" → typ + okres + max cena + kľúčové slová.
const _MORNING_KW = ["výhľad", "vyhlad", "les", "rieka", "potok", "jazero", "slneč", "slnec", "rovinat", "ticho", "záhrad", "zahrad", "sieť", "siet", "voda", "elektri", "prístup", "pristup", "juh", "svah"];
function parseMorningPrompt(s: string, okresy: string[]): { ptype?: string; okres?: string; maxPrice?: number; keywords: string[] } {
  const t = (s || "").toLowerCase();
  const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let ptype: string | undefined;
  const kwExtra: string[] = [];
  // chata/chalupa je teraz samostatný ptype (scraper aj D1 preklasifikované).
  if (/chat|chalup|zrub|drevenic/.test(t)) ptype = "chata";
  else if (/\bbyt/.test(t)) ptype = "byt";
  else if (/\bdom\b|rodinn/.test(t)) ptype = "dom";
  else if (/pozem|parcel|stavebn/.test(t)) ptype = "pozemok";
  let maxPrice: number | undefined;
  const pm = t.match(/(?:do|max|pod|za)\s*([\d][\d\s]{1,9})\s*(k\b|tis|000|eur|€)?/);
  if (pm) { let n = parseInt(pm[1].replace(/\s/g, ""), 10); const u = pm[2] || ""; if (/k\b|tis/.test(u) || n < 1000) n *= 1000; if (n >= 1000) maxPrice = n; }
  let okres: string | undefined;
  const nt = norm(t);
  if (/kysuc/.test(nt)) okres = "Čadca";                       // región Kysuce → okres Čadca
  if (!okres) for (const o of okresy) if (nt.includes(norm(o))) { okres = o; break; }
  const keywords = [...kwExtra, ..._MORNING_KW.filter((k) => t.includes(k))];
  return { ptype, okres, maxPrice, keywords };
}
export const getMorningBriefing = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string().optional(), ptype: z.string().optional(), onlyPrivate: z.boolean().optional(), limit: z.number().optional(), prompt: z.string().optional() }))
  .handler(async ({ data }): Promise<{
    today: string | null; summary: { newToday: number; drops: number; upDeals: number; privateOpps: number };
    listings: MorningListing[]; gone: MorningGone[]; up: MorningUp[]; okresy: string[]; ptypes: string[];
    parsed: { ptype: string | null; okres: string | null; maxPrice: number | null; keywords: string[] };
  }> => {
    const limit = data.limit ?? 15;
    // len AKTÍVNE inzeráty (mŕtve/vymazané z hromadného 08-30 backfillu vypadnú); prah ~21 dní od posledného skenu
    const ACT = "last_seen >= date((SELECT MAX(last_seen) FROM market_listings), '-21 day')";
    const today = (await q<{ d: string }>("SELECT MAX(last_seen) d FROM market_listings").catch(() => []))[0]?.d ?? null;
    // dnes dôležité (súhrn) — z aktívnych listings
    const c1 = (await q<{ n: number }>(`SELECT COUNT(*) n FROM market_listings WHERE first_seen = ? AND ${ACT}`, [today]).catch(() => []))[0]?.n ?? 0;
    const c2 = (await q<{ n: number }>(`SELECT COUNT(*) n FROM market_listings WHERE first_price IS NOT NULL AND first_price > price_eur AND ${ACT}`).catch(() => []))[0]?.n ?? 0;
    const c3 = (await q<{ n: number }>("SELECT COUNT(*) n FROM landsearch_results WHERE verdict = 'MATCH'").catch(() => []))[0]?.n ?? 0;
    // súkromné príležitosti = aktívne bazos inzeráty s poklesom ceny (reálne „koho zavolať")
    const c4 = (await q<{ n: number }>(`SELECT COUNT(*) n FROM market_listings WHERE source='bazos' AND first_price IS NOT NULL AND first_price > price_eur AND ${ACT}`).catch(() => []))[0]?.n ?? 0;
    // číselníky pre filter (lokalita + typ) — z aktívnych inzerátov (obsahuje aj nový typ 'chata')
    const okresy = (await q<{ okres: string }>(`SELECT DISTINCT okres FROM market_listings WHERE okres IS NOT NULL AND ${ACT} ORDER BY okres`).catch(() => [])).map((r) => r.okres);
    const ptypes = (await q<{ ptype: string }>(`SELECT DISTINCT ptype FROM market_listings WHERE ptype IS NOT NULL AND ${ACT} ORDER BY ptype`).catch(() => [])).map((r) => r.ptype);
    // celé aktívne listings; skóre za behu (pokles z first_price, dni z first/last_seen, pod trhom cez obec medián)
    const parsed = parseMorningPrompt(data.prompt ?? "", okresy);
    const effOkres = data.okres || parsed.okres;
    const effPtype = data.ptype || parsed.ptype;
    const w: string[] = [ACT, "ls.removed_at IS NULL", "(ls.ppm2 IS NULL OR ls.ppm2 >= 2)",
      "((ls.ptype IN ('dom','byt') AND ls.price_eur >= 15000) OR (ls.ptype IN ('chata','chalupa') AND ls.price_eur >= 5000) OR (ls.ptype NOT IN ('dom','byt','chata','chalupa') AND ls.price_eur >= 2000))"];
    const a: unknown[] = [];
    if (data.onlyPrivate !== false) w.push("ls.source = 'bazos'");
    if (effOkres) { w.push("ls.okres = ?"); a.push(effOkres); }
    if (effPtype) { w.push("ls.ptype = ?"); a.push(effPtype); }
    if (parsed.maxPrice) { w.push("ls.price_eur <= ?"); a.push(parsed.maxPrice); }
    for (const kw of parsed.keywords) { w.push("lower(ls.title) LIKE ?"); a.push(`%${kw}%`); }
    const raw = await q<MarketOpp & { below_avm_pct: number | null }>(
      `SELECT ls.source, ls.url, ls.title, ls.ptype, ls.deal, ls.okres, ls.obec, ls.area_m2, ls.price_eur,
              ls.ppm2 AS price_per_m2,
              CAST(julianday(ls.last_seen) - julianday(ls.first_seen) AS INTEGER) AS days_on_market,
              CASE WHEN ls.first_price IS NOT NULL AND ls.first_price > ls.price_eur
                   THEN ROUND((ls.first_price - ls.price_eur) * 100.0 / ls.first_price, 1) END AS price_drop_pct,
              CASE WHEN ls.ppm2 IS NOT NULL AND om.median_ppm2 IS NOT NULL AND om.median_ppm2 > 0 AND ls.ppm2 < om.median_ppm2
                   THEN ROUND((om.median_ppm2 - ls.ppm2) * 100.0 / om.median_ppm2, 1) END AS below_market_pct,
              CASE WHEN ls.ptype = 'pozemok' AND lower(ls.title) LIKE '%stavebn%' AND ls.ppm2 >= 10 AND av.ppm2_stavebny IS NOT NULL AND av.ppm2_stavebny > 0 AND ls.ppm2 < av.ppm2_stavebny
                   THEN ROUND((av.ppm2_stavebny - ls.ppm2) * 100.0 / av.ppm2_stavebny, 1) END AS below_avm_pct,
              ls.flags
       FROM market_listings ls
       LEFT JOIN obec_market_median om ON om.obec = ls.obec
       LEFT JOIN avm_index av ON av.okres = ls.okres
       WHERE ${w.join(" AND ")}
       ORDER BY (COALESCE(below_market_pct, 0) * 0.6 + COALESCE(below_avm_pct, 0) * 0.5 + COALESCE(price_drop_pct, 0) * 0.9
                 + (CASE WHEN days_on_market > 120 THEN 18 WHEN days_on_market > 60 THEN 10 ELSE 0 END)) DESC
       LIMIT ?`, [...a, limit]).catch(() => [] as (MarketOpp & { below_avm_pct: number | null })[]);
    const listings: MorningListing[] = raw.map((l) => {
      const below = l.below_market_pct ?? 0, drop = l.price_drop_pct ?? 0, dom = l.days_on_market ?? 0, bavm = l.below_avm_pct ?? 0;
      const score = Math.round(Math.min(100, below * 0.6 + bavm * 0.5 + drop * 0.9 + (dom > 120 ? 18 : dom > 60 ? 10 : 0)));
      const step = drop > 0
        ? `Cena klesla o ${Math.round(drop)} % — zavolať predajcovi, priestor na vyjednávanie`
        : bavm >= 20 ? `~${Math.round(bavm)} % pod AVM (stavebné) — podcenený pozemok, osloviť`
        : dom > 90 ? `${dom} dní v ponuke — motivovaný predajca, osloviť`
        : below > 0 ? `~${Math.round(below)} % pod trhom v obci — preveriť a osloviť` : "Osloviť predajcu / preveriť inzerát";
      return { ...l, score, step, privatny: l.source === "bazos", belowAvm: l.below_avm_pct };
    });
    // naše ÚP-development príležitosti (genuine: bývanie/hromadné, MATCH) + obecný trhový kontext
    const upW: string[] = ["ls.verdict = 'MATCH'", "ls.purpose = 'residential'", "ls.zone IN ('bývanie/rekreácia','hromadné bývanie')"];
    const upA: unknown[] = [];
    if (effOkres) { upW.push("ds.region LIKE ?"); upA.push(`%${effOkres}%`); }
    const upRaw = await q<{ kod_ku: string; ku_name: string | null; quality: number | null; area_m2: number | null; parcels: string | null; zone: string | null; ppf: number | null; market_ppm2: number | null; avm_ppm2: number | null; avm_basis: string | null; druh: string | null }>(
      `SELECT ls.kod_ku, COALESCE(ds.ku_name, ls.ku_name) ku_name, ls.quality, ls.area_m2, ls.parcels, ls.zone, ls.ppf, om.median_ppm2 market_ppm2,
              av.ppm2_stavebny AS avm_ppm2, av.basis AS avm_basis, ls.druh
       FROM landsearch_results ls LEFT JOIN datasets ds ON ds.ku_code = ls.kod_ku
       LEFT JOIN obec_market_median om ON om.obec = TRIM(REPLACE(REPLACE(COALESCE(ds.ku_name, ls.ku_name), 'k.ú.', ''), 'k.ú', ''))
       LEFT JOIN avm_index av ON av.okres = TRIM(REPLACE(SUBSTR(ds.region, 1, INSTR(ds.region || ' · ', ' · ') - 1), 'okres ', ''))
       WHERE ${upW.join(" AND ")} ORDER BY ls.quality DESC LIMIT 8`, upA).catch(() => []);
    const up: MorningUp[] = upRaw.map((o) => {
      const area = o.area_m2 ?? 0;
      const stav = o.avm_ppm2 ?? AVM_DEFAULT.stavebny;                  // €/m² ako stavebné
      const cat = o.druh ? avmCategory(o.druh) : "polnohosp";           // reálny katastrálny druh (backfill), inak odhad
      const asIsPpm2 = cat === "stavebny" ? stav : AVM_DEFAULT[cat];
      const avmPotential = area > 0 ? Math.round(stav * area) : null;   // hodnota ak zastavateľné
      const avmAsIs = area > 0 ? Math.round(asIsPpm2 * area) : null;
      const avmMargin = avmPotential && avmAsIs ? Math.round((avmPotential - avmAsIs) / avmPotential * 100) : null;
      return { kod_ku: o.kod_ku, ku_name: o.ku_name, quality: o.quality, area_m2: o.area_m2, parcels: o.parcels, zone: o.zone, ppf: o.ppf, market_ppm2: o.market_ppm2, avmPpm2: o.avm_ppm2, avmBasis: o.avm_basis, avmPotential, avmAsIs, avmMargin };
    });
    // ——— zmizli z trhu (re-verify 301 = vymazané) — zachovaný snapshot, posledná cena ≈ odhad predajnej ———
    // len ČERSTVÉ transakcie: malý odstup last_seen→removed_at = spoľahlivá predajná cena (staré backlog-gone nezaťažia)
    const gW: string[] = ["removed_at IS NOT NULL", "removed_at >= date((SELECT MAX(removed_at) FROM market_listings), '-30 day')", "(julianday(removed_at) - julianday(last_seen)) <= 14"];
    const gA: unknown[] = [];
    if (data.onlyPrivate !== false) gW.push("source = 'bazos'");
    if (effOkres) { gW.push("okres = ?"); gA.push(effOkres); }
    if (effPtype) { gW.push("ptype = ?"); gA.push(effPtype); }
    const gone = (await q<MorningGone>(
      `SELECT url, title, ptype, okres, obec, area_m2, price_eur, first_price,
              CAST(julianday(removed_at) - julianday(first_seen) AS INTEGER) AS days_listed,
              removed_at,
              CASE WHEN first_price IS NOT NULL AND first_price > price_eur
                   THEN ROUND((first_price - price_eur) * 100.0 / first_price, 1) END AS drop_pct,
              (source = 'bazos') AS privatny
       FROM market_listings WHERE ${gW.join(" AND ")}
       ORDER BY removed_at DESC LIMIT ?`, [...gA, limit]).catch(() => [] as MorningGone[])).map((g) => ({ ...g, privatny: !!g.privatny }));
    return { today, summary: { newToday: c1, drops: c2, upDeals: c3, privateOpps: c4 }, listings, gone, up, okresy, ptypes,
      parsed: { ptype: effPtype ?? null, okres: effOkres ?? null, maxPrice: parsed.maxPrice ?? null, keywords: parsed.keywords } };
  });

// ——— OSM dostupnosť (doprava + občianska vybavenosť) cez Overpass API ———
type PoiHit = { name: string | null; dist: number; drive_min: number };
type Accessibility = { transport: Record<string, PoiHit | null>; amenities: Record<string, PoiHit | null>; infra: Record<string, PoiHit | null>; cached?: boolean; ageDays?: number };

// kategória → [(overpass filter, radius m)]; nájde najbližší prvok.
const OSM_CATS: { group: "transport" | "amenities" | "infra"; key: string; filters: string[]; radius: number }[] = [
  { group: "transport", key: "metro", filters: ['node["station"="subway"]', 'node["railway"="subway_entrance"]'], radius: 8000 },
  { group: "transport", key: "elektricka", filters: ['node["railway"="tram_stop"]'], radius: 5000 },
  { group: "transport", key: "vlak", filters: ['node["railway"="station"]["station"!="subway"]', 'node["railway"="halt"]'], radius: 12000 },
  { group: "transport", key: "autobus", filters: ['node["highway"="bus_stop"]'], radius: 3000 },
  { group: "amenities", key: "skola", filters: ['node["amenity"="school"]', 'way["amenity"="school"]'], radius: 5000 },
  { group: "amenities", key: "skolka", filters: ['node["amenity"="kindergarten"]', 'way["amenity"="kindergarten"]'], radius: 5000 },
  { group: "amenities", key: "lekaren", filters: ['node["amenity"="pharmacy"]'], radius: 5000 },
  { group: "amenities", key: "lekar", filters: ['node["amenity"="doctors"]', 'node["amenity"="clinic"]', 'node["amenity"="hospital"]', 'way["amenity"="hospital"]'], radius: 12000 },
  { group: "amenities", key: "obchod", filters: ['node["shop"="supermarket"]', 'node["shop"="convenience"]', 'way["shop"="supermarket"]'], radius: 5000 },
  { group: "amenities", key: "restauracia", filters: ['node["amenity"="restaurant"]'], radius: 4000 },
  { group: "amenities", key: "banka", filters: ['node["amenity"="bank"]', 'node["amenity"="atm"]'], radius: 5000 },
  { group: "amenities", key: "park", filters: ['node["leisure"="park"]', 'way["leisure"="park"]'], radius: 3000 },
  { group: "infra", key: "dialnica", filters: ['node["highway"="motorway_junction"]'], radius: 20000 },
];

function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function accessibilityCore(plat: number, plng: number, refresh?: boolean): Promise<Accessibility> {
    const key = `osm:${plat.toFixed(4)}:${plng.toFixed(4)}`;
    const cached = await regCacheRead(key, !!refresh, 30 * 24 * 3600);
    if (cached) return { ...(cached.payload as Accessibility), cached: true, ageDays: cached.ageDays };
    // jeden Overpass dopyt so všetkými kategóriami (around na centroid)
    const clauses = OSM_CATS.flatMap((c) => c.filters.map((f) => `${f}(around:${c.radius},${plat},${plng});`)).join("");
    const query = `[out:json][timeout:25];(${clauses});out center tags 400;`;
    const empty: Accessibility = { transport: {}, amenities: {}, infra: {} };
    // viac Overpass zrkadiel (fallback) — pre spoľahlivé pokrytie celého SR
    const MIRRORS = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];
    let elements: unknown[] = [];
    let gotResponse = false;
    for (const url of MIRRORS) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25000);
      try {
        const res = await fetch(url, {
          method: "POST", body: "data=" + encodeURIComponent(query),
          headers: { "content-type": "application/x-www-form-urlencoded" }, signal: ctrl.signal,
        });
        if (res.ok) {
          const j = asObj(JSON.parse(await res.text())) ?? {};
          elements = asArr(j.elements);
          gotResponse = true;
        }
      } catch { /* skús ďalšie zrkadlo */ } finally { clearTimeout(to); }
      if (gotResponse) break;
    }
    if (!gotResponse) return empty;
    const pois = elements.map((e0) => {
      const e = asObj(e0) ?? {};
      const c = asObj(e.center);
      const lat = typeof e.lat === "number" ? e.lat : c && typeof c.lat === "number" ? c.lat : null;
      const lng = typeof e.lon === "number" ? e.lon : c && typeof c.lon === "number" ? c.lon : null;
      const tags = asObj(e.tags) ?? {};
      return lat != null && lng != null ? { lat, lng, tags } : null;
    }).filter((p): p is { lat: number; lng: number; tags: Record<string, unknown> } => !!p);
    const matches = (tags: Record<string, unknown>, filters: string[]) =>
      filters.some((f) => { const m = f.match(/\["([^"]+)"="([^"]+)"\]/); return m ? String(tags[m[1]] ?? "") === m[2] : false; });
    const out: Accessibility = { transport: {}, amenities: {}, infra: {} };
    for (const cat of OSM_CATS) {
      let best: PoiHit | null = null;
      for (const p of pois) {
        if (!matches(p.tags, cat.filters)) continue;
        const d = haversine(plat, plng, p.lat, p.lng);
        if (!best || d < best.dist) best = { name: (asVal(p.tags.name) ?? null), dist: d, drive_min: Math.max(1, Math.round((d / 1000 / 45) * 60)) };
      }
      out[cat.group][cat.key] = best;
    }
    await regCacheWrite(key, "osm", out);
    return out;
}
export const getParcelAccessibility = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lng: z.number(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<Accessibility> => accessibilityCore(data.lat, data.lng, data.refresh));

// ——— Limity výstavby (úradné registre) — ArcGIS query s metrickým bufferom v ťažisku parcely ———
// Presné „do X m od prvku" (returnCountOnly). Zdroje overené dostupné; ostatné pribudnú (graceful „nedostupné").
export type LimitHit = { category: string; key: string; label: string; hit: boolean; count: number; buffer: number; attribution: string; error: boolean };
export type LimitsResult = { items: LimitHit[]; cached?: boolean; ageDays?: number };
const LIMIT_SOURCES: { category: string; key: string; label: string; url: string; layer: number; buffer: number; attr: string }[] = [
  { category: "Geohazardy", key: "zosuvy",  label: "Zosuv / svahová deformácia",        url: "https://ags.geology.sk/arcgis/rest/services/Geofond/zosuvy_vect/MapServer",  layer: 2, buffer: 30, attr: "ŠGÚDŠ" },
  { category: "Geohazardy", key: "env",     label: "Environmentálna záťaž",             url: "https://ags.geology.sk/arcgis/rest/services/Geofond/skladky_vect/MapServer", layer: 1, buffer: 50, attr: "ŠGÚDŠ" },
  { category: "Geohazardy", key: "skladka", label: "Skládka odpadu",                    url: "https://ags.geology.sk/arcgis/rest/services/Geofond/skladky_vect/MapServer", layer: 0, buffer: 50, attr: "ŠGÚDŠ" },
  { category: "Geohazardy", key: "banske",  label: "Staré banské dielo",                url: "https://ags.geology.sk/arcgis/rest/services/Geofond/sbd_vect/MapServer",     layer: 0, buffer: 50, attr: "ŠGÚDŠ" },
  { category: "Les a pôda", key: "les",     label: "Les / ochranné pásmo (50 m)",       url: "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/JPRL/MapServer",          layer: 0, buffer: 50, attr: "NLC" },
  { category: "Vodné toky", key: "tok",     label: "Vodný tok / ochranné pásmo (15 m)", url: "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/TokySR/MapServer",         layer: 0, buffer: 15, attr: "NLC" },
  { category: "Záplavy",    key: "zaplava", label: "Záplavové riziko (APSFR)",          url: "https://mpt.svp.sk/server/rest/services/inspire/AreaofPotentialSignificantFloodRisk_Polygon_SK40000/MapServer", layer: 0, buffer: 10, attr: "SVP" },
];
// Core (volateľný aj z nlQuery post-filtra) — getParcelLimits je tenký wrapper.
async function limitsCore(lat: number, lng: number, refresh?: boolean): Promise<LimitsResult> {
  const key = `limits:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = await regCacheRead(key, !!refresh, 30 * 24 * 3600);
  if (cached) return { ...(cached.payload as LimitsResult), cached: true, ageDays: cached.ageDays };
  const one = async (s: (typeof LIMIT_SOURCES)[number]): Promise<LimitHit> => {
    const base: LimitHit = { category: s.category, key: s.key, label: s.label, hit: false, count: 0, buffer: s.buffer, attribution: s.attr, error: false };
    const u = `${s.url}/${s.layer}/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&distance=${s.buffer}&units=esriSRUnit_Meter&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(u, { headers: { "user-agent": "tri-lipy/1.0 (kataster)" }, signal: ctrl.signal });
      if (!res.ok) return { ...base, error: true };
      const j = asObj(JSON.parse(await res.text())) ?? {};
      const cnt = typeof j.count === "number" ? j.count : 0;
      return { ...base, hit: cnt > 0, count: cnt };
    } catch { return { ...base, error: true }; }
    finally { clearTimeout(to); }
  };
  const items = await Promise.all(LIMIT_SOURCES.map(one));
  const out: LimitsResult = { items };
  if (items.some((i) => !i.error)) await regCacheWrite(key, "limits", out); // necachuj samé chyby
  return out;
}
export const getParcelLimits = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lng: z.number(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<LimitsResult> => limitsCore(data.lat, data.lng, data.refresh));

// ——— Živý ESKN identify: klik na ĽUBOVOĽNÚ parcelu v SR → atribúty z národného ÚGKK ESKN (ArcGIS) ———
// Proxy cez worker (bez CORS), fail-soft, cache 7 dní. Nezávislé od našich importovaných k.ú.
const DRUH_POZEMKU: Record<number, string> = {
  1: "orná pôda", 2: "chmeľnica", 3: "vinica", 4: "záhrada", 5: "ovocný sad",
  6: "trvalý trávny porast", 7: "lesný pozemok", 8: "vodná plocha", 9: "zastavaná plocha a nádvorie", 10: "ostatná plocha",
};
const UMIESTNENIE_POZEMKU: Record<number, string> = {
  1: "v zastavanom území (intravilán)", 2: "mimo zastavaného územia (extravilán)",
};
export type EsknOurParcel = {
  dataset_id: string; parcel_id: string; parcel_no: string; lv_no: number | null; ku_name: string | null; okres: string | null;
  area_m2: number | null; use_type: string | null; kn_type: string | null;
  bpej: string | null; bpej_skupina: number | null; settled: number | null; celok: number | null;
  co_owners: number | null; has_spf: number | null; score: number | null;
};
export type AvmResult = {
  estimate_eur: number | null; low_eur: number | null; high_eur: number | null;
  ppm2: number | null; klass: string; comps: number; confidence: "vysoká" | "stredná" | "nízka"; factors: string[];
};
export type EsknParcel = {
  found: boolean; parcel_no: string | null; area_m2: number | null; druh_pozemku: string | null;
  umiestnenie: string | null; ku_id: number | null; lv_id: number | null;
  lat: number; lng: number; ours?: EsknOurParcel | null; avm?: AvmResult | null; cached?: boolean; ageDays?: number; message?: string;
  // parcely E v bode (mapa určeného operátu) a ich LV v našich dátach — pre parcelu C bez LV
  eUnder?: { no: string; lvNo: number | null; areaM2: number | null; datasetId: string | null }[];
};

// Parcely E v bode z národnej mapy určeného operátu (ESKN VRM/uo, vrstva 2) → ich LV v našich dátach.
async function esknEUnder(lat: number, lng: number, datasetId: string | null): Promise<NonNullable<EsknParcel["eUnder"]>> {
  const dd = 0.0012, ext = `${lng - dd},${lat - dd},${lng + dd},${lat + dd}`;
  const j = asObj(await fetchJsonTimed(`https://kataster.skgeodesy.sk/eskn/rest/services/VRM/uo/MapServer/identify?geometry=${lng},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:2&tolerance=1&mapExtent=${ext}&imageDisplay=800,600,96&returnGeometry=false&f=json`, 12000)) ?? {};
  const did = datasetId ?? (await q<{ dataset_id: string }>(
    "SELECT dataset_id FROM parcels WHERE centroid_lat BETWEEN ? AND ? AND centroid_lng BETWEEN ? AND ? LIMIT 1",
    [lat - 0.003, lat + 0.003, lng - 0.003, lng + 0.003]).catch(() => []))[0]?.dataset_id ?? null;
  const out: NonNullable<EsknParcel["eUnder"]> = [];
  for (const r of (Array.isArray(j.results) ? j.results : []).slice(0, 6)) {
    const a = asObj(asObj(r)?.attributes) ?? {};
    const no = a.PARCEL_NUMBER_FULL != null ? String(a.PARCEL_NUMBER_FULL) : null;
    if (!no) continue;
    const area = a.GEODETIC_AREA_OF_PARCEL != null ? Number(String(a.GEODETIC_AREA_OF_PARCEL).replace(",", ".")) : null;
    const lv = did ? (await q<{ lv_no: number; area_m2: number }>("SELECT lv_no, area_m2 FROM lv_parcels WHERE dataset_id = ? AND register='E' AND parcel_no = ? LIMIT 1", [did, no]))[0] : undefined;
    out.push({ no, lvNo: lv?.lv_no ?? null, areaM2: lv?.area_m2 ?? (area != null && isFinite(area) ? Math.round(area) : null), datasetId: lv ? did : null });
  }
  return out;
}

// ——— AVM (automatický odhad hodnoty) — comparables z trhu + úpravy podľa druhu/umiestnenia/BPEJ/veľkosti/vysporiadanosti ———
// Orientačný model, NIE znalecký posudok. Sadzby sú laditeľné (kataster profík vie dodať reálne čísla).
// Agri základy €/m² podľa druhu sú v calib (ag_base.*) / CALIB_DEFAULTS — Fáza 5.
// Regionálny faktor pre poľnohosp./lesnú pôdu — trhové ceny pôdy sa v SR líšia rádovo (úrodné nížiny × hory).
// Orientačné podľa verejných štatistík cien poľnohosp. pôdy SR. Stavebné pozemky idú cez trhové comps → tam sa NEaplikuje.
// Read-free statický číselník podľa okresu (nezaťažuje D1).
const AG_FERTILE_OKRESY = new Set(["Dunajská Streda", "Komárno", "Nové Zámky", "Galanta", "Šaľa", "Trnava", "Nitra", "Hlohovec", "Senec", "Trebišov", "Michalovce", "Rimavská Sobota", "Levice"]);
const AG_MOUNTAIN_OKRESY = new Set(["Čadca", "Kysucké Nové Mesto", "Námestovo", "Tvrdošín", "Dolný Kubín", "Ružomberok", "Liptovský Mikuláš", "Poprad", "Kežmarok", "Stará Ľubovňa", "Brezno", "Gelnica", "Sabinov", "Medzilaborce", "Snina", "Bytča"]);
// ——— Fáza 5: kalibrácia AVM/GDV (calib tabuľka). Kód = fallback keď kľúč chýba. ———
export type CalibMap = Record<string, number>;
// Kódové defaulty = presne to, čím je naseedovaná calib (migrácia 0066). Fallback ak riadok chýba.
export const CALIB_DEFAULTS: CalibMap = {
  "ag_base.1": 1.5, "ag_base.2": 2.0, "ag_base.3": 3.0, "ag_base.4": 6.0, "ag_base.5": 5.0,
  "ag_base.6": 1.0, "ag_base.7": 0.6, "ag_base.8": 0.3, "ag_base.10": 2.5, "ag_base.default": 1.5,
  "region.fertile": 1.5, "region.mountain": 0.65, "region.default": 1.0,
  "dev.m2_per_byt": 70, "dev.naklady_eur_m2": 2800, "dev.predaj_eur_m2": 2500,
  "dev.low_m2_per_byt": 110, "dev.low_naklady_eur_m2": 1500, "dev.low_predaj_eur_m2": 1900,
  "discount.unsettled": 0.8,
};
// Načíta calib mapu (malá tabuľka ~20 riadkov) zliatu nad defaultmi. Bez cache → admin zmeny platia hneď.
async function getCalibMap(): Promise<CalibMap> {
  const rows = await q<{ key: string; value: number }>("SELECT key, value FROM calib").catch(() => []);
  const map: CalibMap = { ...CALIB_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}
export type CalibRow = { key: string; value: number; category: string; label: string | null; unit: string | null; updated_at: string | null; updated_by: string | null; default_value: number | null };
// Číta calib riadky pre admin UI (aj default z kódu na porovnanie). Bez auth — sadzby nie sú citlivé.
export const getCalib = createServerFn({ method: "GET" }).handler(async (): Promise<CalibRow[]> => {
  const rows = await q<CalibRow>("SELECT key, value, category, label, unit, updated_at, updated_by FROM calib ORDER BY category, key").catch(() => []);
  return rows.map((r) => ({ ...r, default_value: CALIB_DEFAULTS[r.key] ?? null }));
});
// Rozsahy pre validáciu (fat-finger poistka) podľa kategórie.
const CALIB_RANGE: Record<string, [number, number]> = { ag_base: [0.01, 500], region: [0.1, 5], dev: [1, 50000], discount: [0.05, 1] };
// Uloží jednu sadzbu — LEN admin, audit-log. Kľúč musí existovať v CALIB_DEFAULTS (whitelist).
export const setCalib = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), key: z.string(), value: z.number() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže meniť kalibráciu." };
    if (!(data.key in CALIB_DEFAULTS)) return { ok: false, message: "Neznámy kľúč kalibrácie." };
    const cat = data.key.split(".")[0];
    const [lo, hi] = CALIB_RANGE[cat] ?? [0, 1e9];
    if (!Number.isFinite(data.value) || data.value < lo || data.value > hi) return { ok: false, message: `Hodnota mimo rozsahu (${lo}–${hi}).` };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE calib SET value=?, updated_at=datetime('now'), updated_by=? WHERE key=?").bind(data.value, u.email, data.key).run();
    await logAudit("calib_set", u.role, `${data.key}=${data.value}`);
    return { ok: true };
  });
// Reset jedného kľúča (alebo všetkých) na kódový default. LEN admin.
export const resetCalib = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), key: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string; reset?: number }> => {
    const u = await userFromToken(data.token);
    if (!u || u.role !== "admin") return { ok: false, message: "Len admin môže meniť kalibráciu." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const keys = data.key ? (data.key in CALIB_DEFAULTS ? [data.key] : []) : Object.keys(CALIB_DEFAULTS);
    if (!keys.length) return { ok: false, message: "Neznámy kľúč kalibrácie." };
    for (const k of keys) await DB.prepare("UPDATE calib SET value=?, updated_at=datetime('now'), updated_by=? WHERE key=?").bind(CALIB_DEFAULTS[k], u.email, k).run();
    await logAudit("calib_reset", u.role, data.key ?? "all");
    return { ok: true, reset: keys.length };
  });
function agRegionFactor(okres: string | null, calib: CalibMap): number {
  const o = (okres ?? "").trim();
  if (!o) return calib["region.default"] ?? 1.0;
  if (AG_FERTILE_OKRESY.has(o)) return calib["region.fertile"] ?? 1.5;    // úrodné nížiny — pôda drahšia
  if (AG_MOUNTAIN_OKRESY.has(o)) return calib["region.mountain"] ?? 0.65; // hornaté (Kysuce, Orava, Liptov, Spiš…)
  return calib["region.default"] ?? 1.0;
}
async function computeAvm(lat: number, lng: number, area: number | null, druhCode: number | null, umCode: number | null, bpejSkupina: number | null, settled: number | null, okres: string | null, obec: string | null, calib: CalibMap): Promise<AvmResult> {
  const empty: AvmResult = { estimate_eur: null, low_eur: null, high_eur: null, ppm2: null, klass: "neznáme", comps: 0, confidence: "nízka", factors: [] };
  if (!area || area <= 0) return empty;
  const factors: string[] = [];
  const buildable = umCode === 1 || druhCode === 9;
  const pct = (arr: number[], p: number) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);

  // Comparables = reálne inzeráty pozemkov v NAJBLIŽŠOM OKOLÍ (obec → okres → geo box → index), stavebné pásmo ppm2 15–1500 €/m².
  // Medián = báza; p25/p75 = dátami riadené rozpätie (nie umelé ±%).
  let buildBase: number | null = null, buildLow: number | null = null, buildHigh: number | null = null, nComps = 0, srcLabel = "";
  const fromRows = (rows: { ppm2: number }[], label: string): boolean => {
    const a = rows.map((r) => r.ppm2).filter((p) => p >= 15 && p <= 1500).sort((x, y) => x - y);
    if (a.length >= 5) { buildBase = pct(a, 0.5); buildLow = pct(a, 0.25); buildHigh = pct(a, 0.75); nComps = a.length; srcLabel = label; return true; }
    return false;
  };
  if (obec) { const r = await q<{ ppm2: number }>("SELECT ppm2 FROM market_listings WHERE ptype='pozemok' AND obec = ? AND ppm2 IS NOT NULL", [obec]); if (fromRows(r, `inzerátov obec ${obec}`)) { /* najbližšie */ } }
  if (buildBase == null && okres) { const r = await q<{ ppm2: number }>("SELECT ppm2 FROM market_listings WHERE ptype='pozemok' AND okres = ? AND ppm2 IS NOT NULL", [okres]); fromRows(r, `inzerátov okres ${okres}`); }
  if (buildBase == null) { const dd = 0.13; const r = await q<{ ppm2: number }>("SELECT ppm2 FROM market_listings WHERE ptype='pozemok' AND ppm2 IS NOT NULL AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?", [lat - dd, lat + dd, lng - dd, lng + dd]); fromRows(r, "inzerátov v okolí (~14 km)"); }
  if (buildBase == null && okres) { const mi = await q<{ m: number }>("SELECT median_eur_m2 AS m FROM market_index WHERE okres = ? AND ptype='pozemok' AND obec IS NULL ORDER BY day DESC LIMIT 1", [okres]); if (mi[0]?.m) { buildBase = mi[0].m; srcLabel = `index okres ${okres}`; } }

  let ppm2: number | null = null, low: number | null = null, high: number | null = null, klass = "";
  if (buildable) {
    if (buildBase != null) {
      const sizeF = area <= 1500 ? 1 : area <= 5000 ? 0.9 : area <= 20000 ? 0.78 : 0.65;
      ppm2 = buildBase * sizeF;
      low = (buildLow ?? buildBase * 0.7) * sizeF;
      high = (buildHigh ?? buildBase * 1.3) * sizeF;
      klass = umCode === 1 ? "stavebný / intravilán" : "zastavaná plocha";
      factors.push(`medián ${srcLabel} = ${Math.round(buildBase)} €/m²`);
      if (buildLow != null && buildHigh != null) factors.push(`rozpätie trhu ${Math.round(buildLow)}–${Math.round(buildHigh)} €/m²`);
      if (sizeF < 1) factors.push(`veľkosť ×${sizeF}`);
    }
  } else {
    const base = (druhCode != null ? calib[`ag_base.${druhCode}`] : undefined) ?? calib["ag_base.default"] ?? 1.5;
    let f = base;
    factors.push(`poľnohosp. základ ${base} €/m²`);
    if (bpejSkupina != null) { const bf = Math.max(0.5, Math.min(1.4, 1.4 - (bpejSkupina - 1) * 0.1)); f = f * bf; factors.push(`BPEJ skupina ${bpejSkupina} ×${bf.toFixed(2)}`); }
    const rf = agRegionFactor(okres, calib);
    if (rf !== 1.0) { f = f * rf; factors.push(`región ${okres} ×${rf}`); }
    ppm2 = f; low = f * 0.6; high = f * 1.4;
    klass = druhCode === 7 ? "lesný pozemok" : druhCode === 8 ? "vodná plocha" : "poľnohospodárska pôda";
  }
  if (ppm2 == null) return { ...empty, comps: nComps };
  const unsettledF = calib["discount.unsettled"] ?? 0.8;
  if (settled === 0) { ppm2 *= unsettledF; if (low != null) low *= unsettledF; if (high != null) high *= unsettledF; factors.push(`nevysporiadaná ×${unsettledF}`); }
  const confidence: AvmResult["confidence"] = buildable ? (nComps >= 20 ? "vysoká" : nComps >= 5 ? "stredná" : "nízka") : (bpejSkupina != null ? "stredná" : "nízka");
  return {
    estimate_eur: Math.round(area * ppm2),
    low_eur: low != null ? Math.round(area * low) : null,
    high_eur: high != null ? Math.round(area * high) : null,
    ppm2: Math.round(ppm2 * 100) / 100, klass, comps: nComps, confidence, factors,
  };
}
// Nájdi NAŠU parcelu pre daný bod naprieč VŠETKÝMI k.ú. (nezávisle od načítaného datasetu) + opportunity skóre.
type OurCand = {
  parcel_id: string; dataset_id: string; parcel_no: string; lv_no: number | null; area_m2: number | null;
  use_type: string | null; kn_type: string | null; bpej: string | null; bpej_skupina: number | null;
  settled: number | null; celok: number | null; centroid_lat: number | null; centroid_lng: number | null; ku_name: string | null; region: string | null;
};
// Okres z dataset.region (napr. "okres Čadca · Kysuce" → "Čadca")
function okresFromRegion(region: string | null): string | null {
  if (!region) return null;
  const m = region.match(/okres\s+([A-Za-zÁ-ž.\s-]+?)(?:\s*·|$)/);
  return m ? m[1].trim() : null;
}
async function lookupOurParcel(lat: number, lng: number, esknNo: string | null): Promise<EsknOurParcel | null> {
  // S číslom z ESKN sa hľadá to číslo v okolí ~2 km: pri veľkej parcele (les, pasienok) je stred
  // ďaleko od miesta kliku a pôvodné okno ~100 m ju nenašlo → panel neponúkol náš LV (2026-11-11).
  const d = esknNo ? 0.02 : 0.0009;
  const cands = await q<OurCand>(
    `SELECT p.id AS parcel_id, p.dataset_id, p.parcel_no, p.lv_no, p.area_m2, p.use_type, p.kn_type,
            p.bpej, p.bpej_skupina, p.settled, p.celok, p.centroid_lat, p.centroid_lng, d.ku_name, d.region
     FROM parcels p JOIN datasets d ON d.id = p.dataset_id
     WHERE p.centroid_lat BETWEEN ? AND ? AND p.centroid_lng BETWEEN ? AND ? AND p.geometry_json IS NOT NULL
       ${esknNo ? "AND p.parcel_no = ? AND p.kn_type NOT LIKE 'E%'" : ""}
     LIMIT 200`,
    esknNo ? [lat - d, lat + d, lng - d, lng + d, esknNo] : [lat - d, lat + d, lng - d, lng + d]);
  if (!cands.length) return null;
  const dist = (c: OurCand) => ((c.centroid_lat ?? 0) - lat) ** 2 + ((c.centroid_lng ?? 0) - lng) ** 2;
  const byNo = esknNo ? cands.find((c) => String(c.parcel_no) === esknNo) : undefined;
  // Keď ESKN číslo parcely pozná a u nás nesedí, NEberie sa najbližšia iná parcela — panel by ponúkol
  // výpis CUDZIEHO LV (opravené 2026-11-11). Bez čísla len parcela do ~30 m.
  if (esknNo && !byNo) return null;
  const nearest = [...cands].sort((a, b) => dist(a) - dist(b))[0];
  const pick = byNo ?? (dist(nearest) < 0.0003 ** 2 ? nearest : undefined);
  if (!pick) return null;
  let score: number | null = null, co_owners: number | null = null, has_spf: number | null = null;
  if (pick.lv_no != null) {
    const sig = (await q<{ co_owners: number; has_spf: number; dedic: number; buildable: number; clean_title: number; absenter_ratio: number }>(
      "SELECT co_owners, has_spf, dedic, buildable, clean_title, absenter_ratio FROM lv_signals WHERE dataset_id = ? AND lv_no = ?",
      [pick.dataset_id, pick.lv_no]))[0];
    if (sig) {
      co_owners = sig.co_owners ?? 0; has_spf = sig.has_spf ?? 0;
      const w = { co: 0.3, spf: 0.25, dedic: 0.15, buildable: 0.15, absenter: 0.1, clean: 0.05 };
      const wsum = w.co + w.spf + w.dedic + w.buildable + w.absenter + w.clean;
      const raw = (w.co * Math.min(sig.co_owners ?? 0, 20)) / 20 + w.spf * (sig.has_spf ?? 0) + w.dedic * (sig.dedic ?? 0)
        + w.buildable * (sig.buildable ?? 0) + w.absenter * (sig.absenter_ratio ?? 0) + w.clean * (sig.clean_title ?? 0);
      score = Math.round((100 * raw) / wsum);
    }
  }
  return {
    dataset_id: pick.dataset_id, parcel_id: pick.parcel_id, parcel_no: pick.parcel_no, lv_no: pick.lv_no,
    ku_name: pick.ku_name, okres: okresFromRegion(pick.region), area_m2: pick.area_m2, use_type: pick.use_type, kn_type: pick.kn_type,
    bpej: pick.bpej, bpej_skupina: pick.bpej_skupina, settled: pick.settled, celok: pick.celok,
    co_owners, has_spf, score,
  };
}

export const esknIdentify = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lng: z.number(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<EsknParcel> => {
    const base: EsknParcel = { found: false, parcel_no: null, area_m2: null, druh_pozemku: null, umiestnenie: null, ku_id: null, lv_id: null, lat: data.lat, lng: data.lng };
    const key = `eskn4:${data.lat.toFixed(5)}:${data.lng.toFixed(5)}`;   // eskn4: oprava „našej" parcely + parcely E (2026-11-11)
    const cached = await regCacheRead(key, !!data.refresh, 7 * 24 * 3600);
    if (cached) return { ...(cached.payload as EsknParcel), cached: true, ageDays: cached.ageDays };
    const dd = 0.0012;
    const ext = `${data.lng - dd},${data.lat - dd},${data.lng + dd},${data.lat + dd}`;
    const url = `https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer/identify?geometry=${data.lng},${data.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:9&tolerance=3&mapExtent=${ext}&imageDisplay=800,600,96&returnGeometry=false&f=json`;
    let out: EsknParcel = { ...base };
    let druhCode: number | null = null, umCode: number | null = null;
    try {
      const j = asObj(await fetchJsonTimed(url, 12000)) ?? {};
      const results = Array.isArray(j.results) ? j.results : [];
      const hit = results.find((r) => asObj(r)?.layerId === 9) ?? results[0];
      const a = asObj(asObj(hit)?.attributes) ?? {};
      const numAttr = (k: string): number | null => {
        const v = a[k];
        const n = typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : (typeof v === "number" ? v : null);
        return n != null && isFinite(n) ? n : null;
      };
      const parcel_no = a["Parcelné číslo"] != null ? String(a["Parcelné číslo"]) : null;
      druhCode = numAttr("Identifikátor druhu pozemku");
      umCode = numAttr("Identifikátor umiestnenia pozemku");
      out = {
        ...base,
        found: !!parcel_no,
        parcel_no,
        area_m2: numAttr("Výmera SPI (m2)"),
        druh_pozemku: druhCode != null ? (DRUH_POZEMKU[druhCode] ?? `kód ${druhCode}`) : null,
        umiestnenie: umCode != null ? (UMIESTNENIE_POZEMKU[umCode] ?? null) : null,
        ku_id: numAttr("Identifikátor katastrálneho územia"),
        lv_id: numAttr("Identifikátor listu vlastníctva"),
      };
    } catch {
      out = { ...base, message: "ESKN nedostupné — skús znova." };
    }
    // Best-effort obohatenie — nesmie zhodiť ESKN výsledok ani zobraziť zavádzajúcu hlášku
    try { out.ours = await lookupOurParcel(data.lat, data.lng, out.parcel_no); } catch { /* ignore */ }
    try { const obec = out.ours?.ku_name ? out.ours.ku_name.replace(/^k\.ú\.\s*/i, "").trim() : null; const calib = await getCalibMap(); out.avm = await computeAvm(data.lat, data.lng, out.area_m2 ?? out.ours?.area_m2 ?? null, druhCode, umCode, out.ours?.bpej_skupina ?? null, out.ours?.settled ?? null, out.ours?.okres ?? null, obec, calib); } catch { /* ignore */ }
    try { out.eUnder = await esknEUnder(data.lat, data.lng, out.ours?.dataset_id ?? null); } catch { out.eUnder = []; }
    try { if (out.found || out.ours) await regCacheWrite(key, "eskn", out); } catch { /* ignore */ }
    return out;
  });

// ——— Územný plán: register publikovaných dokumentov obce (auto-fetch z webygroup CMS a pod.) ———
export type UpDoc = { id: number; title: string | null; url: string | null; kind: string | null };
function classifyUpDoc(t: string): string {
  const s = t.toLowerCase();
  if (/v[ýy]kres|mapa|sch[ée]ma|graf/.test(s)) return "vykres";
  if (/textov|z[áa]v[äa]zn|regulat|spr[áa]va|sprievodn/.test(s)) return "text";
  return "ine";
}
// Zdieľané: stiahni ÚP stránku, vyparsuj dokumenty, ulož a detekuj zmeny (new/changed/removed). Volá importUpDocs aj importDataset.
type UpDb = NonNullable<ReturnType<typeof bindings>["DB"]>;
async function syncUpDocs(DB: UpDb, datasetId: string, kuCode: string | null, pageUrl: string): Promise<{ count: number; changed: number }> {
  let html = "";
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(pageUrl, { headers: { "user-agent": "Mozilla/5.0 (tri-lipy kataster)" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Zdroj vrátil ${res.status}.`);
    html = await res.text();
  } finally { clearTimeout(to); }
  const found: { title: string; url: string }[] = [];
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const base = new URL(pageUrl); const seen = new Set<string>(); let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && found.length < 300) {
    const href = m[1]; const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!/file_storage\/download\.php|\.(pdf|docx?|zip)(\?|$)/i.test(href)) continue;
    if (!title || title.length < 4) continue;
    let abs: string; try { abs = new URL(href, base).toString(); } catch { continue; }
    if (seen.has(abs)) continue; seen.add(abs);
    found.push({ title: title.slice(0, 200), url: abs });
  }
  const existing = await q<{ url: string; title: string | null; first_seen: string | null }>("SELECT url,title,first_seen FROM up_docs WHERE dataset_id=?", [datasetId]);
  const exByUrl = new Map(existing.map((e) => [e.url, e]));
  const exTitles = new Set(existing.map((e) => (e.title ?? "").toLowerCase()));
  const foundUrls = new Set(found.map((f) => f.url));
  const foundTitles = new Set(found.map((f) => f.title.toLowerCase()));
  const isFirst = existing.length === 0;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const stmts: ReturnType<UpDb["prepare"]>[] = []; let changed = 0;
  for (const f of found) {
    let state = "current";
    if (!exByUrl.has(f.url)) {
      state = exTitles.has(f.title.toLowerCase()) ? "changed" : "new";
      if (!isFirst) { changed++; stmts.push(DB.prepare("INSERT INTO up_changes (dataset_id,ku_code,title,url,change) VALUES (?,?,?,?,?)").bind(datasetId, kuCode, f.title, f.url, state)); }
    }
    const first = exByUrl.get(f.url)?.first_seen ?? now;
    stmts.push(DB.prepare("INSERT INTO up_docs (dataset_id,title,url,kind,source_page,first_seen,last_seen,change_state) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(dataset_id,url) DO UPDATE SET title=excluded.title,kind=excluded.kind,last_seen=excluded.last_seen,change_state='current'")
      .bind(datasetId, f.title, f.url, classifyUpDoc(f.title), pageUrl, first, now, state));
  }
  for (const e of existing) {
    if (!foundUrls.has(e.url) && !foundTitles.has((e.title ?? "").toLowerCase())) {
      if (!isFirst) { changed++; stmts.push(DB.prepare("INSERT INTO up_changes (dataset_id,ku_code,title,url,change) VALUES (?,?,?,?,'removed')").bind(datasetId, kuCode, e.title, e.url)); }
      stmts.push(DB.prepare("UPDATE up_docs SET change_state='removed' WHERE dataset_id=? AND url=?").bind(datasetId, e.url));
    }
  }
  if (kuCode) stmts.push(DB.prepare("UPDATE up_registry SET last_check=? WHERE ku_code=?").bind(now, kuCode));
  for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
  return { count: found.length, changed };
}

export const importUpDocs = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), pageUrl: z.string().url().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; changed?: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
    const kuCode = (await q<{ ku_code: string }>("SELECT ku_code FROM datasets WHERE id=?", [data.datasetId]))[0]?.ku_code ?? null;
    let pageUrl = data.pageUrl?.trim();
    if (pageUrl && kuCode) await DB.prepare("INSERT INTO up_registry (ku_code,up_page_url) VALUES (?,?) ON CONFLICT(ku_code) DO UPDATE SET up_page_url=excluded.up_page_url").bind(kuCode, pageUrl).run();
    if (!pageUrl && kuCode) pageUrl = (await q<{ up_page_url: string }>("SELECT up_page_url FROM up_registry WHERE ku_code=?", [kuCode]))[0]?.up_page_url;
    if (!pageUrl) return { ok: false, count: 0, message: "Nie je zdrojová URL (vlož ju — uloží sa do číselníka)." };
    try {
      const r = await syncUpDocs(DB, data.datasetId, kuCode, pageUrl);
      await logAudit("up.docs.sync", role, `ÚP: ${r.count} dokumentov, ${r.changed} zmien (${pageUrl}) → ${data.datasetId}.`, data.datasetId);
      if (r.count === 0) return { ok: false, count: 0, message: "Na stránke sa nenašli odkazy na dokumenty (over URL)." };
      return { ok: true, count: r.count, changed: r.changed };
    } catch (e) { return { ok: false, count: 0, message: e instanceof Error ? e.message : "Fetch zlyhal." }; }
  });
export const getUpDocs = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }): Promise<UpDoc[]> => {
    return await q<UpDoc>("SELECT id,title,url,kind FROM up_docs WHERE dataset_id=? AND (change_state IS NULL OR change_state <> 'removed') ORDER BY kind, id", [data.datasetId]);
  });
export type UpChange = { id: number; title: string | null; url: string | null; change: string | null; detected_at: string | null };
export const getUpChanges = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }): Promise<UpChange[]> =>
    await q<UpChange>("SELECT id,title,url,change,detected_at FROM up_changes WHERE dataset_id=? ORDER BY detected_at DESC, id DESC LIMIT 40", [data.datasetId]));

// ——— Regulatívy per zóna (ručný číselník; zone_code='*' = default obce) → development kalkulačka ———
export type UpRegulativ = { id: number; zone_code: string | null; funkcia: string | null; izp: number | null; kz: number | null; ipp: number | null; max_vyska: number | null; max_podlazi: number | null; note: string | null };
export const getUpRegulativ = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }): Promise<UpRegulativ[]> =>
    await q<UpRegulativ>("SELECT id,zone_code,funkcia,izp,kz,ipp,max_vyska,max_podlazi,note FROM up_regulativ WHERE dataset_id=? ORDER BY zone_code", [data.datasetId]));
export const setUpRegulativ = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), zoneCode: z.string().min(1), funkcia: z.string().optional(), izp: z.number().optional(), kz: z.number().optional(), ipp: z.number().optional(), maxVyska: z.number().optional(), maxPodlazi: z.number().optional(), note: z.string().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie." };
    const { DB } = bindings(); if (!DB) return { ok: false, message: "Databáza nedostupná." };
    await DB.prepare("DELETE FROM up_regulativ WHERE dataset_id=? AND zone_code=?").bind(data.datasetId, data.zoneCode).run();
    await DB.prepare("INSERT INTO up_regulativ (dataset_id,zone_code,funkcia,izp,kz,ipp,max_vyska,max_podlazi,note,source) VALUES (?,?,?,?,?,?,?,?,?,'manual')")
      .bind(data.datasetId, data.zoneCode, data.funkcia ?? null, data.izp ?? null, data.kz ?? null, data.ipp ?? null, data.maxVyska ?? null, data.maxPodlazi ?? null, data.note ?? null).run();
    await logAudit("up.regulativ.set", role, `Regulatív zóny ${data.zoneCode} → ${data.datasetId}.`, data.datasetId);
    return { ok: true };
  });
export const deleteUpRegulativ = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false };
    const { DB } = bindings(); if (!DB) return { ok: false };
    await DB.prepare("DELETE FROM up_regulativ WHERE id=?").bind(data.id).run();
    return { ok: true };
  });

// Sync číselníka obec→ÚP URL z Mac-master publikovaného up-registry.json (denný monitor).
export const refreshUpRegistry = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url().optional(), role: roleSchema, token: z.string().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = await roleFromToken(data.token);   // rola zo session, nie od klienta
    if (!canRunPipeline(role)) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings(); if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
    const url = data.url ?? "https://raw.githubusercontent.com/kristiakbohus-hub/tri-lipy-market/main/up-registry.json";
    if (!trustedDataUrl(url)) return { ok: false, count: 0, message: UNTRUSTED_MSG };
    let j: unknown;
    try { j = await fetchJsonTimed(url, 15000); } catch (e) { return { ok: false, count: 0, message: e instanceof Error ? e.message : "Fetch zlyhal." }; }
    const arr = asArr((asObj(j) ?? {}).registry);
    const stmts = arr.flatMap((r0) => {
      const r = asObj(r0) ?? {}; const ku = asVal(r.ku_code);
      if (!ku) return [];
      return [DB.prepare("INSERT INTO up_registry (ku_code,obec,up_page_url) VALUES (?,?,?) ON CONFLICT(ku_code) DO UPDATE SET obec=excluded.obec,up_page_url=excluded.up_page_url")
        .bind(ku, asVal(r.obec), asVal(r.url))];
    });
    for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
    await logAudit("up.registry.sync", role, `ÚP číselník: ${stmts.length} obcí z ${url}.`);
    return { ok: true, count: stmts.length };
  });

// Medián €/m² lokality+typu (najnovší) — pre odhad ceny pri parcele.
export const getLocalityMedian = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string(), ptype: z.string(), deal: z.string().optional() }))
  .handler(async ({ data }): Promise<{ median: number | null; p25: number | null; p75: number | null; day: string | null; cnt: number | null }> => {
    const r = (await q<{ median_eur_m2: number; p25: number; p75: number; day: string; cnt: number }>(
      "SELECT median_eur_m2,p25,p75,day,cnt FROM market_index WHERE okres=? AND ptype=? AND deal=? AND obec IS NULL ORDER BY day DESC LIMIT 1",
      [data.okres, data.ptype, data.deal ?? "predaj"]))[0];
    return { median: r?.median_eur_m2 ?? null, p25: r?.p25 ?? null, p75: r?.p75 ?? null, day: r?.day ?? null, cnt: r?.cnt ?? null };
  });

// ═══════════════ KUPUJÚCI — kupci ku pozemku + evidencia dopytu s párovaním ═══════════════
// Plán vlastníka (2026-11-10): popri pozemkoch rovno aj kupujúci. Deal-sourcing má dve strany —
// nájsť pozemok nestačí, treba vedieť, komu ho ponúknuť, a pre koho hľadať.
// Zdroje: kataster (susedia, nedávne kúpy v k.ú., firmy s majetkom v k.ú.) + vlastná evidencia dopytu.
// HRANICA: appka NEdohľadáva telefóny/emaily fyzických osôb — kontakt je z katastra (adresa na list)
// alebo ručne zadaný. Mená osôb len pre rolu s plným prístupom; GDPR námietka (suppression) vyraďuje.
// Susedia a nedávni kupci sú ODVODENÝ záujem (môžu mať dôvod kúpiť), nie potvrdený dopyt.

export const BUYER_KINDS = ["osoba", "firma", "developer", "stavebna_firma", "investor"] as const;
export const BUYER_PTYPES = ["pozemok", "byt", "dom", "chata", "komercne"] as const;
export const BUYER_PURPOSES = ["residential", "retail", "industrial", "rekreacia"] as const;
export type BuyerRequest = {
  id: number; kind: string; name: string; ico: string | null; contact: string | null; source: string;
  ptype: string; purpose: string | null; area_min: number | null; area_max: number | null; budget_max: number | null;
  locations: string | null; timeframe: string | null; note: string | null; status: string;
  author: string | null; created_at: string; updated_at: string;
};
const buyerFields = {
  kind: z.enum(BUYER_KINDS), name: z.string().trim().min(2).max(200),
  ico: z.string().trim().max(20).optional(), contact: z.string().trim().max(300).optional(),
  ptype: z.enum(BUYER_PTYPES), purpose: z.enum(BUYER_PURPOSES).optional(),
  areaMin: z.number().min(0).max(1e8).optional(), areaMax: z.number().min(0).max(1e8).optional(),
  budgetMax: z.number().min(0).max(1e10).optional(),
  locations: z.string().trim().max(500).optional(), timeframe: z.string().trim().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
};

const asciiLow = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** „Žilina, 874825, okres Čadca" → ["zilina","874825","cadca"] */
function locTokens(s: string | null | undefined): string[] {
  return (s ?? "").split(/[,;\n]+/).map((t) => asciiLow(t).replace(/^(okres|k\.?\s*u\.?|obec)\s+/, "").trim()).filter((t) => t.length >= 2);
}
type DsRow = { id: string; ku_code: string | null; ku_name: string | null; region: string | null };
const dsOkres = (d: DsRow) => asciiLow((d.region ?? "").split("·")[0]).replace(/^okres\s+/, "").trim();
/** Patrí dataset (k.ú.) do lokalít dopytu? Prázdne lokality = celé územie appky. */
function dsInLocations(d: DsRow, toks: string[]): boolean {
  if (!toks.length) return true;
  const code = d.ku_code ?? d.id.replace(/^kn-/, "");
  const name = asciiLow(d.ku_name).replace(/^k\.?\s*u\.?\s*/, "");
  const okres = dsOkres(d);
  return toks.some((t) => t === code || t === name || t === okres);
}

/** Môže rola zapisovať do evidencie (viewer nie). */
function canEditBuyers(role: Role) { return role !== "viewer"; }

export const listBuyerRequests = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; canEdit: boolean; rows: BuyerRequest[] }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, canEdit: false, rows: [] };
    const full = ownerAccess(u.role) === "full";
    const rows = await q<BuyerRequest>(
      "SELECT * FROM buyer_requests ORDER BY CASE status WHEN 'aktivny' THEN 0 WHEN 'pozastaveny' THEN 1 ELSE 2 END, updated_at DESC LIMIT 300").catch(() => []);
    // kontakt na OSOBU je osobný údaj → len plný prístup; firmy/developeri sú verejné subjekty
    return { ok: true, canEdit: canEditBuyers(u.role), rows: full ? rows : rows.map((r) => (r.kind === "osoba" ? { ...r, contact: r.contact ? "—" : null } : r)) };
  });

export const saveBuyerRequest = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number().int().optional(), ...buyerFields }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    if (!canEditBuyers(u.role)) return { ok: false, message: "Rola viewer nemôže meniť evidenciu dopytu." };
    if (data.areaMin != null && data.areaMax != null && data.areaMin > data.areaMax) return { ok: false, message: "Výmera od je väčšia ako do." };
    const vals = [data.kind, data.name, data.ico || null, data.contact || null, data.ptype, data.purpose ?? null,
      data.areaMin ?? null, data.areaMax ?? null, data.budgetMax ?? null, data.locations || null, data.timeframe || null, data.note || null];
    if (data.id) {
      await q(`UPDATE buyer_requests SET kind=?, name=?, ico=?, contact=?, ptype=?, purpose=?, area_min=?, area_max=?, budget_max=?,
               locations=?, timeframe=?, note=?, updated_at=datetime('now') WHERE id=?`, [...vals, data.id]);
      await logAudit("buyer.update", u.role, `Dopyt #${data.id} upravený`);
      return { ok: true, id: data.id };
    }
    const r = await q<{ id: number }>(
      `INSERT INTO buyer_requests (kind,name,ico,contact,ptype,purpose,area_min,area_max,budget_max,locations,timeframe,note,user_id,author)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, [...vals, u.id, u.name || u.email]);
    await logAudit("buyer.create", u.role, `Nový dopyt #${r[0]?.id ?? "?"} (${data.kind}, ${data.ptype})`);
    return { ok: true, id: r[0]?.id };
  });

export const setBuyerRequestStatus = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number().int(), status: z.enum(["aktivny", "pozastaveny", "uzavrety"]) }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u || !canEditBuyers(u.role)) return { ok: false, message: "Bez oprávnenia." };
    await q("UPDATE buyer_requests SET status=?, updated_at=datetime('now') WHERE id=?", [data.status, data.id]);
    await logAudit("buyer.status", u.role, `Dopyt #${data.id} → ${data.status}`);
    return { ok: true };
  });

export const deleteBuyerRequest = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number().int() }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u || !canEditBuyers(u.role)) return { ok: false, message: "Bez oprávnenia." };
    await q("DELETE FROM buyer_requests WHERE id=?", [data.id]);
    await logAudit("buyer.delete", u.role, `Dopyt #${data.id} zmazaný`);
    return { ok: true };
  });

// ——— Párovanie dopytu: pozemkové príležitosti (land-search) + trhové inzeráty ———
export type BuyerLandMatch = { kodKu: string; kuName: string | null; datasetId: string | null; verdict: string; quality: number | null; areaM2: number | null; parcels: string | null; zone: string | null; purpose: string | null };
export type BuyerListingMatch = { title: string | null; url: string | null; obec: string | null; okres: string | null; ptype: string | null; areaM2: number | null; priceEur: number | null; ppm2: number | null; lastSeen: string | null };
const LISTING_PTYPES: Record<string, string[]> = { pozemok: ["pozemok"], byt: ["byt"], dom: ["dom"], chata: ["chata", "chalupa"], komercne: [] };

async function matchBuyer(r: BuyerRequest, dss: DsRow[]): Promise<{ land: BuyerLandMatch[]; listings: BuyerListingMatch[] }> {
  const toks = locTokens(r.locations);
  const inLoc = dss.filter((d) => dsInLocations(d, toks));
  const codes = inLoc.map((d) => d.ku_code ?? d.id.replace(/^kn-/, ""));
  let land: BuyerLandMatch[] = [];
  if (r.ptype === "pozemok" && codes.length) {
    const purpose = r.purpose === "rekreacia" ? "residential" : r.purpose;   // rekreačný pozemok = profil bývania
    const cond = [`kod_ku IN (${codes.map(() => "?").join(",")})`, "verdict IN ('MATCH','PROVISIONAL')"];
    const args: unknown[] = [...codes];
    if (purpose) { cond.push("purpose = ?"); args.push(purpose); }
    if (r.area_min != null) { cond.push("area_m2 >= ?"); args.push(r.area_min); }
    if (r.area_max != null) { cond.push("area_m2 <= ?"); args.push(r.area_max); }
    const rows = await q<{ kod_ku: string; ku_name: string | null; verdict: string; quality: number | null; area_m2: number | null; parcels: string | null; zone: string | null; purpose: string | null }>(
      `SELECT kod_ku, ku_name, verdict, quality, area_m2, parcels, zone, purpose FROM landsearch_results WHERE ${cond.join(" AND ")}
       ORDER BY (verdict='MATCH') DESC, quality DESC LIMIT 20`, args).catch(() => []);
    const dsByCode = new Map(inLoc.map((d) => [d.ku_code ?? d.id.replace(/^kn-/, ""), d.id]));
    land = rows.map((x) => ({ kodKu: x.kod_ku, kuName: x.ku_name, datasetId: dsByCode.get(x.kod_ku) ?? null, verdict: x.verdict, quality: x.quality, areaM2: x.area_m2, parcels: x.parcels, zone: x.zone, purpose: x.purpose }));
  }
  let listings: BuyerListingMatch[] = [];
  const pts = LISTING_PTYPES[r.ptype] ?? [];
  if (pts.length) {
    const cond = [`ptype IN (${pts.map(() => "?").join(",")})`, "deal = 'predaj'", "removed_at IS NULL", "last_seen >= date('now','-45 days')"];
    const args: unknown[] = [...pts];
    if (r.budget_max != null) { cond.push("price_eur <= ?"); args.push(r.budget_max); }
    if (r.area_min != null) { cond.push("area_m2 >= ?"); args.push(r.area_min); }
    if (r.area_max != null) { cond.push("area_m2 <= ?"); args.push(r.area_max); }
    const rows = await q<{ title: string | null; url: string | null; obec: string | null; okres: string | null; ptype: string | null; area_m2: number | null; price_eur: number | null; ppm2: number | null; last_seen: string | null }>(
      `SELECT title, url, obec, okres, ptype, area_m2, price_eur, ppm2, last_seen FROM market_listings WHERE ${cond.join(" AND ")}
       ORDER BY last_seen DESC LIMIT 400`, args).catch(() => []);
    // lokalita inzerátu = obec alebo okres (inzeráty nemajú presnú parcelu — dok. 05 LI11)
    const okresy = new Set(inLoc.map(dsOkres));
    const obce = new Set(inLoc.map((d) => asciiLow(d.ku_name).replace(/^k\.?\s*u\.?\s*/, "")));
    listings = rows
      .filter((x) => !toks.length || toks.includes(asciiLow(x.obec)) || toks.includes(asciiLow(x.okres)) || obce.has(asciiLow(x.obec)) || okresy.has(asciiLow(x.okres)))
      .slice(0, 20)
      .map((x) => ({ title: x.title, url: x.url, obec: x.obec, okres: x.okres, ptype: x.ptype, areaM2: x.area_m2, priceEur: x.price_eur, ppm2: x.ppm2, lastSeen: x.last_seen }));
  }
  return { land, listings };
}

export const matchBuyerRequest = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number().int() }))
  .handler(async ({ data }): Promise<{ ok: boolean; land: BuyerLandMatch[]; listings: BuyerListingMatch[]; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, land: [], listings: [], message: "Neprihlásený." };
    const r = (await q<BuyerRequest>("SELECT * FROM buyer_requests WHERE id=?", [data.id]))[0];
    if (!r) return { ok: false, land: [], listings: [], message: "Dopyt neexistuje." };
    const dss = await q<DsRow>("SELECT id, ku_code, ku_name, region FROM datasets").catch(() => []);
    return { ok: true, ...(await matchBuyer(r, dss)) };
  });

// ——— Kupci ku konkrétnej parcele ———
export type BuyerPerson = { name: string; isCompany: boolean; obec: string | null; lvNo: number; detail?: string };
export type BuyerCompany = { name: string; ico: string | null; lvCount: number; category: string };
export type BuyerRegistryFirm = { name: string; ico: string; obec: string | null; category: string | null; established: string | null };
export type ParcelBuyers = {
  ok: boolean; access: OwnerAccess; message?: string;
  registryFirms: BuyerRegistryFirm[]; okres: string | null;
  neighbors: { parcelNo: string; lvNo: number | null; owners: BuyerPerson[] }[];
  neighborsCount: number;
  recentBuyers: BuyerPerson[]; recentBuyersCount: number; recentFromYear: number;
  companies: BuyerCompany[];
  requests: BuyerRequest[];
};

function geoBbox(gj: string | null): [number, number, number, number] | null {
  if (!gj) return null;
  try {
    const g = JSON.parse(gj) as { coordinates?: unknown };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const walk = (c: unknown): void => {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
        const x = c[0], y = c[1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        return;
      }
      if (Array.isArray(c)) for (const e of c) walk(e);
    };
    walk(g.coordinates);
    return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
  } catch { return null; }
}
// Štát, obec, cirkev, SPF, urbár, pozemkové spoločenstvo — nie sú kupci na trhu (urbár/PS kupuje zriedka
// a len v rámci spoločenstva). Firmy, s.r.o., a.s., družstvá ostávajú.
const NOT_MARKET_BUYER = /slovensk[áa] republika|slovensk[ýy] pozemkov|\bspf\b|\bobec\b|\bmesto\b|cirk|farnos|biskup|urb[áa]r|pozemkov[ée] spolo|spolo[čc]enstvo|lesy sr|slovensk[áa] spr[áa]va ciest|železnice|vodohospod/i;
function buyerCategory(name: string): string {
  const n = name.toLowerCase();
  if (/develop|real\s*estate|reality|realit|property|projekt|invest/.test(n)) return "developer / investor";
  if (/stav|build|constr|bau|montáž|montaz/.test(n)) return "stavebná firma";
  if (/dru[žz]stv|agro|po[ľl]nohosp|farm/.test(n)) return "poľnohospodár";
  return "firma";
}

export const getParcelBuyers = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), datasetId: z.string(), parcelNo: z.string() }))
  .handler(async ({ data }): Promise<ParcelBuyers> => {
    const empty: ParcelBuyers = { ok: false, access: "denied", registryFirms: [], okres: null, neighbors: [], neighborsCount: 0, recentBuyers: [], recentBuyersCount: 0, recentFromYear: 0, companies: [], requests: [] };
    const u = await requireUser(data.token);
    if (!u) return { ...empty, message: "Neprihlásený." };
    const access = ownerAccess(u.role);
    const p = (await q<{ id: string; lv_no: number | null; area_m2: number | null; centroid_lat: number | null; centroid_lng: number | null; geometry_json: string | null }>(
      "SELECT id, lv_no, area_m2, centroid_lat, centroid_lng, geometry_json FROM parcels WHERE dataset_id=? AND parcel_no=? LIMIT 1",
      [data.datasetId, data.parcelNo]))[0];
    if (!p) return { ...empty, access, message: "Parcela nie je v datasete." };
    const ds = (await q<DsRow>("SELECT id, ku_code, ku_name, region FROM datasets WHERE id=?", [data.datasetId]))[0] ?? null;
    const kod = ds?.ku_code ?? data.datasetId.replace(/^kn-/, "");
    const suppressed = await suppressedNameSet();
    const isSupp = (nm: string) => {
      const toks = nm.split(",")[0].trim().split(/\s+/);
      return suppressed.has(normName(nm.split(",")[0])) || (toks.length >= 2 && suppressed.has(normName(`${toks[1]} ${toks[0]}`)));
    };
    const ownersOf = async (lvs: number[]) => {
      if (!lvs.length) return new Map<number, BuyerPerson[]>();
      const rows = await q<{ lv_no: number; name: string; is_company: number; addr_obec: string | null }>(
        `SELECT lv_no, name, is_company, addr_obec FROM lv_owners WHERE dataset_id=? AND lv_no IN (${lvs.map(() => "?").join(",")})`,
        [data.datasetId, ...lvs]).catch(() => []);
      const m = new Map<number, BuyerPerson[]>();
      for (const r of rows) {
        if (isSupp(r.name)) continue;
        const arr = m.get(r.lv_no) ?? []; arr.push({ name: r.name, isCompany: !!r.is_company, obec: r.addr_obec, lvNo: r.lv_no }); m.set(r.lv_no, arr);
      }
      return m;
    };
    // osoby len pre plný prístup; firmy (verejné subjekty) vidí každý prihlásený
    const visible = (arr: BuyerPerson[]) => (access === "full" ? arr : arr.filter((o) => o.isCompany));

    // 1) SUSEDIA — parcely, ktorých obrys (bbox) sa dotýka parcely; iné LV než parcela sama
    const bb = geoBbox(p.geometry_json);
    let neighbors: ParcelBuyers["neighbors"] = [];
    if (bb && p.centroid_lat != null && p.centroid_lng != null) {
      const padLat = (bb[3] - bb[1]) / 2 + 0.004, padLng = (bb[2] - bb[0]) / 2 + 0.006;
      const cands = await q<{ id: string; parcel_no: string; lv_no: number | null; geometry_json: string | null }>(
        `SELECT id, parcel_no, lv_no, geometry_json FROM parcels WHERE dataset_id=? AND centroid_lat BETWEEN ? AND ? AND centroid_lng BETWEEN ? AND ? AND id <> ? LIMIT 1500`,
        [data.datasetId, p.centroid_lat - padLat, p.centroid_lat + padLat, p.centroid_lng - padLng, p.centroid_lng + padLng, p.id]).catch(() => []);
      const tol = 0.00003;   // ~2–3 m
      const touch = cands.filter((c) => {
        const b = geoBbox(c.geometry_json);
        return !!b && b[0] <= bb[2] + tol && bb[0] <= b[2] + tol && b[1] <= bb[3] + tol && bb[1] <= b[3] + tol;
      }).filter((c) => c.lv_no != null && c.lv_no !== p.lv_no);
      const om = await ownersOf([...new Set(touch.map((c) => c.lv_no as number))]);
      neighbors = touch.map((c) => ({ parcelNo: c.parcel_no, lvNo: c.lv_no, owners: om.get(c.lv_no as number) ?? [] }))
        .filter((n) => n.owners.length).slice(0, 40);
    }
    const neighborsCount = neighbors.reduce((s, n) => s + n.owners.length, 0);

    // 2) NEDÁVNI KUPCI v k.ú. — vlastníci LV, na ktorých je zapísaná kúpa za posledné ~2 roky
    const fromYear = new Date().getUTCFullYear() - 2;
    const lvRows = await q<{ lv_number: string; y: number }>(
      `SELECT lv_number, MAX(registration_year) y FROM asset_acquisitions WHERE kod_ku=? AND acquisition_kind='sale' AND registration_year >= ?
       GROUP BY lv_number ORDER BY y DESC LIMIT 60`, [kod, fromYear]).catch(() => []);
    const yByLv = new Map(lvRows.map((r) => [Number(r.lv_number), r.y]));
    const bm = await ownersOf([...yByLv.keys()].filter((n) => Number.isFinite(n) && n !== p.lv_no));
    const recentAll: BuyerPerson[] = [];
    for (const [lv, arr] of bm) for (const o of arr) recentAll.push({ ...o, detail: `kúpa zapísaná ${yByLv.get(lv) ?? "?"}` });

    // 3) FIRMY s majetkom v k.ú. (aktívni hráči: developeri, stavebné firmy, investori)
    const comp = await q<{ name: string; ico: string | null; n: number }>(
      `SELECT MIN(name) name, ico, COUNT(DISTINCT lv_no) n FROM lv_owners WHERE dataset_id=? AND is_company=1
       GROUP BY COALESCE(NULLIF(ico,''), name) ORDER BY n DESC LIMIT 80`, [data.datasetId]).catch(() => []);
    const companies = comp.filter((c) => !NOT_MARKET_BUYER.test(c.name)).slice(0, 25)
      .map((c) => ({ name: c.name, ico: c.ico, lvCount: c.n, category: buyerCategory(c.name) }));

    // 3b) FIRMY Z REGISTRA (RPO) so sídlom v okrese — developeri, stavebné firmy, realitky, investori,
    // aj keď tu zatiaľ nič nevlastnia. Kategória je z názvu (RPO odbor činnosti neposkytuje).
    const okresRaw = ((ds?.region ?? "").split("·")[0] ?? "").replace(/^\s*okres\s+/i, "").trim() || null;
    const known = new Set(companies.map((c) => c.ico).filter(Boolean));
    const registryFirms = okresRaw ? (await q<BuyerRegistryFirm>(
      `SELECT name, ico, obec, category, established FROM buyer_firms WHERE okres = ?
       ORDER BY CASE category WHEN 'developer / investor' THEN 0 WHEN 'stavebná firma' THEN 1 WHEN 'realitná kancelária' THEN 2 ELSE 3 END, established DESC LIMIT 60`,
      [okresRaw]).catch(() => [])).filter((f) => !known.has(f.ico)).slice(0, 30) : [];

    // 4) ZHODNÝ DOPYT z evidencie
    const reqs = await q<BuyerRequest>("SELECT * FROM buyer_requests WHERE status='aktivny' AND ptype='pozemok'").catch(() => []);
    const requests = reqs.filter((r) => (!ds || dsInLocations(ds, locTokens(r.locations)))
      && (r.area_min == null || (p.area_m2 ?? 0) >= r.area_min * 0.5)        // parcela môže byť časť celku
      && (r.area_max == null || (p.area_m2 ?? 0) <= r.area_max))
      .map((r) => (access === "full" || r.kind !== "osoba" ? r : { ...r, contact: r.contact ? "—" : null }));

    await logAudit("buyers.parcel", u.role, `Kupci k parcele ${data.parcelNo} (${data.datasetId})`, data.datasetId);
    return {
      ok: true, access, registryFirms, okres: okresRaw,
      neighbors: access === "full" ? neighbors : neighbors.map((n) => ({ ...n, owners: visible(n.owners) })).filter((n) => n.owners.length),
      neighborsCount,
      recentBuyers: visible(recentAll).slice(0, 40), recentBuyersCount: recentAll.length, recentFromYear: fromYear,
      companies, requests,
    };
  });

// ——— Firmy z RPO ako možní kupci (developeri, stavebné firmy, realitky, investori v okrese) ———
export const ingestBuyerFirms = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    replaceOkres: z.array(z.string()).max(64).optional(),
    rows: z.array(z.object({
      ico: z.string().min(6).max(12), name: z.string().min(2).max(300), obec: z.string().max(120).nullable().optional(),
      okres: z.string().max(120).nullable().optional(), category: z.string().max(60).nullable().optional(),
      established: z.string().max(20).nullable().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.replaceOkres && data.replaceOkres.length) {
      const ph = data.replaceOkres.map(() => "?").join(",");
      await DB.prepare(`DELETE FROM buyer_firms WHERE okres IN (${ph})`).bind(...data.replaceOkres).run();
    }
    const stmt = DB.prepare(`INSERT INTO buyer_firms (ico,name,obec,okres,category,established,updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(ico) DO UPDATE SET name=excluded.name, obec=excluded.obec, okres=excluded.okres, category=excluded.category,
      established=excluded.established, updated_at=datetime('now')`);
    const batch = data.rows.map((r) => stmt.bind(r.ico, r.name, r.obec ?? null, r.okres ?? null, r.category ?? null, r.established ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

// ——— OS TRI LIPY → Kataster Core: kvalifikovaný záujemca do evidencie dopytu + jeho zhody ———
// OS TRI LIPY (iný systém) kvalifikuje leady z Facebooku v 5 oblastiach (potreba, rozpočet, financovanie,
// čas kúpy, ďalší krok) a podľa jeho dokumentácie si údaje o kupcoch berie z Kataster Core cez API.
// Kontrakt: 42_NL/KATASTER_CORE_V1_EXECUTION_PACK/23_API_OS_TRI_LIPY_KUPCI.md. Auth = ingest secret.
const leadRow = z.object({
  externalId: z.string().min(1).max(100),
  kind: z.enum(BUYER_KINDS).default("osoba"), name: z.string().trim().min(2).max(200),
  ico: z.string().max(20).optional(), contact: z.string().max(300).optional(),
  ptype: z.enum(BUYER_PTYPES), purpose: z.enum(BUYER_PURPOSES).optional(),
  areaMin: z.number().min(0).max(1e8).optional(), areaMax: z.number().min(0).max(1e8).optional(),
  budgetMax: z.number().min(0).max(1e10).optional(), locations: z.string().max(500).optional(),
  timeframe: z.string().max(100).optional(), financing: z.string().max(200).optional(),
  note: z.string().max(2000).optional(), status: z.enum(["aktivny", "pozastaveny", "uzavrety"]).optional(),
});
export const ingestBuyerLeads = createServerFn({ method: "POST" })
  .validator(z.object({ secret: z.string(), rows: z.array(leadRow).max(200) }))
  .handler(async ({ data }): Promise<{ ok: boolean; upserted?: number; skippedErased?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    // GDPR: lead vymazaný na žiadosť osoby sa ďalším poslaním z OS nevráti (kľúč source:externalId v suppression)
    const erased = new Set((await q<{ key: string }>("SELECT key FROM suppression WHERE kind='erased_buyer'").catch(() => [])).map((x) => x.key));
    const rowsOk = data.rows.filter((r) => !erased.has(erasedBuyerKey("os_tri_lipy", r.externalId)));
    const stmt = DB.prepare(`INSERT INTO buyer_requests (source,external_id,kind,name,ico,contact,ptype,purpose,area_min,area_max,budget_max,locations,timeframe,financing,note,status,author)
      VALUES ('os_tri_lipy',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'OS TRI LIPY')
      ON CONFLICT(source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET kind=excluded.kind, name=excluded.name, ico=excluded.ico,
        contact=excluded.contact, ptype=excluded.ptype, purpose=excluded.purpose, area_min=excluded.area_min, area_max=excluded.area_max,
        budget_max=excluded.budget_max, locations=excluded.locations, timeframe=excluded.timeframe, financing=excluded.financing,
        note=excluded.note, status=excluded.status, updated_at=datetime('now')`);
    const batch = rowsOk.map((r) => stmt.bind(r.externalId, r.kind, r.name, r.ico ?? null, r.contact ?? null, r.ptype, r.purpose ?? null,
      r.areaMin ?? null, r.areaMax ?? null, r.budgetMax ?? null, r.locations ?? null, r.timeframe ?? null, r.financing ?? null, r.note ?? null, r.status ?? "aktivny"));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    const skippedErased = data.rows.length - rowsOk.length;
    await logAudit("buyer.os_ingest", "system", `OS TRI LIPY: ${rowsOk.length} záujemcov${skippedErased ? `, ${skippedErased} vynechaných (GDPR výmaz)` : ""}`);
    return { ok: true, upserted: rowsOk.length, skippedErased };
  });

export const buyerMatchesForLead = createServerFn({ method: "POST" })
  .validator(z.object({ secret: z.string(), externalId: z.string().max(100) }))
  .handler(async ({ data }): Promise<{ ok: boolean; requestId?: number; land?: BuyerLandMatch[]; listings?: BuyerListingMatch[]; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };   // secret VŽDY prvý
    if (!data.externalId.trim()) return { ok: false, message: "Chýba externalId." };
    const r = (await q<BuyerRequest>("SELECT * FROM buyer_requests WHERE source='os_tri_lipy' AND external_id=?", [data.externalId]))[0];
    if (!r) return { ok: false, message: "Záujemca s týmto externalId nie je v evidencii." };
    const dss = await q<DsRow>("SELECT id, ku_code, ku_name, region FROM datasets").catch(() => []);
    return { ok: true, requestId: r.id, ...(await matchBuyer(r, dss)) };
  });

// ——— ZADANIA HĽADANIA POZEMKOV (OI-07/OI-08; migrácia 0094) ———
// Rozhodnutie vlastníka 2026-11-11: požiadavky (okolie, výmera, dostupnosť, riziká…) zadáva vlastník
// pri KAŽDOM hľadaní — žiadna pevná retail šablóna. Appka zadanie uloží, Mac engine ho spracuje
// (21_NL_SEARCH/brief_worker.py cez /api/brief-queue) a výsledky sa viažu na zadanie. Zadanie je po
// uložení NEMENNÉ: zmena = nové zadanie (kópia), aby staré výsledky ostali platné pre svoje parametre.
export const BRIEF_DESTS = ["center", "school", "kindergarten", "shop", "bus", "health", "pharmacy", "motorway"] as const;
export type SearchBrief = {
  id: number; title: string; client: string | null; purpose: string; kus_json: string;
  area_min: number; area_max: number; access_json: string | null; max_slope: number | null;
  exclude_ppf: number; require_frontage: number; other_req: string | null;
  status: string; progress: string | null; error: string | null; stats_json: string | null;
  author: string | null; created_at: string; started_at: string | null; finished_at: string | null;
  n_match?: number; n_prov?: number;
};
export type BriefResult = {
  kod_ku: string; ku_name: string | null; verdict: string; quality: number | null; area_m2: number | null;
  n_parcels: number | null; parcels: string | null; shape: string | null; zone: string | null; build: string | null;
  access: number | null; slope: number | null; frontage: number | null; ppf: number | null;
  existing_use: string | null; druh: string | null; access_times: string | null; owners: string | null;
  n_owners: number | null; reason: string | null; dataset_id: string | null;
};
const briefFields = {
  title: z.string().trim().min(2).max(160),
  client: z.string().trim().max(160).optional(),
  purpose: z.enum(["retail", "residential", "industrial"]),
  kus: z.array(z.string().regex(/^\d{6}$/)).min(1).max(40),
  areaMin: z.number().int().min(100).max(500000),
  areaMax: z.number().int().min(100).max(1000000),
  access: z.array(z.object({
    dest: z.enum(BRIEF_DESTS), profile: z.enum(["car", "foot"]), limitS: z.number().int().min(60).max(3600),
  })).max(4).default([]),
  maxSlope: z.number().min(0).max(60).nullable().optional(),
  excludePpf: z.boolean().default(false),
  requireFrontage: z.boolean().default(false),
  otherReq: z.string().trim().max(2000).optional(),
};

export const createSearchBrief = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), ...briefFields }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    if (u.role === "viewer") return { ok: false, message: "Rola viewer nemôže zakladať zadania." };
    if (data.areaMin > data.areaMax) return { ok: false, message: "Výmera od je väčšia ako do." };
    const kus = [...new Set(data.kus)];
    const known = await q<{ ku_code: string }>(
      `SELECT ku_code FROM datasets WHERE ku_code IN (${kus.map(() => "?").join(",")})`, kus).catch(() => []);
    const missing = kus.filter((k) => !known.some((x) => x.ku_code === k));
    if (missing.length) return { ok: false, message: `K.ú. ${missing.join(", ")} nemá v appke importované dáta.` };
    const access = data.access.map((a) => ({ dest: a.dest, profile: a.profile, limit_s: a.limitS }));
    const r = await q<{ id: number }>(
      `INSERT INTO search_briefs (title,client,purpose,kus_json,area_min,area_max,access_json,max_slope,exclude_ppf,
                                  require_frontage,other_req,user_id,author)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [data.title, data.client || null, data.purpose, JSON.stringify(kus), data.areaMin, data.areaMax,
       access.length ? JSON.stringify(access) : null, data.maxSlope ?? null, data.excludePpf ? 1 : 0,
       data.requireFrontage ? 1 : 0, data.otherReq || null, u.id, u.name || u.email]);
    await logAudit("brief.create", u.role, `Zadanie hľadania #${r[0]?.id ?? "?"} (${data.purpose}, ${kus.length} k.ú.)`);
    return { ok: true, id: r[0]?.id };
  });

export const listSearchBriefs = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ access: boolean; briefs: SearchBrief[] }> => {
    const u = await requireUser(data.token);
    if (!u) return { access: false, briefs: [] };
    const briefs = await q<SearchBrief>(
      `SELECT sb.*,
              (SELECT COUNT(*) FROM brief_results br WHERE br.brief_id = sb.id AND br.verdict = 'MATCH') AS n_match,
              (SELECT COUNT(*) FROM brief_results br WHERE br.brief_id = sb.id AND br.verdict = 'PROVISIONAL') AS n_prov
       FROM search_briefs sb ORDER BY sb.id DESC LIMIT 100`).catch(() => []);
    return { access: true, briefs };
  });

export const getSearchBrief = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number().int() }))
  .handler(async ({ data }): Promise<{ access: boolean; brief: SearchBrief | null; results: BriefResult[]; owners: boolean; kuNames: Record<string, string> }> => {
    const u = await requireUser(data.token);
    if (!u) return { access: false, brief: null, results: [], owners: false, kuNames: {} };
    const brief = (await q<SearchBrief>("SELECT * FROM search_briefs WHERE id = ?", [data.id]).catch(() => []))[0] ?? null;
    if (!brief) return { access: true, brief: null, results: [], owners: false, kuNames: {} };
    let kus: string[] = [];
    try { kus = JSON.parse(brief.kus_json) as string[]; } catch { /* poškodené — ukáže sa prázdne */ }
    const names = kus.length ? await q<{ ku_code: string; ku_name: string }>(
      `SELECT ku_code, ku_name FROM datasets WHERE ku_code IN (${kus.map(() => "?").join(",")})`, kus).catch(() => []) : [];
    const rows = await q<BriefResult>(
      `SELECT br.kod_ku, COALESCE(ds.ku_name, br.ku_name) AS ku_name, br.verdict, br.quality, br.area_m2, br.n_parcels,
              br.parcels, br.shape, br.zone, br.build, br.access, br.slope, br.frontage, br.ppf, br.existing_use, br.druh,
              br.access_times, br.owners, br.n_owners, br.reason, ds.id AS dataset_id
       FROM brief_results br LEFT JOIN datasets ds ON ds.ku_code = br.kod_ku
       WHERE br.brief_id = ? ORDER BY (br.verdict = 'MATCH') DESC, br.quality DESC`, [data.id]).catch(() => []);
    // mená vlastníkov len pre rolu s plným prístupom (rola zo session, nie od klienta)
    const full = ownerAccess(u.role as Role) === "full";
    return {
      access: true, brief, owners: full,
      results: full ? rows : rows.map((r) => ({ ...r, owners: null })),
      kuNames: Object.fromEntries(names.map((n) => [n.ku_code, n.ku_name])),
    };
  });

// Zrušiť čakajúce / znova spustiť zlyhané alebo zrušené. Parametre sa nemenia — to robí nové zadanie.
export const setSearchBriefState = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), id: z.number().int(), action: z.enum(["cancel", "rerun"]) }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const u = await requireUser(data.token);
    if (!u) return { ok: false, message: "Neprihlásený." };
    if (u.role === "viewer") return { ok: false, message: "Rola viewer nemôže meniť zadania." };
    const r = data.action === "cancel"
      ? await q<{ id: number }>("UPDATE search_briefs SET status='cancelled', finished_at=datetime('now') WHERE id = ? AND status = 'pending' RETURNING id", [data.id])
      : await q<{ id: number }>("UPDATE search_briefs SET status='pending', error=NULL, progress=NULL, started_at=NULL, finished_at=NULL WHERE id = ? AND status IN ('failed','cancelled') RETURNING id", [data.id]);
    if (!r.length) return { ok: false, message: data.action === "cancel" ? "Zrušiť sa dá len zadanie, ktoré ešte čaká." : "Znova spustiť sa dá len zlyhané alebo zrušené zadanie." };
    await logAudit(`brief.${data.action}`, u.role, `Zadanie hľadania #${data.id}: ${data.action === "cancel" ? "zrušené" : "znova vo fronte"}`);
    return { ok: true };
  });

// Front pre Mac engine (auth = alert_secret). „running" dlhšie ako 6 h = prerušený beh (Mac zaspal,
// reštart) → vráti sa do fronty, inak by zadanie navždy ostalo „beží".
export const briefQueue = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    action: z.enum(["pending", "start", "progress", "finish", "fail"]),
    id: z.number().int().optional(),
    progress: z.string().max(300).optional(),
    error: z.string().max(1000).optional(),
    stats: z.string().max(200000).optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; started?: boolean; briefs?: SearchBrief[]; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    if (data.action === "pending") {
      await q("UPDATE search_briefs SET status='pending', progress='obnovené po prerušení' WHERE status='running' AND started_at < datetime('now','-6 hours')");
      return { ok: true, briefs: await q<SearchBrief>("SELECT * FROM search_briefs WHERE status = 'pending' ORDER BY id LIMIT 5") };
    }
    if (!data.id) return { ok: false, message: "Chýba id zadania." };
    if (data.action === "start") {
      // len ak medzitým nebolo zrušené; staré čiastkové výsledky (prerušený beh) sa zmažú
      const r = await q<{ id: number }>(
        "UPDATE search_briefs SET status='running', started_at=datetime('now'), progress=?, error=NULL WHERE id = ? AND status IN ('pending','running') RETURNING id",
        [data.progress ?? null, data.id]);
      if (r.length) await q("DELETE FROM brief_results WHERE brief_id = ?", [data.id]);
      return { ok: true, started: r.length > 0 };
    }
    if (data.action === "progress") {
      await q("UPDATE search_briefs SET progress=?, stats_json=COALESCE(?, stats_json) WHERE id = ? AND status='running'",
        [data.progress ?? null, data.stats ?? null, data.id]);
    } else if (data.action === "finish") {
      await q("UPDATE search_briefs SET status='done', progress=NULL, finished_at=datetime('now'), stats_json=COALESCE(?, stats_json) WHERE id = ?",
        [data.stats ?? null, data.id]);
    } else {
      await q("UPDATE search_briefs SET status='failed', finished_at=datetime('now'), error=? WHERE id = ?", [data.error ?? "neznáma chyba", data.id]);
    }
    return { ok: true };
  });

export const ingestBriefResults = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    briefId: z.number().int(),
    rows: z.array(z.object({
      kodKu: z.string(), kuName: z.string().optional(), verdict: z.enum(["MATCH", "PROVISIONAL"]),
      quality: z.number().optional(), areaM2: z.number().optional(), nParcels: z.number().optional(),
      parcels: z.string().optional(), shape: z.string().optional(), zone: z.string().optional(),
      build: z.string().optional(), access: z.number().optional(), slope: z.number().optional(),
      frontage: z.number().optional(), ppf: z.number().optional(), existingUse: z.string().optional(),
      druh: z.string().optional(), accessTimes: z.string().optional(), owners: z.string().optional(),
      nOwners: z.number().optional(), reason: z.string().optional(),
    })).max(1000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const st = (await q<{ status: string }>("SELECT status FROM search_briefs WHERE id = ?", [data.briefId]))[0]?.status;
    if (st !== "running") return { ok: false, message: `Zadanie #${data.briefId} nebeží (${st ?? "neexistuje"}).` };
    const stmt = DB.prepare(`INSERT INTO brief_results (brief_id,kod_ku,ku_name,verdict,quality,area_m2,n_parcels,parcels,shape,zone,build,
      access,slope,frontage,ppf,existing_use,druh,access_times,owners,n_owners,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const batch = data.rows.map((r) => stmt.bind(data.briefId, r.kodKu, r.kuName ?? null, r.verdict, r.quality ?? null,
      r.areaM2 ?? null, r.nParcels ?? null, r.parcels ?? null, r.shape ?? null, r.zone ?? null, r.build ?? null,
      r.access ?? null, r.slope ?? null, r.frontage ?? null, r.ppf ?? 0, r.existingUse ?? null, r.druh ?? null,
      r.accessTimes ?? null, r.owners ?? null, r.nOwners ?? null, r.reason ?? null));
    for (let i = 0; i < batch.length; i += 40) await DB.batch(batch.slice(i, i + 40));
    return { ok: true, inserted: data.rows.length };
  });

// ——— Export aktívnych inzerátov pre Mac (deal radar, opportunity engine) — rozhodnutie vlastníka 2026-11-11 ———
// Mac radar čítal vlastnú listings.db, ktorá sa od presunu zberu do cloudu (25. 9.) neaktualizovala →
// ranný Telegram hlásil „poklesy 0, nové 0". Teraz si Mac pred behom stiahne inzeráty z appky (jeden
// zdroj pravdy). Auth = alert_secret. Stránkovanie podľa (source, ext_id). Bez osobných údajov
// (inzeráty neobsahujú inzerenta).
export type MarketExportRow = {
  source: string; ext_id: string; url: string | null; title: string | null; ptype: string | null; deal: string | null;
  obec: string | null; psc: string | null; lat: number | null; lng: number | null; area_m2: number | null;
  price_eur: number | null; ppm2: number | null; first_seen: string | null; last_seen: string | null;
  first_price: number | null; okres: string | null; removed_at: string | null;
};
export const exportMarketListings = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(),
    sinceDays: z.number().int().min(1).max(120).default(45),
    after: z.object({ source: z.string(), extId: z.string() }).nullable().optional(),
    limit: z.number().int().min(1).max(5000).default(5000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; rows?: MarketExportRow[]; next?: { source: string; extId: string } | null; asOf?: string | null; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const asOf = (await q<{ d: string | null }>("SELECT MAX(last_seen) d FROM market_listings").catch(() => []))[0]?.d ?? null;
    if (!asOf) return { ok: true, rows: [], next: null, asOf: null };
    const cond = ["(last_seen >= date(?, ?) OR removed_at >= date(?, ?))"];
    const args: unknown[] = [asOf, `-${data.sinceDays} day`, asOf, `-${data.sinceDays} day`];
    if (data.after) { cond.push("(source > ? OR (source = ? AND ext_id > ?))"); args.push(data.after.source, data.after.source, data.after.extId); }
    const rows = await q<MarketExportRow>(
      `SELECT source, ext_id, url, title, ptype, deal, obec, psc, lat, lng, area_m2, price_eur, ppm2, first_seen, last_seen,
              first_price, okres, removed_at
       FROM market_listings WHERE ${cond.join(" AND ")} ORDER BY source, ext_id LIMIT ?`, [...args, data.limit]);
    const last = rows[rows.length - 1];
    return { ok: true, rows, asOf, next: rows.length === data.limit && last ? { source: last.source, extId: last.ext_id } : null };
  });

// ——— TELEGRAM: RANNÝ SÚHRN (rozhodnutie vlastníka 2026-11-11) ———
// Obsah: ① 50 najlepších ponúk dňa (najviac pod porovnateľnými + pokles ceny), ② všetka nová inzercia
// v okresoch Čadca, Kysucké Nové Mesto, Žilina podľa kategórií, ③ len REÁLNE udalosti územných plánov
// v týchto okresoch (začatie obstarávania, prerokovanie/pripomienky, schválenie), každá raz.
// Doručenie: Mac o 7:30, cloud ako záloha až od 7:45 (miestneho času) — kto pošle, najprv „zaberie"
// deň v tg_deliveries, takže súhrn nikdy nepríde dvakrát. Po odoslaní (ack) sa položky zaevidujú
// v tg_seen a ďalší deň sa neopakujú. Kupci a uložené hľadania idú okamžite cez /api/run-alerts.
const DIGEST_OKRESY = ["Čadca", "Kysucké Nové Mesto", "Žilina"];
const DIGEST_TOP = 50;
const TG_MAXLEN = 3800;
const PT_LABEL: Record<string, string> = { byt: "Byty", dom: "Domy", chata: "Chaty a chalupy", pozemok: "Pozemky" };
const PT_ICON: Record<string, string> = { byt: "🏢", dom: "🏠", chata: "🛖", pozemok: "🌳" };
const PT_ORDER = ["byt", "dom", "chata", "pozemok"];

function localNow(): { date: string; hm: string } {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());   // „2026-11-11 07:45"
  return { date: p.slice(0, 10), hm: p.slice(11, 16) };
}
// €/m² má zmysel len pri ÚŽITKOVEJ ploche. Pri domoch a chatách inzeráty často uvádzajú výmeru
// POZEMKU (1 580 m² „dom") → „−69 % pod porovnateľnými" by bol nezmysel (memory: €/m² meria veľkosť
// pozemku, nie hodnotu). Mimo rozsahu sa ponuka do top 50 dostane len poklesom ceny.
const USABLE: Record<string, [number, number]> = { byt: [15, 250], dom: [50, 350], chata: [15, 200] };
function comparable(pt: string | null, a: number | null): boolean {
  if (!a || a <= 5) return false;
  const r = USABLE[pt ?? ""];
  return !r || (a >= r[0] && a <= r[1]);
}
// Pozemky: stavebný vs. poľnohospodársky/les sa líšia rádovo — porovnávať v rámci druhu
function plotKind(title: string | null): string {
  const t = title ?? "";
  if (/stavebn|\bibv\b|rodinn\p{L}*\s+dom|novostavb|developer/iu.test(t)) return "st";
  if (/orn[áa]|poľnohosp|polnohosp|\bpole\b|ttp|tr[áa]vn|l[úu]k|pasien|les|lesn|sad\b|vinic|z[áa]hrad/iu.test(t)) return "ag";
  return "x";
}
function sizeBand(pt: string | null, a: number | null, title?: string | null): string {
  if (!a) return "?";
  if (pt === "pozemok") return `${plotKind(title ?? null)}-${a < 800 ? "s" : a < 2000 ? "m" : a < 10000 ? "l" : "xl"}`;
  if (pt === "byt") return a < 45 ? "s" : a < 75 ? "m" : a < 110 ? "l" : "xl";
  if (pt === "dom") return a < 120 ? "s" : a < 200 ? "m" : a < 400 ? "l" : "xl";
  if (pt === "chata") return a < 60 ? "s" : a < 120 ? "m" : "l";
  return a < 800 ? "s" : a < 2000 ? "m" : a < 10000 ? "l" : "xl";
}
const eurSk = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} €`);
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
function splitTg(lines: string[]): string[] {
  const out: string[] = []; let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > TG_MAXLEN) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + l.slice(0, TG_MAXLEN);
  }
  if (cur) out.push(cur);
  return out;
}
// Udalosti ÚP: titulok musí byť o územnom pláne A o udalosti; súbory „Stiahnuť súbor …" sú prílohy.
// \b v JS nepozná diakritiku („ÚPN" by nenašiel) → hranice slova cez lookaround na \p{L}
const UP_TERM = /[úu]zemn\p{L}*\s+pl[áa]n|(?<!\p{L})[úu]pn(?!\p{L})|zmien\p{L}*\s+a\s+doplnk|zmeny\s+a\s+doplnky|(?<!\p{L})z\s*a\s*d(?!\p{L})|(?<!\p{L})zad(?!\p{L})/iu;
const UP_EVENTS: { re: RegExp; icon: string; label: string }[] = [
  { re: /v\s+znen[íi]|schv[áa]l|uznesen|(?<!\p{L})vzn(?!\p{L})|v[šs]eobecne\s+z[áa]v[äa]zn|z[áa]v[äa]zn[áa]\s+[čc]as[ťt]/iu, icon: "✅", label: "schválenie / platné znenie" },
  { re: /presk[úu]man|§\s*25|prerokovan|pripomienk|stanovisk|n[áa]vrh\s+(?:zmien|[úu]zemn|zad|z\s*a\s*d)|verejn[áéý]\s+vyhl[áa][šs]k/iu, icon: "🗣️", label: "návrh / prerokovanie / pripomienky" },
  { re: /za[čc]at\p{L}*\s+obstar|obstar[áa]van|ozn[áa]menie\s+o\s+za[čc]at|zadanie\s+pre/iu, icon: "📣", label: "začatie obstarávania" },
];
// → udalosť | "doc" (súbor dokumentácie ÚP, zoskupí sa po obci) | null (nie je o ÚP / starý dokument)
function upEvent(title: string): { icon: string; label: string } | "doc" | null {
  const t = (title ?? "").trim();
  if (!t || !UP_TERM.test(t)) return null;
  // „bez informácií dookola": dokument, ktorý nesie len staré roky (VZN 3/2021…), obec len znova nahrala
  const years = [...t.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) < new Date().getFullYear() - 1) return null;
  for (const e of UP_EVENTS) if (e.re.test(t)) return { icon: e.icon, label: e.label };
  return "doc";
}
type DigestRow = { source: string; ext_id: string; url: string | null; title: string | null; ptype: string | null; deal: string | null;
  obec: string | null; okres: string | null; area_m2: number | null; price_eur: number | null; ppm2: number | null;
  first_seen: string | null; first_price: number | null };

async function buildMorningDigest(): Promise<{ messages: string[]; keys: string[]; stats: Record<string, number | string | null> }> {
  const { date: today } = localNow();
  const asOf = (await q<{ d: string | null }>("SELECT MAX(last_seen) d FROM market_listings").catch(() => []))[0]?.d ?? null;
  const seen = new Set((await q<{ k: string }>("SELECT k FROM tg_seen WHERE first_at >= datetime('now','-90 day')").catch(() => [])).map((r) => r.k));
  // zdroje, ktoré zbierame menej ako 7 dní, nemajú dátum vloženia → ich „nové" by bol celý katalóg
  const young = new Set((await q<{ source: string }>(
    "SELECT source FROM market_listings GROUP BY source HAVING MIN(first_seen) > date(?, '-7 day')", [today]).catch(() => [])).map((r) => r.source));
  const keys: string[] = [];
  const lines: string[] = [];
  const day = today.split("-").reverse().join(". ").replace(/^0/, "");
  lines.push(`🌅 Ranný radar · ${day}${asOf ? ` · inzercia k ${asOf.split("-").reverse().join(". ")}` : ""}`);
  if (asOf && (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${asOf}T12:00:00Z`)) / 86400000 >= 2) {
    lines.push("⚠️ Dáta inzercie sú staršie ako 2 dni — zber neprebehol, súhrn je neúplný.");
  }
  const dk = (r: DigestRow) => `${(r.obec ?? "").toLowerCase()}|${r.ptype}|${Math.round((r.area_m2 ?? 0) / 10)}|${Math.round((r.price_eur ?? 0) / 1000)}`;

  // ① TOP 50 — porovnateľné = rovnaký okres + typ + veľkostné pásmo, aktívne inzeráty za 21 dní
  let nTop = 0;
  if (asOf) {
    const comp = await q<{ okres: string; ptype: string; area_m2: number; ppm2: number; title: string | null }>(
      `SELECT okres, ptype, area_m2, ppm2, CASE WHEN ptype='pozemok' THEN title END AS title FROM market_listings
       WHERE deal='predaj' AND removed_at IS NULL
         AND last_seen >= date(?, '-21 day') AND ppm2 > 0 AND area_m2 > 5 AND okres IS NOT NULL`, [asOf]).catch(() => []);
    const grp = new Map<string, number[]>();
    for (const c of comp) {
      if (!comparable(c.ptype, c.area_m2)) continue;
      const kind = c.ptype === "pozemok" ? plotKind(c.title) : "";
      for (const k of [`${c.okres}|${c.ptype}|${sizeBand(c.ptype, c.area_m2, c.title)}`, `${c.okres}|${c.ptype}|${kind}*`]) {
        if (!grp.has(k)) grp.set(k, []);
        grp.get(k)!.push(c.ppm2);
      }
    }
    const med = new Map<string, number>();
    for (const [k, v] of grp) if (v.length >= 8) med.set(k, median(v));
    const cand = await q<DigestRow>(
      `SELECT source, ext_id, url, title, ptype, deal, obec, okres, area_m2, price_eur, ppm2, first_seen, first_price
       FROM market_listings WHERE deal='predaj' AND removed_at IS NULL AND last_seen >= date(?, '-1 day')
         AND ppm2 > 0 AND area_m2 > 5 AND okres IS NOT NULL
         AND (first_seen >= date(?, '-3 day') OR (first_price > price_eur))`, [asOf, today]).catch(() => []);
    const scored: { r: DigestRow; below: number; drop: number; score: number; key: string }[] = [];
    const used = new Set<string>();
    for (const r of cand) {
      if (young.has(r.source) && !(r.first_price != null && r.price_eur != null && r.first_price > r.price_eur)) continue;
      const stavba = r.ptype !== "pozemok";
      if (!r.price_eur || r.price_eur < (stavba ? 15000 : 3000)) continue;
      const kind = r.ptype === "pozemok" ? plotKind(r.title) : "";
      const m = comparable(r.ptype, r.area_m2)
        ? med.get(`${r.okres}|${r.ptype}|${sizeBand(r.ptype, r.area_m2, r.title)}`) ?? med.get(`${r.okres}|${r.ptype}|${kind}*`)
        : undefined;
      const below = m && r.ppm2 ? ((m - r.ppm2) / m) * 100 : 0;
      const drop = r.first_price && r.first_price > r.price_eur ? ((r.first_price - r.price_eur) / r.first_price) * 100 : 0;
      if (below > 70 || drop > 60) continue;                       // takmer isto chyba údajov
      const score = (Math.min(Math.max(below, 0), 60) / 60) * 65 + (Math.min(drop, 30) / 30) * 35;
      if (score < 15) continue;
      const key = `T:${r.source}:${r.ext_id}:${Math.round(r.price_eur)}`;
      if (seen.has(key)) continue;
      scored.push({ r, below, drop, score, key });
    }
    scored.sort((a, b) => b.score - a.score);
    const top: typeof scored = [];
    for (const x of scored) {
      const d = dk(x.r);
      if (used.has(d)) continue;                                   // ten istý inzerát na viacerých portáloch
      used.add(d); top.push(x);
      if (top.length >= DIGEST_TOP) break;
    }
    nTop = top.length;
    lines.push("", `💎 ${top.length ? `${top.length} najlepších ponúk dňa` : "Najlepšie ponuky dňa"} (cena voči porovnateľným v okrese, pokles ceny)`);
    if (!top.length) lines.push("— dnes žiadna výrazne výhodná nová ponuka");
    top.forEach((x, i) => {
      const r = x.r;
      lines.push(`${i + 1}. ${PT_ICON[r.ptype ?? ""] ?? "•"} ${r.obec ?? "?"}${r.okres && r.okres !== r.obec ? ` (${r.okres})` : ""} · ${eurSk(r.price_eur)} · ${Math.round(r.area_m2 ?? 0)} m² · ${Math.round(r.ppm2 ?? 0)} €/m²`
        + `${x.below >= 1 ? ` · −${Math.round(x.below)} % pod porovn.` : ""}${x.drop >= 1 ? ` · ↓${Math.round(x.drop)} %` : ""}`);
      if (r.url) lines.push(`   ${r.url}`);
      keys.push(x.key);
    });
  }

  // ② NOVÁ INZERCIA v okresoch súhrnu (predaj aj prenájom), podľa okresu a kategórie
  let nNew = 0;
  if (asOf) {
    const rows = await q<DigestRow>(
      `SELECT source, ext_id, url, title, ptype, deal, obec, okres, area_m2, price_eur, ppm2, first_seen, first_price
       FROM market_listings WHERE removed_at IS NULL AND first_seen >= date(?, '-2 day')
         AND okres IN (${DIGEST_OKRESY.map(() => "?").join(",")}) ORDER BY price_eur`, [today, ...DIGEST_OKRESY]).catch(() => []);
    const used = new Set<string>();
    const by = new Map<string, Map<string, DigestRow[]>>();
    for (const r of rows) {
      if (young.has(r.source)) continue;
      const key = `L:${r.source}:${r.ext_id}`;
      if (seen.has(key)) continue;
      const d = `${dk(r)}|${r.deal}`;
      if (used.has(d)) continue;
      used.add(d); keys.push(key);
      const ok = r.okres ?? "?"; const pt = PT_ORDER.includes(r.ptype ?? "") ? r.ptype! : "ine";
      if (!by.has(ok)) by.set(ok, new Map());
      if (!by.get(ok)!.has(pt)) by.get(ok)!.set(pt, []);
      by.get(ok)!.get(pt)!.push(r);
      nNew++;
    }
    for (const okres of DIGEST_OKRESY) {
      const cats = by.get(okres);
      const n = cats ? [...cats.values()].reduce((a, v) => a + v.length, 0) : 0;
      lines.push("", `🆕 Nová inzercia — okres ${okres} (${n})`);
      if (!cats) { lines.push("— dnes nič nové"); continue; }
      for (const pt of [...PT_ORDER, "ine"]) {
        const list = cats.get(pt);
        if (!list?.length) continue;
        lines.push(`${PT_ICON[pt] ?? "•"} ${PT_LABEL[pt] ?? "Ostatné"} (${list.length})`);
        for (const r of list) {
          lines.push(`• ${(r.title ?? "").slice(0, 70)} · ${r.obec ?? ""} · ${eurSk(r.price_eur)}${r.area_m2 ? ` · ${Math.round(r.area_m2)} m²` : ""}${r.deal === "prenajom" ? " · prenájom" : ""}`);
          if (r.url) lines.push(`   ${r.url}`);
        }
      }
    }
  }

  // ③ ÚZEMNÉ PLÁNY — len reálne udalosti v okresoch súhrnu, každá raz
  const up = await q<{ obec: string; okres: string | null; title: string | null; url: string | null; detected_at: string | null }>(
    `SELECT obec, okres, title, url, detected_at FROM obec_changes WHERE change='new' AND detected_at >= datetime('now','-10 day')
       AND okres IN (${DIGEST_OKRESY.map(() => "?").join(",")}) ORDER BY detected_at`, DIGEST_OKRESY).catch(() => []);
  const upLines: string[] = [];
  const upUsed = new Set<string>();
  // sada súborov dokumentácie (výkresy „…_zad_4_c", textová časť…) v jednej obci a dni = JEDNA správa
  const docs = new Map<string, { obec: string; okres: string | null; n: number; zad: string | null; url: string | null }>();
  for (const c of up) {
    const ev = upEvent(c.title ?? "");
    if (!ev) continue;
    if (ev === "doc") {
      const g = `${c.obec}|${(c.detected_at ?? "").slice(0, 10)}`;
      const zad = (c.title ?? "").match(/(?:zad|zmeny\s+a\s+doplnky\s+č\.?)[\s_-]*(\d{1,2})/i)?.[1] ?? null;
      const d = docs.get(g) ?? { obec: c.obec, okres: c.okres, n: 0, zad, url: c.url };
      d.n++; d.zad = d.zad ?? zad; docs.set(g, d);
      continue;
    }
    const key = `U:${c.obec}|${(c.title ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 160)}`;
    if (seen.has(key) || upUsed.has(key)) continue;
    upUsed.add(key); keys.push(key);
    const term = (c.title ?? "").match(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(20\d{2})\b/);
    upLines.push(`${ev.icon} ${c.obec} (${c.okres}) — ${ev.label}: ${(c.title ?? "").slice(0, 140)}${term && ev.icon === "🗣️" ? ` · termín ${term[0]}` : ""}`);
    if (c.url) upLines.push(`   ${c.url}`);
  }
  for (const d of docs.values()) {
    if (d.n < 3) continue;                                         // jednotlivý súbor bez udalosti = šum
    const key = `U:${d.obec}|doc|${d.zad ?? "?"}`;
    if (seen.has(key) || upUsed.has(key)) continue;
    upUsed.add(key); keys.push(key);
    upLines.push(`📐 ${d.obec} (${d.okres}) — zverejnená dokumentácia ÚP${d.zad ? ` (zmeny a doplnky č. ${d.zad})` : ""}: ${d.n} súborov`);
    if (d.url) upLines.push(`   ${d.url}`);
  }
  lines.push("", `🗺️ Územné plány — ${DIGEST_OKRESY.join(", ")}`);
  if (upLines.length) lines.push(...upLines); else lines.push("— žiadna nová udalosť (obstarávanie, prerokovanie, schválenie)");

  return { messages: splitTg(lines), keys, stats: { asOf, top: nTop, new: nNew, up: upLines.filter((l) => !l.startsWith("   ")).length } };
}

export const tgDigest = createServerFn({ method: "POST" })
  .validator(z.object({ secret: z.string(), action: z.enum(["claim", "ack", "fail", "preview"]), runner: z.enum(["mac", "cloud"]).default("mac") }))
  .handler(async ({ data }): Promise<{ ok: boolean; claimed?: boolean; key?: string; reason?: string; messages?: string[]; stats?: Record<string, number | string | null>; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { date, hm } = localNow();
    const key = `digest:${date}`;
    if (data.action === "preview") {
      const d = await buildMorningDigest();
      return { ok: true, key, messages: d.messages, stats: d.stats };
    }
    if (data.action === "ack") {
      const row = (await q<{ info: string | null }>("SELECT info FROM tg_deliveries WHERE key = ?", [key]))[0];
      await q("UPDATE tg_deliveries SET status='sent', sent_at=datetime('now') WHERE key = ?", [key]);
      let ks: string[] = [];
      try { ks = row?.info ? (JSON.parse(row.info) as string[]) : []; } catch { /* nič */ }
      const { DB } = bindings();
      if (DB && ks.length) {
        const st = DB.prepare("INSERT OR IGNORE INTO tg_seen (k) VALUES (?)");
        const b = ks.map((k) => st.bind(k));
        for (let i = 0; i < b.length; i += 50) await DB.batch(b.slice(i, i + 50));
      }
      await q("DELETE FROM tg_seen WHERE first_at < datetime('now','-120 day')").catch(() => {});
      return { ok: true, key };
    }
    if (data.action === "fail") {                  // odoslanie zlyhalo → uvoľni deň, nech to skúsi druhý
      await q("DELETE FROM tg_deliveries WHERE key = ? AND status = 'claimed'", [key]);
      return { ok: true, key };
    }
    // claim — cloud je len záloha: pred 7:45 miestneho času čaká na Mac
    if (data.runner === "cloud" && hm < "07:45") return { ok: true, claimed: false, key, reason: "pred 7:45 posiela Mac" };
    if (hm < "06:30") return { ok: true, claimed: false, key, reason: "pred 6:30 sa súhrn neposiela" };
    const ex = (await q<{ status: string; claimed_at: string | null }>("SELECT status, claimed_at FROM tg_deliveries WHERE key = ?", [key]))[0];
    if (ex?.status === "sent") return { ok: true, claimed: false, key, reason: "dnešný súhrn už bol odoslaný" };
    if (ex?.status === "claimed") {
      // zaberaný a neodoslaný viac ako 20 min = odosielateľ spadol → môže ho prevziať druhý
      const stale = (await q<{ s: number }>("SELECT (julianday('now') - julianday(?)) * 1440 > 20 AS s", [ex.claimed_at]))[0]?.s;
      if (!stale) return { ok: true, claimed: false, key, reason: "súhrn práve posiela iný odosielateľ" };
      await q("DELETE FROM tg_deliveries WHERE key = ? AND status = 'claimed'", [key]);
    }
    const got = await q<{ key: string }>(
      "INSERT OR IGNORE INTO tg_deliveries (key, runner, status, claimed_at) VALUES (?, ?, 'claimed', datetime('now')) RETURNING key",
      [key, data.runner]);
    if (!got.length) return { ok: true, claimed: false, key, reason: "súhrn práve posiela iný odosielateľ" };
    try {
      const d = await buildMorningDigest();
      await q("UPDATE tg_deliveries SET info = ? WHERE key = ?", [JSON.stringify(d.keys), key]);
      return { ok: true, claimed: true, key, messages: d.messages, stats: d.stats };
    } catch (e) {
      await q("DELETE FROM tg_deliveries WHERE key = ? AND status = 'claimed'", [key]);
      return { ok: false, message: `súhrn sa nepodarilo zostaviť: ${e instanceof Error ? e.message : "chyba"}` };
    }
  });

// ——— LV časti: parcely C/E pri LV + stavby so súpisným číslom (Mac → /api/ingest-lvparts, migrácia 0097) ———
// Dovtedy D1 mala len parcely C s obrysom (z mapy) → LV založené na parcelách E nemali výpis časti A,
// vyhľadávanie „E 1500" ani stavby „s.č. 563". reset = zmaž časti k.ú. pred prvou dávkou (dávky po 2 000).
export const ingestLvParts = createServerFn({ method: "POST" })
  .validator(z.object({
    secret: z.string(), kodKu: z.string().regex(/^\d{6}$/), reset: z.boolean().optional(),
    lvParcels: z.array(z.object({
      lvNo: z.number().int(), register: z.enum(["C", "E"]), parcelNo: z.string().min(1).max(30),
      areaM2: z.number().nullable().optional(), drpCode: z.number().int().nullable().optional(), drpText: z.string().max(80).nullable().optional(),
      placement: z.string().max(60).nullable().optional(),   // SPI ump: v / mimo zastavaného územia obce
    })).max(3000).optional(),
    buildings: z.array(z.object({
      lvNo: z.number().int(), descr: z.string().min(1).max(200), onParcel: z.string().max(30).nullable().optional(),
      supisneCislo: z.string().max(20).nullable().optional(),
    })).max(3000).optional(),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; inserted?: number; message?: string }> => {
    const want = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='alert_secret'").catch(() => []))[0]?.value;
    if (!secretEq(data.secret, want)) return { ok: false, message: "unauthorized" };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const did = `kn-${data.kodKu}`;
    if (data.reset) {
      await DB.batch([DB.prepare("DELETE FROM lv_parcels WHERE dataset_id=?").bind(did), DB.prepare("DELETE FROM lv_buildings WHERE dataset_id=?").bind(did)]);
    }
    const ps = DB.prepare("INSERT INTO lv_parcels (dataset_id,lv_no,register,parcel_no,area_m2,drp_code,drp_text,placement) VALUES (?,?,?,?,?,?,?,?)");
    const bs = DB.prepare("INSERT INTO lv_buildings (dataset_id,lv_no,descr,on_parcel,supisne_cislo) VALUES (?,?,?,?,?)");
    const stmts = [
      ...(data.lvParcels ?? []).map((p) => ps.bind(did, p.lvNo, p.register, p.parcelNo, Math.round(p.areaM2 ?? 0), p.drpCode ?? null, p.drpText ?? null, p.placement ?? null)),
      ...(data.buildings ?? []).map((b) => bs.bind(did, b.lvNo, b.descr, b.onParcel ?? null, b.supisneCislo ?? null)),
    ];
    for (let i = 0; i < stmts.length; i += 100) await DB.batch(stmts.slice(i, i + 100));
    return { ok: true, inserted: stmts.length };
  });

// ——— MAPA AKO ZBGIS: vyhľadávanie (zamknuté k.ú.), objekt na mapu, identifikácia v bode ———
// Zadanie vlastníka 2026-11-11: zamknúť k.ú. a napísať číslo → parcela C / E, LV, stavba (súpisné č.),
// vlastník (len plný prístup) → priblíži, zvýrazní a ukáže LV s tlačou/PDF; klik kdekoľvek v našich
// k.ú. (nie len v načítanom) ukáže našu parcelu a LV; parcela C bez LV → LV parciel E pod ňou.
export type MapHit = {
  kind: "ku" | "C" | "E" | "LV" | "SC" | "owner"; label: string; sub: string;
  datasetId: string; kuCode: string; no?: string | null; lvNo?: number | null;
};
export type MapRing = [number, number][];
export type MapFeature = {
  ok: boolean; message?: string; kind?: string; datasetId?: string; kuName?: string | null; no?: string | null;
  lvNo?: number | null; areaM2?: number | null; druh?: string | null; rings?: MapRing[];
  center?: { lat: number; lng: number } | null; building?: string | null;
  eUnder?: { no: string; lvNo: number | null; areaM2: number | null }[];
};
const MAP_NUM = /^\d+(?:\/\d+)?$/;
const normTxt = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function geoRings(g: string | null): MapRing[] {
  if (!g) return [];
  try {
    const o = JSON.parse(g) as { type?: string; coordinates?: unknown };
    if (o.type === "Polygon") return (o.coordinates as MapRing[]) ?? [];
    if (o.type === "MultiPolygon") return ((o.coordinates as MapRing[][]) ?? []).flat();
  } catch { /* nič */ }
  return [];
}
function ringsCenter(rs: MapRing[]): { lat: number; lng: number } | null {
  const pts = rs.flat(); if (!pts.length) return null;
  let a = 0, b = 0; for (const [x, y] of pts) { a += x; b += y; }
  return { lng: a / pts.length, lat: b / pts.length };
}
async function eskn(url: string, ms = 12000): Promise<Record<string, unknown>> {
  return (asObj(await fetchJsonTimed(url, ms)) ?? {}) as Record<string, unknown>;
}
const esknRings = (geom: unknown): MapRing[] => ((asObj(geom)?.rings as MapRing[] | undefined) ?? []);
async function datasetBbox(did: string): Promise<[number, number, number, number] | null> {
  const r = (await q<{ a: number | null; b: number | null; c: number | null; d: number | null }>(
    "SELECT MIN(centroid_lng) a, MIN(centroid_lat) b, MAX(centroid_lng) c, MAX(centroid_lat) d FROM parcels WHERE dataset_id = ? AND centroid_lat IS NOT NULL", [did]))[0];
  return r && r.a != null && r.b != null && r.c != null && r.d != null ? [r.a - 0.01, r.b - 0.01, r.c + 0.01, r.d + 0.01] : null;
}

// Interné ESKN ID k.ú. (CADASTRAL_UNIT_ID) pre náš dataset — z identifikácie niekoľkých našich parciel C.
// Bez neho sa parcela E hľadala podľa čísla v obdĺžniku okolo k.ú. a mohla sa vziať zo susedného k.ú.
async function esknUnitOf(did: string): Promise<number | null> {
  const key = `eskn-unit:${did}`;
  const c = await regCacheRead(key, false, 30 * 24 * 3600).catch(() => null);
  const cu = (c?.payload as { unit?: number } | undefined)?.unit;
  if (cu) return cu;
  const ps = await q<{ parcel_no: string; centroid_lat: number; centroid_lng: number }>(
    "SELECT parcel_no, centroid_lat, centroid_lng FROM parcels WHERE dataset_id = ? AND centroid_lat IS NOT NULL AND area_m2 > 1500 AND kn_type NOT LIKE 'E%' LIMIT 4", [did]).catch(() => []);
  for (const p of ps) {
    const dd = 0.0008, ext = `${p.centroid_lng - dd},${p.centroid_lat - dd},${p.centroid_lng + dd},${p.centroid_lat + dd}`;
    try {
      const j = await eskn(`https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer/identify?geometry=${p.centroid_lng},${p.centroid_lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:9&tolerance=1&mapExtent=${ext}&imageDisplay=800,600,96&returnGeometry=false&f=json`, 9000);
      for (const r of Array.isArray(j.results) ? j.results : []) {
        const a = asObj(asObj(r)?.attributes) ?? {};
        if (String(a["Parcelné číslo"] ?? "") === p.parcel_no) {
          const unit = Number(a["Identifikátor katastrálneho územia"]);
          if (Number.isFinite(unit) && unit > 0) { await regCacheWrite(key, "eskn-unit", { unit }).catch(() => {}); return unit; }
        }
      }
    } catch { /* ďalšia parcela */ }
  }
  return null;
}
// ESKN blokuje operáciu /query (HTTP 403 — overené 2026-11-11); povolené sú identify, find a export.
// Parcela podľa čísla: find (bez geometrie, celé SR) → výber podľa ID k.ú. → rozsah (XMIN.. v 3857) →
// identify v strede rozsahu → presný obrys. Pri konkávnej parcele môže stred padnúť mimo — vtedy
// ostane aspoň stred na priblíženie.
const numA = (v: unknown) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const merc2ll = (x: number, y: number) => ({ lng: (x / 6378137) * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI });
async function esknFindParcel(reg: "C" | "E", unit: number | null, no: string): Promise<{ rings: MapRing[]; center: { lat: number; lng: number } } | null> {
  const svc = reg === "C" ? "kn" : "uo", lid = reg === "C" ? 9 : 2, field = reg === "C" ? "PARCEL_NUMBER_LABEL" : "PARCEL_NUMBER_FULL";
  const j = await eskn(`https://kataster.skgeodesy.sk/eskn/rest/services/VRM/${svc}/MapServer/find?searchText=${encodeURIComponent(no)}&contains=false&searchFields=${field}&layers=${lid}&returnGeometry=false&f=json`, 20000);
  const hit = (Array.isArray(j.results) ? j.results : []).map((r) => asObj(r) ?? {}).find((r) => {
    if (String(r.value ?? "") !== no) return false;
    const a = asObj(r.attributes) ?? {};
    return unit == null || String(a.CADASTRAL_UNIT_ID ?? a["Identifikátor katastrálneho územia"] ?? "") === String(unit);
  });
  if (!hit) return null;
  const a = asObj(hit.attributes) ?? {};
  const x0 = numA(a.XMIN), x1 = numA(a.XMAX), y0 = numA(a.YMIN), y1 = numA(a.YMAX);
  if (x0 == null || x1 == null || y0 == null || y1 == null) return null;
  const center = merc2ll((x0 + x1) / 2, (y0 + y1) / 2);
  let rings: MapRing[] = [];
  try {
    const dd = 0.0015, ext = `${center.lng - dd},${center.lat - dd},${center.lng + dd},${center.lat + dd}`;
    const idj = await eskn(`https://kataster.skgeodesy.sk/eskn/rest/services/VRM/${svc}/MapServer/identify?geometry=${center.lng},${center.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:${lid}&tolerance=1&mapExtent=${ext}&imageDisplay=800,600,96&returnGeometry=true&f=json`);
    const m = (Array.isArray(idj.results) ? idj.results : []).map((r) => asObj(r) ?? {}).find((r) => {
      const ra = asObj(r.attributes) ?? {};
      return String(ra.PARCEL_NUMBER_FULL ?? ra["Parcelné číslo"] ?? "") === no;
    });
    if (m) rings = esknRings(m.geometry);
  } catch { /* bez obrysu */ }
  if (!rings.length) {   // aspoň obdĺžnik rozsahu, nech je čo zvýrazniť
    const p0 = merc2ll(x0, y0), p1 = merc2ll(x1, y1);
    rings = [[[p0.lng, p0.lat], [p1.lng, p0.lat], [p1.lng, p1.lat], [p0.lng, p1.lat], [p0.lng, p0.lat]]];
  }
  return { rings, center };
}
async function esknEParcels(did: string, nos: string[]): Promise<MapRing[]> {
  if (!nos.length) return [];
  const unit = await esknUnitOf(did);
  if (unit == null) return [];              // bez ID k.ú. by find vrátil rovnaké číslo z ľubovoľného k.ú. SR
  const out: MapRing[] = [];
  for (const no of nos.slice(0, 12)) {      // každé číslo = 2 dopyty na ESKN → strop
    try { const f = await esknFindParcel("E", unit, no); if (f) out.push(...f.rings); } catch { /* ďalšie */ }
  }
  return out;
}

export const mapSearch = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().optional(), q: z.string().max(120), ku: z.string().regex(/^\d{6}$/).optional() }))
  .handler(async ({ data }): Promise<{ hits: MapHit[]; needLock?: boolean }> => {
    const full = ownerAccess(await roleFromToken(data.token)) === "full";
    const sup = full ? await suppressedNameSet() : new Set<string>();   // GDPR námietka → meno sa nehľadá
    let qq = data.q.trim();
    let kind: MapHit["kind"] | null = null;
    // skratky ako v ZBGIS: „c 1500", „e 1500", „lv 1500", „sc 563" / „s.č. 563"
    const pm = qq.match(/^(c|e|lv|sc|s\.?\s?[čc]\.?|s[úu]p\.?)\s*[:.]?\s*(\d.*)$/i);
    if (pm) { const k = pm[1].toLowerCase(); kind = k === "c" ? "C" : k === "e" ? "E" : k === "lv" ? "LV" : "SC"; qq = pm[2].trim(); }
    const ds = await q<{ id: string; ku_code: string; ku_name: string; region: string | null }>("SELECT id, ku_code, ku_name, region FROM datasets").catch(() => []);
    const kuOf = (id: string) => ds.find((d) => d.id === id);
    const hits: MapHit[] = [];
    if (!data.ku) {
      const nq = normTxt(qq);
      if (nq.length >= 2) {
        for (const d of ds) {
          if (normTxt(d.ku_name).includes(nq) || d.ku_code.startsWith(qq)) {
            hits.push({ kind: "ku", label: d.ku_name, sub: `k.ú. ${d.ku_code}${d.region ? ` · ${d.region.split("·")[0].trim()}` : ""}`, datasetId: d.id, kuCode: d.ku_code });
          }
        }
      }
      if (full && qq.length >= 3 && !MAP_NUM.test(qq)) {
        const ow = await q<{ dataset_id: string; lv_no: number; name: string }>(
          "SELECT dataset_id, lv_no, name FROM lv_owners WHERE name LIKE ? LIMIT 12", [`%${qq}%`]).catch(() => []);
        for (const o of ow) { const d = kuOf(o.dataset_id); if (d && !sup.has(normName(o.name))) hits.push({ kind: "owner", label: o.name, sub: `LV ${o.lv_no} · ${d.ku_name}`, datasetId: d.id, kuCode: d.ku_code, lvNo: o.lv_no }); }
      }
      return { hits: hits.slice(0, 24), needLock: MAP_NUM.test(qq) };
    }
    const d = ds.find((x) => x.ku_code === data.ku);
    if (!d) return { hits: [] };
    const did = d.id;
    if (MAP_NUM.test(qq)) {
      const like = `${qq}/%`;
      if (!kind || kind === "C") {
        const cs = await q<{ parcel_no: string; lv_no: number | null; area_m2: number; use_type: string | null }>(
          `SELECT parcel_no, lv_no, area_m2, use_type FROM parcels WHERE dataset_id = ? AND kn_type NOT LIKE 'E%' AND (parcel_no = ? OR parcel_no LIKE ?)
           ORDER BY (parcel_no = ?) DESC, LENGTH(parcel_no), parcel_no LIMIT 8`, [did, qq, like, qq]).catch(() => []);
        for (const c of cs) hits.push({ kind: "C", label: `parcela C ${c.parcel_no}`, sub: `${c.area_m2.toLocaleString("sk-SK")} m²${c.use_type ? ` · ${c.use_type}` : ""}${c.lv_no ? ` · LV ${c.lv_no}` : " · bez LV"}`, datasetId: did, kuCode: d.ku_code, no: c.parcel_no, lvNo: c.lv_no });
      }
      if (!kind || kind === "E") {
        const es = await q<{ parcel_no: string; lv_no: number; area_m2: number; drp_text: string | null }>(
          `SELECT parcel_no, lv_no, area_m2, drp_text FROM lv_parcels WHERE dataset_id = ? AND register = 'E' AND (parcel_no = ? OR parcel_no LIKE ?)
           ORDER BY (parcel_no = ?) DESC, LENGTH(parcel_no), parcel_no LIMIT 8`, [did, qq, like, qq]).catch(() => []);
        for (const e of es) hits.push({ kind: "E", label: `parcela E ${e.parcel_no}`, sub: `${e.area_m2.toLocaleString("sk-SK")} m²${e.drp_text ? ` · ${e.drp_text}` : ""} · LV ${e.lv_no}`, datasetId: did, kuCode: d.ku_code, no: e.parcel_no, lvNo: e.lv_no });
      }
      if ((!kind || kind === "LV") && !qq.includes("/")) {
        const lv = Number(qq);
        const n = (await q<{ n: number }>("SELECT COUNT(*) n FROM lv_parcels WHERE dataset_id = ? AND lv_no = ?", [did, lv]).catch(() => []))[0]?.n ?? 0;
        const own = (await q<{ n: number }>("SELECT COUNT(*) n FROM lv_owners WHERE dataset_id = ? AND lv_no = ?", [did, lv]).catch(() => []))[0]?.n ?? 0;
        if (n || own) hits.push({ kind: "LV", label: `LV č. ${lv}`, sub: `${n} parciel · ${own} vlastníkov`, datasetId: did, kuCode: d.ku_code, lvNo: lv });
      }
      if ((!kind || kind === "SC") && !qq.includes("/")) {
        const bs = await q<{ descr: string; on_parcel: string | null; lv_no: number }>(
          "SELECT descr, on_parcel, lv_no FROM lv_buildings WHERE dataset_id = ? AND supisne_cislo = ? LIMIT 8", [did, qq]).catch(() => []);
        for (const b of bs) hits.push({ kind: "SC", label: `stavba s. č. ${qq}`, sub: `${b.descr}${b.on_parcel ? ` · na parc. C ${b.on_parcel}` : ""} · LV ${b.lv_no}`, datasetId: did, kuCode: d.ku_code, no: b.on_parcel, lvNo: b.lv_no });
      }
    } else if (qq.length >= 3 && full) {
      const ow = await q<{ lv_no: number; name: string }>(
        "SELECT lv_no, name FROM lv_owners WHERE dataset_id = ? AND name LIKE ? LIMIT 12", [did, `%${qq}%`]).catch(() => []);
      for (const o of ow) if (!sup.has(normName(o.name))) hits.push({ kind: "owner", label: o.name, sub: `LV ${o.lv_no}`, datasetId: did, kuCode: d.ku_code, lvNo: o.lv_no });
    }
    return { hits };
  });

export const mapFeature = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().optional(), datasetId: z.string(), kind: z.enum(["C", "E", "LV", "SC", "owner"]), no: z.string().max(30).nullable().optional(), lvNo: z.number().int().nullable().optional() }))
  .handler(async ({ data }): Promise<MapFeature> => {
    const d = (await q<{ ku_name: string }>("SELECT ku_name FROM datasets WHERE id = ?", [data.datasetId]))[0];
    if (!d) return { ok: false, message: "Katastrálne územie nie je v appke." };
    const base = { ok: true, kind: data.kind, datasetId: data.datasetId, kuName: d.ku_name };
    const cParcel = async (no: string) => (await q<{ parcel_no: string; lv_no: number | null; area_m2: number; use_type: string | null; geometry_json: string | null; centroid_lat: number | null; centroid_lng: number | null; ekn_ref: string | null }>(
      "SELECT parcel_no, lv_no, area_m2, use_type, geometry_json, centroid_lat, centroid_lng, ekn_ref FROM parcels WHERE dataset_id = ? AND parcel_no = ? AND kn_type NOT LIKE 'E%' LIMIT 1", [data.datasetId, no]))[0];
    if ((data.kind === "C" || data.kind === "SC") && data.no) {
      const p = await cParcel(data.no);
      const lvC = p?.lv_no ?? (await q<{ lv_no: number }>("SELECT lv_no FROM lv_parcels WHERE dataset_id = ? AND register='C' AND parcel_no = ? LIMIT 1", [data.datasetId, data.no]))[0]?.lv_no ?? null;
      const rings = geoRings(p?.geometry_json ?? null);
      const building = data.kind === "SC" ? (await q<{ descr: string }>("SELECT descr FROM lv_buildings WHERE dataset_id = ? AND on_parcel = ? LIMIT 1", [data.datasetId, data.no]))[0]?.descr ?? null : null;
      const eUnder = lvC == null && p?.ekn_ref
        ? await q<{ no: string; lvNo: number | null; areaM2: number | null }>("SELECT parcel_no AS no, lv_no AS lvNo, area_m2 AS areaM2 FROM lv_parcels WHERE dataset_id = ? AND register='E' AND parcel_no = ?", [data.datasetId, p.ekn_ref])
        : [];
      return { ...base, no: data.no, lvNo: data.kind === "SC" ? (data.lvNo ?? lvC) : lvC, areaM2: p?.area_m2 ?? null, druh: p?.use_type ?? null, rings,
        center: ringsCenter(rings) ?? (p?.centroid_lat != null && p.centroid_lng != null ? { lat: p.centroid_lat, lng: p.centroid_lng } : null), building, eUnder };
    }
    if (data.kind === "E" && data.no) {
      const e = (await q<{ lv_no: number; area_m2: number; drp_text: string | null }>("SELECT lv_no, area_m2, drp_text FROM lv_parcels WHERE dataset_id = ? AND register='E' AND parcel_no = ? LIMIT 1", [data.datasetId, data.no]))[0];
      // obrys parcely E nemáme — vezme sa z národnej mapy určeného operátu (ESKN VRM/uo) v TOMTO k.ú.
      let rings: MapRing[] = [];
      try { rings = await esknEParcels(data.datasetId, [data.no]); } catch { /* ESKN nedostupné → bez obrysu, LV aj tak */ }
      return { ...base, no: data.no, lvNo: e?.lv_no ?? data.lvNo ?? null, areaM2: e?.area_m2 ?? null, druh: e?.drp_text ?? null, rings, center: ringsCenter(rings) };
    }
    // LV / vlastník → všetky parcely C daného LV s obrysom
    const lv = data.lvNo ?? null;
    if (lv == null) return { ok: false, message: "Chýba číslo LV." };
    const ps = await q<{ geometry_json: string | null }>("SELECT geometry_json FROM parcels WHERE dataset_id = ? AND lv_no = ? AND geometry_json IS NOT NULL LIMIT 200", [data.datasetId, lv]);
    const rings = ps.flatMap((p) => geoRings(p.geometry_json));
    // LV založené na parcelách E (Kysuce) — obrysy z mapy určeného operátu, inak by sa nebolo kam priblížiť
    const eNos = (await q<{ parcel_no: string }>("SELECT parcel_no FROM lv_parcels WHERE dataset_id = ? AND lv_no = ? AND register='E' LIMIT 60", [data.datasetId, lv]).catch(() => [])).map((r) => r.parcel_no);
    if (eNos.length) { try { rings.push(...await esknEParcels(data.datasetId, eNos)); } catch { /* ESKN nedostupné */ } }
    return { ...base, lvNo: lv, rings, center: ringsCenter(rings) };
  });

export type MapIdentify = {
  ok: boolean; message?: string; lat: number; lng: number;
  eskn: { no: string | null; areaM2: number | null; rings: MapRing[] } | null;
  ours: { datasetId: string; kuName: string; no: string; lvNo: number | null; areaM2: number | null; druh: string | null } | null;
  eUnder: { no: string; lvNo: number | null; areaM2: number | null; datasetId: string | null }[];
};
export const mapIdentify = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().optional(), lat: z.number(), lng: z.number() }))
  .handler(async ({ data }): Promise<MapIdentify> => {
    const out: MapIdentify = { ok: true, lat: data.lat, lng: data.lng, eskn: null, ours: null, eUnder: [] };
    const dd = 0.0012, ext = `${data.lng - dd},${data.lat - dd},${data.lng + dd},${data.lat + dd}`;
    const idUrl = (svc: string, layer: number) => `https://kataster.skgeodesy.sk/eskn/rest/services/VRM/${svc}/MapServer/identify?geometry=${data.lng},${data.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:${layer}&tolerance=1&mapExtent=${ext}&imageDisplay=800,600,96&returnGeometry=true&f=json`;
    const [cj, ej] = await Promise.all([eskn(idUrl("kn", 9)).catch(() => null), eskn(idUrl("uo", 2)).catch(() => null)]);
    if (!cj && !ej) return { ...out, ok: false, message: "Národný kataster (ESKN) neodpovedá — skús znova." };
    const cRes = cj && Array.isArray(cj.results) ? cj.results.map((r) => asObj(r) ?? {}) : [];
    const c = cRes.find((r) => r.layerId === 9) ?? cRes[0];
    if (c) {
      const a = asObj(c.attributes) ?? {};
      const no = a["Parcelné číslo"] != null ? String(a["Parcelné číslo"]) : null;
      const area = a["Výmera SPI (m2)"] != null ? Number(String(a["Výmera SPI (m2)"]).replace(",", ".")) : null;
      out.eskn = { no, areaM2: area != null && isFinite(area) ? area : null, rings: esknRings(c.geometry) };
    }
    // NAŠA parcela: rovnaké číslo v okolí bodu (naprieč všetkými k.ú.). Dovtedy sa pri nenájdenom čísle
    // brala NAJBLIŽŠIA parcela → panel mohol ponúknuť výpis CUDZIEHO LV.
    const d = 0.02;
    const near = await q<{ dataset_id: string; parcel_no: string; lv_no: number | null; area_m2: number; use_type: string | null; centroid_lat: number; centroid_lng: number; ku_name: string }>(
      `SELECT p.dataset_id, p.parcel_no, p.lv_no, p.area_m2, p.use_type, p.centroid_lat, p.centroid_lng, d.ku_name
       FROM parcels p JOIN datasets d ON d.id = p.dataset_id
       WHERE p.centroid_lat BETWEEN ? AND ? AND p.centroid_lng BETWEEN ? AND ? AND p.parcel_no = ? AND p.kn_type NOT LIKE 'E%' LIMIT 20`,
      [data.lat - d, data.lat + d, data.lng - d, data.lng + d, out.eskn?.no ?? "__"]).catch(() => []);
    const dist = (x: { centroid_lat: number; centroid_lng: number }) => (x.centroid_lat - data.lat) ** 2 + (x.centroid_lng - data.lng) ** 2;
    const best = near.sort((x, y) => dist(x) - dist(y))[0];
    let did: string | null = best?.dataset_id ?? null;
    if (best) {
      const lvC = best.lv_no ?? (await q<{ lv_no: number }>("SELECT lv_no FROM lv_parcels WHERE dataset_id = ? AND register='C' AND parcel_no = ? LIMIT 1", [best.dataset_id, best.parcel_no]))[0]?.lv_no ?? null;
      out.ours = { datasetId: best.dataset_id, kuName: best.ku_name, no: best.parcel_no, lvNo: lvC, areaM2: best.area_m2, druh: best.use_type };
    } else {
      // k.ú. aspoň podľa najbližšej našej parcely (na napárovanie parciel E) — bez tvrdenia o parcele C
      did = (await q<{ dataset_id: string }>(
        "SELECT dataset_id FROM parcels WHERE centroid_lat BETWEEN ? AND ? AND centroid_lng BETWEEN ? AND ? LIMIT 1",
        [data.lat - 0.003, data.lat + 0.003, data.lng - 0.003, data.lng + 0.003]).catch(() => []))[0]?.dataset_id ?? null;
    }
    // parcely E v bode (mapa určeného operátu) → ich LV v našich dátach
    const eRes = ej && Array.isArray(ej.results) ? ej.results.map((r) => asObj(r) ?? {}) : [];
    for (const r of eRes.slice(0, 6)) {
      const a = asObj(r.attributes) ?? {};
      const no = a.PARCEL_NUMBER_FULL != null ? String(a.PARCEL_NUMBER_FULL) : null;
      if (!no) continue;
      const area = a.GEODETIC_AREA_OF_PARCEL != null ? Number(String(a.GEODETIC_AREA_OF_PARCEL).replace(",", ".")) : null;
      const lv = did ? (await q<{ lv_no: number; area_m2: number }>("SELECT lv_no, area_m2 FROM lv_parcels WHERE dataset_id = ? AND register='E' AND parcel_no = ? LIMIT 1", [did, no]))[0] : undefined;
      out.eUnder.push({ no, lvNo: lv?.lv_no ?? null, areaM2: lv?.area_m2 ?? (area != null && isFinite(area) ? Math.round(area) : null), datasetId: lv ? did : null });
    }
    return out;
  });
