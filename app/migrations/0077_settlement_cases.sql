-- 0077_settlement_cases.sql — GOLD 04: VYSPORIADANIE POZEMKOV pod stavbami.
-- Predpočítaní kandidáti z Mac enginu (35_VYSPORIADANIE/settlement_find_live) — stavba má vlastný LV,
-- ale podložná/súvisiaca parcela (C alebo E/pozemková kniha) má INÝCH vlastníkov = POTENTIAL LAND
-- SETTLEMENT CANDIDATE (signál, nie právny záver). Plní sa cez /api/ingest-settlement z Macu (per kod_ku
-- replace). Vlastníci sú ANONYMIZOVANÍ (žiadne PII) — nesie len počty/príznaky + odkaz na LV výpis pozemku.
CREATE TABLE IF NOT EXISTS settlement_cases (
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  building_id TEXT,           -- interný identifikátor stavby (B:<asset_id>)
  building_desc TEXT,         -- druh + súpisné číslo (napr. "Rodinný dom čs.1649")
  parcel_no TEXT,             -- parcelné číslo podložného pozemku
  register TEXT,              -- C (C-KN) alebo E (E-KN / pozemková kniha)
  land_lv_no INTEGER,         -- LV podložného pozemku (deep-link do výpisu), NULL ak nezistené
  classification TEXT,        -- MATCH | PROVISIONAL
  score REAL,                 -- sekundárne skóre kandidáta (PREFER/AVOID)
  n_land_owners INTEGER,      -- počet (spolu)vlastníkov pozemku
  has_spf INTEGER DEFAULT 0,  -- 1 = SPF / štát v podiele pozemku
  has_unknown INTEGER DEFAULT 0, -- 1 = neznámy/nezistený vlastník pozemku
  via_e INTEGER DEFAULT 0,    -- 1 = rozlíšené cez parcelu registra E (zhodné číslo C↔E)
  reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_sc_ku_class ON settlement_cases(kod_ku, classification, n_land_owners);
CREATE INDEX IF NOT EXISTS ix_sc_class ON settlement_cases(classification, n_land_owners);
