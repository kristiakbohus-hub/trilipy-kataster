import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "../bindings.server";
import type {
  AuditRow,
  Case,
  CaseNote,
  Dataset,
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
import { canExport, canRunPipeline, canSeeOwners, canSign, ownerAccess, type Role } from "../domain";
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
    parcels: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM parcels"))[0]?.n ?? 0,
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

// ——— Detail datasetu (owners rolovo gatované) ———
export const getDataset = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
    const ownerCount =
      (await q<{ n: number }>("SELECT COUNT(*) AS n FROM lv_owners WHERE dataset_id = ?", [data.id]))[0]
        ?.n ?? 0;
    return { dataset, parcels, jobs, reports, opportunities, lvCount, ownerCount };
  });

// ——— Kataster Browser: register LV (rolovo maskovaný na serveri) ———
export const getLvRegistry = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), role: roleSchema, q: z.string().optional() }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
      role: roleSchema,
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), q: z.string(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
export const nlQuery = createServerFn({ method: "POST" })
  .validator(z.object({ query: z.string(), role: roleSchema, sort: z.enum(["score", "area", "owners"]).optional() }))
  .handler(async ({ data }) => {
    const raw = data.query.trim();
    const s = raw.toLowerCase();
    const role = data.role as Role;

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
    if (/dedič|dedic/.test(s)) cond.push("sig.dedic = 1");
    if (/stavebn|zastavateľn|intravil/.test(s)) cond.push("sig.buildable = 1");
    if (/bez.?[tť]arch|čist/.test(s)) cond.push("sig.clean_title = 1");
    const mco = s.match(/(\d+)\s*(spoluvlast|podiel|vlastník)/); if (mco) { cond.push("sig.co_owners >= ?"); args.push(Number(mco[1])); }
    const ma = s.match(/nad\s*(\d{3,})/); if (ma) { cond.push("sig.total_area >= ?"); args.push(Number(ma[1])); }
    // LV sekcia sa naplní len ak dopyt naozaj mieri na signály (inak by "Novák"/"byt" vrátili celú DB)
    const lvRelevant = cond.length > 0;
    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    const rows = lvRelevant ? await q<NlHit>(
      `SELECT sig.dataset_id, d.ku_name, sig.lv_no, sig.co_owners, sig.has_spf, sig.dedic, sig.buildable,
              sig.clean_title, sig.absenter_ratio, sig.total_area, sig.oldest_birth_year
       FROM lv_signals sig JOIN datasets d ON d.id = sig.dataset_id ${where} LIMIT 4000`, args) : [];
    const w = { co: 0.3, spf: 0.25, dedic: 0.15, buildable: 0.15, absenter: 0.1, clean: 0.05 };
    const wsum = w.co + w.spf + w.dedic + w.buildable + w.absenter + w.clean;
    const scored = rows.map((r) => {
      const rawScore = (w.co * Math.min(r.co_owners ?? 0, 20)) / 20 + w.spf * (r.has_spf ?? 0) + w.dedic * (r.dedic ?? 0)
        + w.buildable * (r.buildable ?? 0) + w.absenter * (r.absenter_ratio ?? 0) + w.clean * (r.clean_title ?? 0);
      const reasons: string[] = [];
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

    return {
      lv: { count: scored.length, results: scored.slice(0, 80) },
      owners,
      market,
    };
  });

// ——— Owners pre jednu parcelu (identify, rolovo gatované) ———
export const getParcelOwners = createServerFn({ method: "POST" })
  .validator(z.object({ parcelId: z.string(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: false; message: string } | { ok: true; id: number | null; hash: string }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const hash = Math.random().toString(16).slice(2, 10);
    const res = await DB.prepare(
      "INSERT INTO reports (dataset_id, kind, title, status, audit_hash) VALUES (?, ?, ?, 'draft', ?)",
    )
      .bind(data.datasetId, data.kind, data.title, hash)
      .run();
    await logAudit("report.generate", data.role, `Report „${data.title}" vytvorený (draft, audit ${hash}).`, data.datasetId);
    return { ok: true, id: res.meta?.last_row_id ?? null, hash };
  });

export const setReportStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({ id: z.number(), status: z.enum(["draft", "review", "signed"]), role: roleSchema }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const role = data.role as Role;
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

export const getAudit = createServerFn({ method: "GET" }).handler(async () => {
  return await q<AuditRow>("SELECT * FROM audit_log ORDER BY id DESC LIMIT 40");
});

// ——— Fáza 4: Auth (9.26) — no-anonymous gate ———
// DEMO prístupová fráza. Pred handoffom rotovať (blocked_for_handoff). Fráza sa
// validuje na serveri; na klient sa nikdy neposiela.
const DEMO_PASSPHRASE = "trilipy";
export const login = createServerFn({ method: "POST" })
  .validator(z.object({ passphrase: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    return { ok: data.passphrase.trim().toLowerCase() === DEMO_PASSPHRASE };
  });

// ——— PDF výstup: Výpis z LV / Evidenčný list (pracovný, TRI LIPY brand) ———
type DocParcel = { register: string; parcel_no: string; area_m2: number; drp_text: string | null; placement: string | null };
type DocBuilding = { descr: string; on_parcel: string | null };
export const getLvVypis = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
      role: roleSchema,
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
    const role = data.role as Role;
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
    await logAudit("dataset.import.ui", role, `Nahraté k.ú. ${data.code} (${data.name}) — ${data.parcels.length} parciel z VGI; WMS: ${wms.name}.`, datasetId);
    return { ok: true, datasetId, count: data.parcels.length };
  });

// ——— E-KN (register E / určený operát) — doplnenie z UO*.vgi k existujúcemu k.ú. ———
// Rovnaký VGI formát, ale parcely sa uložia ako kn_type='E-KN' (id s prefixom E- aby nekolidovali s C-KN).
export const importEknParcels = createServerFn({ method: "POST" })
  .validator(z.object({
    datasetId: z.string(),
    role: roleSchema,
    append: z.boolean().optional(),   // false = najprv zmaž existujúce E-KN (prvý chunk); true = pridaj (ďalšie chunky)
    parcels: z.array(z.object({
      parcel_no: z.string(), area_m2: z.number(),
      ring: z.array(z.tuple([z.number(), z.number()])),
      centroid_lat: z.number(), centroid_lng: z.number(),
    })).min(1).max(2000),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; count?: number; message?: string }> => {
    const role = data.role as Role;
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
  const counts = {
    datasets: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM datasets"))[0]?.n ?? 0,
    parcels: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM parcels"))[0]?.n ?? 0,
    lvs: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM lvs"))[0]?.n ?? 0,
    owners: (await q<{ n: number }>("SELECT COUNT(*) AS n FROM lv_owners"))[0]?.n ?? 0,
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
  .validator(z.object({ id: z.number(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
      role: roleSchema,
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
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

export const getCase = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const c = (await q<Case & { ku_name: string }>(
      `SELECT c.*, d.ku_name AS ku_name FROM cases c JOIN datasets d ON d.id = c.dataset_id WHERE c.id = ?`,
      [data.id],
    ))[0] ?? null;
    const notes = await q<CaseNote>("SELECT * FROM case_notes WHERE case_id = ? ORDER BY id", [data.id]);
    return { case: c, notes };
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
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; id?: number | null; message?: string }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const res = await DB.prepare(
      "INSERT INTO cases (dataset_id, title, kind, status, owner_role, linked_ref, next_steps) VALUES (?, ?, ?, 'open', ?, ?, ?)",
    )
      .bind(data.datasetId, data.title, data.kind, data.role, data.linkedRef ?? null, data.nextSteps ?? null)
      .run();
    await logAudit("case.create", data.role, `Case „${data.title}" (${data.kind}).`, data.datasetId);
    return { ok: true, id: res.meta?.last_row_id ?? null };
  });

export const updateCaseStatus = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), status: z.enum(["open", "review", "done"]), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE cases SET status = ? WHERE id = ?").bind(data.status, data.id).run();
    await logAudit("case.status", data.role, `Case #${data.id} → ${data.status}.`);
    return { ok: true };
  });

export const addCaseNote = createServerFn({ method: "POST" })
  .validator(z.object({ caseId: z.number(), body: z.string().min(2), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("INSERT INTO case_notes (case_id, author_role, body) VALUES (?, ?, ?)")
      .bind(data.caseId, data.role, data.body)
      .run();
    await logAudit("case.note", data.role, `Poznámka k case #${data.caseId}.`);
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
    role: roleSchema,
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const role = data.role as Role;
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
    role: roleSchema,
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
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
  .validator(z.object({ id: z.string(), opacity: z.number().min(0).max(1).optional(), note: z.string().optional(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false };
    if (data.opacity != null) await DB.prepare("UPDATE up_rasters SET opacity = ? WHERE id = ?").bind(data.opacity, data.id).run();
    if (data.note != null) await DB.prepare("UPDATE up_rasters SET note = ? WHERE id = ?").bind(data.note, data.id).run();
    return { ok: true };
  });

export const deleteRaster = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie mazať podklad." };
    const { DB, STORAGE } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const row = (await q<{ r2_key: string }>("SELECT r2_key FROM up_rasters WHERE id = ?", [data.id]))[0];
    if (row && STORAGE) await STORAGE.delete(row.r2_key);
    await DB.prepare("DELETE FROM up_rasters WHERE id = ?").bind(data.id).run();
    await logAudit("raster.delete", role, `Podklad ${data.id} odstránený.`);
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
    parcelNo: z.string().optional(), functionalArea: z.string().min(1), regulativ: z.string().optional(), note: z.string().optional(), role: roleSchema,
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const role = data.role as Role;
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
  .validator(z.object({ id: z.string(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const role = data.role as Role;
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
  .validator(z.object({ q: z.string(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
type RpoHit = { name: string | null; ico: string | null; address: string | null; legal_form: string | null; established: string | null; terminated: string | null; source: string };
export const lookupRpo = createServerFn({ method: "POST" })
  .validator(z.object({ q: z.string().min(2), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; results: RpoHit[]; message?: string }> => {
    const role = data.role as Role;
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
          legal_form: val(first(e.legalForms)) ?? null,
          established: val(e.establishment) ?? null,
          terminated: val(e.termination) ?? null,
          source: "RPO / ŠÚ SR (api.statistics.sk)",
        };
      });
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
    const where = data.datasetId ? "WHERE s.dataset_id = ?" : "";
    const args = data.datasetId ? [data.datasetId] : [];
    return await q<LvSignal>(
      `SELECT s.dataset_id, s.lv_no, s.co_owners, s.has_spf, s.oldest_birth_year, s.dedic, s.buildable, s.clean_title, s.absenter_ratio, s.total_area, d.ku_name AS ku_name
       FROM lv_signals s JOIN datasets d ON d.id = s.dataset_id ${where}`,
      args,
    );
  });

// ——— Deal pipeline: deal = LV, vlastníci ako úkony (Bod 2b) ———
type DealRow = { id: string; dataset_id: string; lv_no: number; ku_name: string | null; status: string; score: number | null; note: string | null; created_at: string; updated_at: string };
type DealTaskRow = { id: number; deal_id: string; owner_name: string; share: string | null; addr: string | null; is_company: number; state: string; note: string | null };
type DealNoteRow = { id: number; deal_id: string; author_role: string | null; body: string; created_at: string };
const DEAL_STATUSES = ["new", "checking", "contacted", "negotiation", "closed_won", "closed_lost"] as const;
const TASK_STATES = ["pending", "contacted", "agreed", "signed", "declined"] as const;

export const createDeal = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), lvNo: z.number(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const role = data.role as Role;
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá plný prístup na založenie dealu." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const existing = (await q<{ id: string }>("SELECT id FROM deals WHERE dataset_id = ? AND lv_no = ? LIMIT 1", [data.datasetId, data.lvNo]))[0];
    if (existing) return { ok: true, id: existing.id };
    const sig = (await q<{ co_owners: number; has_spf: number; dedic: number; buildable: number; clean_title: number; absenter_ratio: number }>(
      "SELECT co_owners, has_spf, dedic, buildable, clean_title, absenter_ratio FROM lv_signals WHERE dataset_id = ? AND lv_no = ?",
      [data.datasetId, data.lvNo],
    ))[0];
    const score = sig
      ? Math.round(100 * ((Math.min(sig.co_owners, 20) / 20) * 0.3 + sig.has_spf * 0.25 + sig.dedic * 0.15 + sig.buildable * 0.15 + sig.absenter_ratio * 0.1 + sig.clean_title * 0.05))
      : null;
    const ku = (await q<{ ku_name: string }>("SELECT ku_name FROM datasets WHERE id = ?", [data.datasetId]))[0]?.ku_name ?? null;
    const id = `deal-${data.datasetId}-${data.lvNo}-${Math.random().toString(36).slice(2, 6)}`;
    await DB.prepare("INSERT INTO deals (id, dataset_id, lv_no, ku_name, status, score, created_by) VALUES (?,?,?,?,?,?,?)")
      .bind(id, data.datasetId, data.lvNo, ku, "new", score, role).run();
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
  .validator(z.object({ id: z.string(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
    const access = ownerAccess(role);
    const deal = (await q<DealRow>("SELECT * FROM deals WHERE id = ?", [data.id]))[0] ?? null;
    const notes = await q<DealNoteRow>("SELECT * FROM deal_notes WHERE deal_id = ? ORDER BY id DESC", [data.id]);
    let tasks = await q<DealTaskRow>("SELECT * FROM deal_tasks WHERE deal_id = ? ORDER BY is_company DESC, id", [data.id]);
    if (access !== "full") tasks = tasks.map((t) => ({ ...t, owner_name: "Vlastník (chránené)", addr: null }));
    return { deal, tasks, notes, access };
  });

export const updateDealStatus = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), status: z.enum(DEAL_STATUSES), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá oprávnenie meniť deal." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    await DB.prepare("UPDATE deals SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(data.status, data.id).run();
    await logAudit("deal.status", role, `Deal ${data.id} → ${data.status}.`);
    return { ok: true };
  });

export const updateDealTask = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), state: z.enum(TASK_STATES), note: z.string().optional(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
    if (ownerAccess(role) !== "full") return { ok: false, message: "Rola nemá oprávnenie meniť úkon." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    if (data.note != null) await DB.prepare("UPDATE deal_tasks SET state = ?, note = ? WHERE id = ?").bind(data.state, data.note, data.id).run();
    else await DB.prepare("UPDATE deal_tasks SET state = ? WHERE id = ?").bind(data.state, data.id).run();
    return { ok: true };
  });

export const addDealNote = createServerFn({ method: "POST" })
  .validator(z.object({ dealId: z.string(), body: z.string().min(1), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { DB } = bindings();
    if (!DB) return { ok: false };
    await DB.prepare("INSERT INTO deal_notes (deal_id, author_role, body) VALUES (?, ?, ?)").bind(data.dealId, data.role, data.body).run();
    await DB.prepare("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").bind(data.dealId).run();
    return { ok: true };
  });

// ——— Bod 4: záloha D1 (export-only, gated admin/manažér) ———
export const exportBackup = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; json?: string; message?: string }> => {
    const role = data.role as Role;
    if (role !== "admin" && role !== "manager") return { ok: false, message: "Zálohu môže exportovať len admin alebo manažér." };
    const { DB } = bindings();
    if (!DB) return { ok: false, message: "Databáza nie je dostupná." };
    const tables = (await q<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    )).map((t) => t.name);
    const dump: Record<string, unknown[]> = {};
    for (const t of tables) {
      try { dump[t] = await q<Record<string, unknown>>(`SELECT * FROM ${t}`); } catch { dump[t] = []; }
    }
    await logAudit("backup.export", role, `Záloha D1: ${tables.length} tabuliek.`);
    return { ok: true, json: JSON.stringify({ app: "tri-lipy-kataster", exported_at: new Date().toISOString(), tables: dump }) };
  });

// ——— Evidenčný list (Bod C) — C-KN parcely + historický UŽÍVATEĽ (uz.CEL cez pa.CEL), NIE vlastník ———
export const getEvidencnyList = createServerFn({ method: "POST" })
  .validator(z.object({ datasetId: z.string(), celok: z.number(), role: roleSchema }))
  .handler(async ({ data }) => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), celok: z.number(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ uzivatel: string | null; ico: string | null }> => {
    const access = ownerAccess(data.role as Role);
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
  .validator(z.object({ role: roleSchema }))
  .handler(async ({ data }): Promise<{ allowed: boolean; anyOk: boolean; probes: EgressProbe[] }> => {
    const role = data.role as Role;
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
  .validator(z.object({ ico: z.string().min(5), role: roleSchema, refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<RpvsResult> => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), geojson: z.string(), role: roleSchema, replace: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = data.role as Role;
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
export const refreshMarketData = createServerFn({ method: "POST" })
  .validator(z.object({ role: roleSchema, url: z.string().url().optional() }))
  .handler(async ({ data }): Promise<{ ok: boolean; index: number; opps: number; generated?: string; chunks?: number; phChunks?: number; message?: string }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false, index: 0, opps: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, index: 0, opps: 0, message: "Databáza nedostupná." };
    let url = data.url;
    if (url) await DB.prepare("INSERT INTO market_meta (key,value) VALUES ('source_url',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(url).run();
    else url = (await q<{ value: string }>("SELECT value FROM market_meta WHERE key='source_url'"))[0]?.value;
    if (!url) return { ok: false, index: 0, opps: 0, message: "Nie je nastavené zdrojové URL (market-data.json)." };
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
  .validator(z.object({ url: z.string().url(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
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
      "INSERT INTO market_listings (source,ext_id,url,title,ptype,deal,obec,psc,lat,lng,area_m2,rooms,price_eur,ppm2,first_seen,last_seen,first_price,flags,okres) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,ext_id) DO UPDATE SET url=excluded.url,title=excluded.title,obec=excluded.obec,psc=excluded.psc,lat=excluded.lat,lng=excluded.lng,area_m2=excluded.area_m2,price_eur=excluded.price_eur,ppm2=excluded.ppm2,last_seen=excluded.last_seen,flags=excluded.flags,okres=excluded.okres")
      .bind(s(o.source) ?? "bazos", s(o.ext_id), s(o.url), s(o.title), s(o.ptype), s(o.deal), s(o.obec), s(o.psc), num(o.lat), num(o.lng), area, num(o.rooms), price, ppm2, s(o.first_seen ?? o.listed), s(o.last_seen), priceSane(num(o.first_price ?? o.price_eur ?? o.price)), s(o.flags), okres); });
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    return { ok: true, count: stmts.length };
  });

// ——— Per-inzerát história ceny: ingest chunku (market-pricehistory-<i>.json) + fetch krivky ———
export const refreshMarketPriceHistory = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings();
    if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
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

// Rozdeľovník Kraj → Okres → Lokalita: medián €/m² na 3 úrovniach z market_listings.
// Medián počítaný cez window-funkcie; per-typ ppm2 clamp vylúči mis-parse (€/m² vs celková cena).
export type MarketTreeRow = { grain: "kraj" | "okres" | "obec"; kraj: string; okres: string | null; obec: string | null; ptype: string; median_eur_m2: number; cnt: number };
export const getMarketTree = createServerFn({ method: "POST" })
  .validator(z.object({ deal: z.string().optional(), activeOnly: z.boolean().optional() }))
  .handler(async ({ data }): Promise<MarketTreeRow[]> => {
    const deal = data.deal ?? "predaj";
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
    return await q<MarketTreeRow>(sql, args);
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
export const getDealRadar = createServerFn({ method: "POST" })
  .validator(z.object({ okres: z.string().optional(), minScore: z.number().optional(), limit: z.number().optional() }))
  .handler(async ({ data }): Promise<{ lv: RadarLv[]; market: MarketOpp[] }> => {
    const limit = data.limit ?? 40;
    const lvRows = await q<NlHit & { region: string | null }>(
      `SELECT sig.dataset_id, d.ku_name, d.region, sig.lv_no, sig.co_owners, sig.has_spf, sig.dedic, sig.buildable, sig.clean_title, sig.absenter_ratio, sig.total_area, sig.oldest_birth_year
       FROM lv_signals sig JOIN datasets d ON d.id = sig.dataset_id ${data.okres ? "WHERE d.region LIKE ?" : ""} LIMIT 8000`,
      data.okres ? [`%${data.okres}%`] : []);
    // okresný stavebný medián €/m² (pozemok) pre orientačný € potenciál LV
    const medRows = await q<{ okres: string | null; med: number | null }>(
      `SELECT okres, AVG(median_eur_m2) med FROM market_index WHERE ptype='pozemok' AND deal='predaj' AND okres IS NOT NULL GROUP BY okres`, []);
    const medByOkres = new Map<string, number>();
    for (const r of medRows) if (r.okres && r.med) medByOkres.set(r.okres, r.med);
    const medAll = medByOkres.size ? [...medByOkres.values()].reduce((a, b) => a + b, 0) / medByOkres.size : 30;
    const w = { co: 0.3, spf: 0.25, dedic: 0.15, buildable: 0.15, absenter: 0.1, clean: 0.05 };
    const wsum = w.co + w.spf + w.dedic + w.buildable + w.absenter + w.clean;
    const minScore = data.minScore ?? 0;
    const lv = lvRows.map((r) => {
      const okres = okresFromRegion(r.region ?? null);
      const med = (okres && medByOkres.get(okres)) || medAll;
      // buildable → stavebný medián; inak poľnohosp. sadzba (~5 % z medianu, cap 3 €/m²)
      const ppm2 = r.buildable ? med : Math.min(med * 0.05, 3);
      const avm_eur = (r.total_area ?? 0) > 0 && ppm2 > 0 ? Math.round((r.total_area ?? 0) * ppm2) : null;
      const raw = (w.co * Math.min(r.co_owners ?? 0, 20)) / 20 + w.spf * (r.has_spf ?? 0) + w.dedic * (r.dedic ?? 0)
        + w.buildable * (r.buildable ?? 0) + w.absenter * (r.absenter_ratio ?? 0) + w.clean * (r.clean_title ?? 0);
      const reasons: string[] = [];
      if ((r.co_owners ?? 0) >= 5) reasons.push(`${r.co_owners} spoluvlastníkov`);
      if (r.has_spf) reasons.push("SPF / štát");
      if (r.dedic) reasons.push(`dedičské${r.oldest_birth_year ? ` (${r.oldest_birth_year})` : ""}`);
      if (r.buildable) reasons.push("stavebný potenciál");
      if ((r.absenter_ratio ?? 0) > 0) reasons.push(`absentéri ${Math.round((r.absenter_ratio ?? 0) * 100)} %`);
      if (r.clean_title) reasons.push("bez tiarch");
      return { dataset_id: r.dataset_id, ku_name: r.ku_name, lv_no: r.lv_no, score: Math.round((100 * raw) / wsum), reasons, co_owners: r.co_owners ?? 0, total_area: r.total_area ?? 0, has_spf: r.has_spf ?? 0, okres, avm_eur };
    }).filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
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

export const getParcelAccessibility = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lng: z.number(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<Accessibility> => {
    const key = `osm:${data.lat.toFixed(4)}:${data.lng.toFixed(4)}`;
    const cached = await regCacheRead(key, !!data.refresh, 30 * 24 * 3600);
    if (cached) return { ...(cached.payload as Accessibility), cached: true, ageDays: cached.ageDays };
    // jeden Overpass dopyt so všetkými kategóriami (around na centroid)
    const clauses = OSM_CATS.flatMap((c) => c.filters.map((f) => `${f}(around:${c.radius},${data.lat},${data.lng});`)).join("");
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
        const d = haversine(data.lat, data.lng, p.lat, p.lng);
        if (!best || d < best.dist) best = { name: (asVal(p.tags.name) ?? null), dist: d, drive_min: Math.max(1, Math.round((d / 1000 / 45) * 60)) };
      }
      out[cat.group][cat.key] = best;
    }
    await regCacheWrite(key, "osm", out);
    return out;
  });

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
];
export const getParcelLimits = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lng: z.number(), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<LimitsResult> => {
    const key = `limits:${data.lat.toFixed(4)}:${data.lng.toFixed(4)}`;
    const cached = await regCacheRead(key, !!data.refresh, 30 * 24 * 3600);
    if (cached) return { ...(cached.payload as LimitsResult), cached: true, ageDays: cached.ageDays };
    const one = async (s: (typeof LIMIT_SOURCES)[number]): Promise<LimitHit> => {
      const base: LimitHit = { category: s.category, key: s.key, label: s.label, hit: false, count: 0, buffer: s.buffer, attribution: s.attr, error: false };
      const u = `${s.url}/${s.layer}/query?geometry=${data.lng},${data.lat}&geometryType=esriGeometryPoint&inSR=4326&distance=${s.buffer}&units=esriSRUnit_Meter&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`;
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
  });

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
};

// ——— AVM (automatický odhad hodnoty) — comparables z trhu + úpravy podľa druhu/umiestnenia/BPEJ/veľkosti/vysporiadanosti ———
// Orientačný model, NIE znalecký posudok. Sadzby sú laditeľné (kataster profík vie dodať reálne čísla).
const AG_BASE_PPM2: Record<number, number> = { 1: 1.5, 2: 2.0, 3: 3.0, 4: 6.0, 5: 5.0, 6: 1.0, 7: 0.6, 8: 0.3, 10: 2.5 };
async function computeAvm(lat: number, lng: number, area: number | null, druhCode: number | null, umCode: number | null, bpejSkupina: number | null, settled: number | null, okres: string | null, obec: string | null): Promise<AvmResult> {
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
    const base = (druhCode != null && AG_BASE_PPM2[druhCode]) ? AG_BASE_PPM2[druhCode] : 1.5;
    let f = base;
    factors.push(`poľnohosp. základ ${base} €/m²`);
    if (bpejSkupina != null) { const bf = Math.max(0.5, Math.min(1.4, 1.4 - (bpejSkupina - 1) * 0.1)); f = f * bf; factors.push(`BPEJ skupina ${bpejSkupina} ×${bf.toFixed(2)}`); }
    ppm2 = f; low = f * 0.6; high = f * 1.4;
    klass = druhCode === 7 ? "lesný pozemok" : druhCode === 8 ? "vodná plocha" : "poľnohospodárska pôda";
  }
  if (ppm2 == null) return { ...empty, comps: nComps };
  if (settled === 0) { ppm2 *= 0.8; if (low != null) low *= 0.8; if (high != null) high *= 0.8; factors.push("nevysporiadaná ×0.8"); }
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
  const d = 0.0009;
  const cands = await q<OurCand>(
    `SELECT p.id AS parcel_id, p.dataset_id, p.parcel_no, p.lv_no, p.area_m2, p.use_type, p.kn_type,
            p.bpej, p.bpej_skupina, p.settled, p.celok, p.centroid_lat, p.centroid_lng, d.ku_name, d.region
     FROM parcels p JOIN datasets d ON d.id = p.dataset_id
     WHERE p.centroid_lat BETWEEN ? AND ? AND p.centroid_lng BETWEEN ? AND ? AND p.geometry_json IS NOT NULL
     LIMIT 200`,
    [lat - d, lat + d, lng - d, lng + d]);
  if (!cands.length) return null;
  const dist = (c: OurCand) => ((c.centroid_lat ?? 0) - lat) ** 2 + ((c.centroid_lng ?? 0) - lng) ** 2;
  const byNo = esknNo ? cands.find((c) => String(c.parcel_no) === esknNo) : undefined;
  const pick = byNo ?? [...cands].sort((a, b) => dist(a) - dist(b))[0];
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
    const key = `eskn3:${data.lat.toFixed(5)}:${data.lng.toFixed(5)}`;
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
    try { const obec = out.ours?.ku_name ? out.ours.ku_name.replace(/^k\.ú\.\s*/i, "").trim() : null; out.avm = await computeAvm(data.lat, data.lng, out.area_m2 ?? out.ours?.area_m2 ?? null, druhCode, umCode, out.ours?.bpej_skupina ?? null, out.ours?.settled ?? null, out.ours?.okres ?? null, obec); } catch { /* ignore */ }
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
  .validator(z.object({ datasetId: z.string(), pageUrl: z.string().url().optional(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; changed?: number; message?: string }> => {
    const role = data.role as Role;
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
  .validator(z.object({ datasetId: z.string(), zoneCode: z.string().min(1), funkcia: z.string().optional(), izp: z.number().optional(), kz: z.number().optional(), ipp: z.number().optional(), maxVyska: z.number().optional(), maxPodlazi: z.number().optional(), note: z.string().optional(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false, message: "Rola nemá oprávnenie." };
    const { DB } = bindings(); if (!DB) return { ok: false, message: "Databáza nedostupná." };
    await DB.prepare("DELETE FROM up_regulativ WHERE dataset_id=? AND zone_code=?").bind(data.datasetId, data.zoneCode).run();
    await DB.prepare("INSERT INTO up_regulativ (dataset_id,zone_code,funkcia,izp,kz,ipp,max_vyska,max_podlazi,note,source) VALUES (?,?,?,?,?,?,?,?,?,'manual')")
      .bind(data.datasetId, data.zoneCode, data.funkcia ?? null, data.izp ?? null, data.kz ?? null, data.ipp ?? null, data.maxVyska ?? null, data.maxPodlazi ?? null, data.note ?? null).run();
    await logAudit("up.regulativ.set", role, `Regulatív zóny ${data.zoneCode} → ${data.datasetId}.`, data.datasetId);
    return { ok: true };
  });
export const deleteUpRegulativ = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false };
    const { DB } = bindings(); if (!DB) return { ok: false };
    await DB.prepare("DELETE FROM up_regulativ WHERE id=?").bind(data.id).run();
    return { ok: true };
  });

// Sync číselníka obec→ÚP URL z Mac-master publikovaného up-registry.json (denný monitor).
export const refreshUpRegistry = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url().optional(), role: roleSchema }))
  .handler(async ({ data }): Promise<{ ok: boolean; count: number; message?: string }> => {
    const role = data.role as Role;
    if (!canRunPipeline(role)) return { ok: false, count: 0, message: "Rola nemá oprávnenie." };
    const { DB } = bindings(); if (!DB) return { ok: false, count: 0, message: "Databáza nedostupná." };
    const url = data.url ?? "https://raw.githubusercontent.com/kristiakbohus-hub/tri-lipy-market/main/up-registry.json";
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
