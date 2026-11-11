-- 0107 — INZERÁT → PRAVDEPODOBNÁ PARCELA / LV (bod 20, 2026-11-11): zhoda obce (aj z titulku) a výmery inzerátu
-- s parcelou alebo súčtom pozemkov LV v našom katastri. Odvodené (istota vysoká/stredná/nízka) — overiť.
CREATE TABLE IF NOT EXISTS listing_matches (
  source TEXT NOT NULL, ext_id TEXT NOT NULL, url TEXT,
  dataset_id TEXT NOT NULL, kind TEXT NOT NULL,   -- parcela | LV
  register TEXT, parcel_no TEXT, lv_no INTEGER, area_m2 REAL,
  confidence TEXT NOT NULL, n_candidates INTEGER, via TEXT
);
CREATE INDEX IF NOT EXISTS ix_listing_matches_url ON listing_matches(url);
CREATE INDEX IF NOT EXISTS ix_listing_matches_src ON listing_matches(source, ext_id);
