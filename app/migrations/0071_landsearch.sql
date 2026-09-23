-- 0071_landsearch.sql — NL prieskum: POZEMKOVÉ PRÍLEŽITOSTI (land-search) pre kolegov.
-- Predpočítané kandidátske celky (MATCH/PROVISIONAL) z Mac enginu (gold_li_engine) so všetkými
-- signálmi a kompozitným skóre kvality. Plní sa cez /api/ingest-landsearch z Macu. Per (kod_ku,purpose)
-- replace. Zdroj: SPI kataster + VGI geometria + OSM + WMS ÚP + štátne limity + DEM (deterministické).
CREATE TABLE IF NOT EXISTS landsearch_results (
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  purpose TEXT,                -- retail | residential | industrial
  verdict TEXT,               -- MATCH | PROVISIONAL
  quality REAL,               -- kompozitné skóre 0–100 (zoraďuje najlepší prvý)
  area_m2 INTEGER,
  n_parcels INTEGER,
  parcels TEXT,               -- "6863/37, 6620/1"
  shape TEXT,                 -- "135×127 m"
  zone TEXT,                  -- funkčná zóna (ÚP)
  build TEXT,                 -- empty | demolishable | built
  access INTEGER,             -- prístup 0–100
  slope REAL,                 -- svah %
  frontage INTEGER,           -- 1 = frontáž na cestu, 0 = vnútrozemná, NULL = neznáme
  ppf INTEGER DEFAULT 0,      -- 1 = záber PPF
  existing_use TEXT,          -- OSM využitie (ihrisko/parkovisko…)
  yard TEXT,                  -- dvor/parkovisko signály
  access_times TEXT,          -- "škola 170s, obchod 95s" (drive/walk-time)
  owners TEXT,                -- vlastníci (skrátené)
  n_owners INTEGER,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_ls_ku_verdict ON landsearch_results(kod_ku, verdict, quality);
CREATE INDEX IF NOT EXISTS ix_ls_purpose ON landsearch_results(purpose, verdict);
