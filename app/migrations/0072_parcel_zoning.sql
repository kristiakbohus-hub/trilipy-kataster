-- 0072_parcel_zoning.sql — PER-PARCELA funkčné využitie z ÚP (georef výkres / GISPLAN WMS).
-- Predpočítané na Macu (gold_li_engine.parcel_zones): centroid parcely → farba výkresu → rodina zóny.
-- Plní sa cez /api/ingest-parcel-zoning z Macu, per k.ú. replace. Zobrazí sa v LV výpise (funkčné využitie parcely).
CREATE TABLE IF NOT EXISTS parcel_zoning (
  kod_ku TEXT NOT NULL,
  parcel_no TEXT NOT NULL,
  register TEXT NOT NULL,      -- C | E
  zone TEXT,                   -- rodina funkčného využitia (bývanie/rekreácia, OV, zeleň/orná/lesy, výroba, …)
  verdict TEXT,                -- PASS | VERIFY | FAIL (pre bývanie) — orientačné
  PRIMARY KEY (kod_ku, parcel_no, register)
);
CREATE INDEX IF NOT EXISTS idx_parcel_zoning_ku ON parcel_zoning(kod_ku);
