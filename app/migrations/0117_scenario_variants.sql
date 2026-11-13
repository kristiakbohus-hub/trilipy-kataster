-- 0117: PREPÍNAČE GOLD SCENÁROV (2026-11-13, pokyn vlastníka: „gold musia všetky fungovať s prepínaním,
-- napríklad dedičstvá 2025 byty sa musia dať prepnúť na 2022 atď., všetko na prepínanie").
--
-- Predvolený beh scenára ostáva v jeho vlastnej tabuľke (za_cases, settlement_cases, up_cases, …) — číta ho
-- viac miest appky (signály, kupci, list nehnuteľnosti) a tie sa nemenia. VARIANT = ten istý engine s inými
-- parametrami: zadá sa na karte, Mac (21_NL_SEARCH/brief_worker.py → scenario_variants.py) ho prepočíta a
-- výsledky uloží sem. Variant sa po uložení NEMENÍ (iné nastavenie = nový variant); rovnaké nastavenie sa
-- nepočíta dvakrát (params_hash).
-- Zoznam prepínačov (názov, jednotka, rozsah, pôvod hodnoty) posiela engine z Macu do market_meta
-- ('scenario_params:<SC>') — pravidlá sú na jednom mieste, appka ich len vykreslí.
CREATE TABLE IF NOT EXISTS scenario_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario TEXT NOT NULL,                  -- ZA | GOLD19 | …
  label TEXT,                              -- čitateľný popis nastavenia („dedičstvo 2022, aj prvé podlažie")
  params_json TEXT NOT NULL,               -- normalizované parametre (len známe kľúče)
  params_hash TEXT NOT NULL,
  kus_json TEXT,                           -- obmedzenie na k.ú. (NULL = všetky, kde scenár beží)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  progress TEXT,
  error TEXT,
  stats_json TEXT,
  n_match INTEGER,
  n_provisional INTEGER,
  user_id INTEGER,
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_scenario_variants_sc ON scenario_variants(scenario, status);
CREATE INDEX IF NOT EXISTS ix_scenario_variants_hash ON scenario_variants(scenario, params_hash);

CREATE TABLE IF NOT EXISTS scenario_variant_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL,
  kod_ku TEXT NOT NULL,
  classification TEXT NOT NULL,            -- MATCH | PROVISIONAL
  data_json TEXT NOT NULL                  -- riadok v tvare, aký posiela push skript scenára (bez mien osôb)
);
CREATE INDEX IF NOT EXISTS ix_svr_variant ON scenario_variant_results(variant_id, kod_ku);
