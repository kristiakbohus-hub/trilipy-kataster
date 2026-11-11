-- 0094: ZADANIA HĽADANIA POZEMKOV (OI-07/OI-08).
-- Rozhodnutie vlastníka 2026-11-11: „Vždy to bude tak, že ja priamo zadám konkrétne požiadavky." Retail
-- (a akýkoľvek iný účel) teda nemá pevnú šablónu — požiadavky sa zadajú pri KAŽDOM hľadaní, appka ich
-- uloží, Mac engine (21_NL_SEARCH/brief_worker.py) ich spracuje a výsledky sa viažu na to zadanie.
-- Zadanie sa po uložení NEMENÍ (zmena = nové zadanie ako kópia) → staré výsledky ostanú platné
-- pre parametre, s ktorými vznikli (dok. 18 §5).
CREATE TABLE IF NOT EXISTS search_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  client TEXT,                              -- pre koho (voliteľné)
  purpose TEXT NOT NULL,                    -- retail | residential | industrial
  kus_json TEXT NOT NULL,                   -- okolie = zoznam k.ú. ["853801", …]
  area_min INTEGER NOT NULL,
  area_max INTEGER NOT NULL,
  access_json TEXT,                         -- [{"dest":"center","profile":"car","limit_s":600}]
  max_slope REAL,                           -- % ; NULL = prahy enginu podľa účelu
  exclude_ppf INTEGER NOT NULL DEFAULT 0,   -- vylúčiť záber poľnohospodárskej pôdy
  require_frontage INTEGER NOT NULL DEFAULT 0, -- vyžadovať priamy prístup z cesty
  other_req TEXT,                           -- parkovanie, zásobovanie… (automaticky sa NEoveruje)
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | running | done | failed | cancelled
  progress TEXT,
  error TEXT,
  stats_json TEXT,                          -- štatistika behu po k.ú. (preverené/zhody/vylúčené/dôvody)
  user_id INTEGER,
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_search_briefs_status ON search_briefs(status);

CREATE TABLE IF NOT EXISTS brief_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_id INTEGER NOT NULL,
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  verdict TEXT NOT NULL,                    -- MATCH | PROVISIONAL
  quality REAL,
  area_m2 INTEGER,
  n_parcels INTEGER,
  parcels TEXT,
  shape TEXT,
  zone TEXT,
  build TEXT,
  access INTEGER,
  slope REAL,
  frontage INTEGER,
  ppf INTEGER,
  existing_use TEXT,
  druh TEXT,
  access_times TEXT,
  owners TEXT,                              -- REÁLNE mená — appka ich ukáže len roli s plným prístupom
  n_owners INTEGER,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_brief_results_brief ON brief_results(brief_id);
