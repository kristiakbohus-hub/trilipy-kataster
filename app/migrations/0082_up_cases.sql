-- 0082_up_cases.sql — GOLD-UP: pôda, ktorú ÚP už určil na bývanie, ale kataster ju stále vedie
-- ako ornú pôdu / TTP a nestojí na nej nič (land-banking: najväčší skok hodnoty).
-- Predpočítaní kandidáti z Mac enginu (21_NL_SEARCH/gold_up_find nad gold_li_engine, candidate.py
-- model) so zdieľaným MATCH/PROVISIONAL kontraktom. Plní sa cez /api/ingest-up (per kod_ku replace).
-- Anonymizované — žiadne mená vlastníkov, len ich počet (rovnako ako settlement_cases).
CREATE TABLE IF NOT EXISTS up_cases (
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  parcels TEXT,                 -- čísla parciel celku (deep-link do reportu)
  n_parcels INTEGER,
  area_m2 INTEGER,
  zone TEXT,                    -- funkčná zóna z ÚP (bývanie/rekreácia, hromadné bývanie…)
  zoning_src TEXT,              -- 'WMS' = presný zdroj | 'georef' = orientačný raster (spoľahlivosť!)
  druh TEXT,                    -- katastrálny druh pozemku (orná pôda | trvalý trávny porast)
  build TEXT,                   -- empty | demolishable (built sa nepushuje)
  classification TEXT,          -- MATCH | PROVISIONAL
  score REAL,
  base_verdict TEXT,            -- verdikt základného land-search enginu (MATCH/PROVISIONAL)
  bpej_skupina INTEGER,         -- 1 = najlepšia pôda … 9 = najslabšia
  odvod_eur_m2 REAL,            -- sadzba odvodu za vyňatie z PP (NV 58/2013)
  naklad_vynatie_eur INTEGER,   -- odvod × výmera — PODĽA TOHO sa radí
  chranena INTEGER,             -- 1 = chránená pôda (vyníma sa ťažko) → v radení dole
  lv_no INTEGER,                -- LV celku (deep-link + createDeal)
  n_owners INTEGER,
  reason TEXT,
  criteria_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_up_ku_class ON up_cases(kod_ku, classification);
CREATE INDEX IF NOT EXISTS ix_up_naklad ON up_cases(classification, chranena, naklad_vynatie_eur);
