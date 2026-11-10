-- 0092: firmy z Registra právnických osôb (RPO, ŠÚ SR) ako MOŽNÍ KUPCI — developeri, stavebné firmy,
-- realitky, investori so sídlom v okresoch, ktoré appka pokrýva. Plní Mac dávka
-- (24_OWNER_INTEL/rpo_buyer_firms.py) cez /api/ingest-buyer-firms. Verejné údaje o firmách (nie osoby).
-- RPO nedáva odbor činnosti → kategória je odvodená z názvu (DERIVED).
CREATE TABLE IF NOT EXISTS buyer_firms (
  ico          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  obec         TEXT,
  okres        TEXT,
  category     TEXT,                       -- developer / investor | stavebná firma | realitná kancelária | firma
  established  TEXT,
  source       TEXT NOT NULL DEFAULT 'RPO',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_buyer_firms_okres ON buyer_firms(okres, category);
