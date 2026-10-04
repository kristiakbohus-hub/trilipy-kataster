-- 0080_za_cases.sql — GOLD-ZA: zdedené byty (dedenie 2025-26, nie 1./posledné podlažie, iná adresa).
-- Predpočítaní kandidáti z Mac enginu (21_NL_SEARCH/gold_za_live + gold_za_find, candidate.py model)
-- so zdieľaným MATCH/PROVISIONAL/REJECTED kontraktom. Plní sa cez /api/ingest-za (per kod_ku replace).
-- Anonymizované — vlastník len cez hrubý príznak (adresa_differs, obec), žiadne mená.
CREATE TABLE IF NOT EXISTS za_cases (
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  flat_id TEXT,
  lv_no INTEGER,                -- LV bytu (deep-link do výpisu + createDeal)
  floor INTEGER,
  building_min_floor INTEGER,
  building_max_floor INTEGER,
  classification TEXT,          -- MATCH | PROVISIONAL
  score REAL,
  instrument_year INTEGER,      -- dátum titulu dedičstva (báza klasifikácie)
  registration_year INTEGER,    -- dátum zápisu (len evidencia, ZA12)
  owner_obec TEXT,              -- hrubá obec/mesto vlastníka (NIE ulica, NIE meno)
  reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_za_ku_class ON za_cases(kod_ku, classification);
CREATE INDEX IF NOT EXISTS ix_za_class ON za_cases(classification, instrument_year);
