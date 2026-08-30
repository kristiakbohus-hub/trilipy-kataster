-- 0004_phase3.sql — Zoning/ÚP (9.17), Access Review (9.18), Cases (9.19).
-- Screening-only. Žiadny automatický právny/ÚP záver. Idempotentné.

CREATE TABLE IF NOT EXISTS zoning_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,            -- up_layer | up_pdf | access_layer
  source_date TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS zoning_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  category TEXT NOT NULL,        -- zoning | access
  target TEXT,
  label TEXT NOT NULL,
  status TEXT NOT NULL,          -- screening | possible | unclear | review | unknown
  note TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,           -- vysporiadanie | screening | pristup | ine
  status TEXT NOT NULL DEFAULT 'open',   -- open | review | done
  owner_role TEXT,
  linked_ref TEXT,
  next_steps TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  author_role TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_zsrc_ds ON zoning_sources(dataset_id);
CREATE INDEX IF NOT EXISTS idx_zfind_ds ON zoning_findings(dataset_id);
CREATE INDEX IF NOT EXISTS idx_cases_ds ON cases(dataset_id);
CREATE INDEX IF NOT EXISTS idx_cnotes_case ON case_notes(case_id);

DELETE FROM case_notes;
DELETE FROM cases;
DELETE FROM zoning_findings;
DELETE FROM zoning_sources;

INSERT INTO zoning_sources (dataset_id,name,kind,source_date,note) VALUES
('kn-851388','Územný plán obce — funkčné využitie','up_layer','2021','Screening-only. Rasterový/PDF podklad, nie vektorová regulácia.'),
('kn-851388','Cestná sieť a prístupové vrstvy (interné)','access_layer','2026','Odvodené vrstvy prístupu; fyzický prístup ≠ právny prístup.'),
('kn-800376','Územný plán obce — funkčné využitie','up_layer','2019','Screening-only. Manuálne overenie nutné.'),
('kn-800376','Cestná sieť a prístupové vrstvy (interné)','access_layer','2026','Odvodené vrstvy prístupu.');

INSERT INTO zoning_findings (dataset_id,category,target,label,status,note,source_ref) VALUES
('kn-851388','zoning','výber IBV blok','Prekryv s plochou bývania (IBV)','screening','Prekryv rasterovej plochy — nutné odborné overenie stavebnosti.','ÚP 2021'),
('kn-851388','zoning','parcela 11658','Poľnohospodárska plocha (mimo IBV)','screening','Screening podľa farebnej plochy; nie právny záver.','ÚP 2021'),
('kn-851388','access','LV 4079','Prístup z miestnej komunikácie','possible','Fyzický prístup pravdepodobný; právny titul neoverený.','cestná sieť'),
('kn-851388','access','parcela 10989/15','Bez evidovaného právneho prístupu','unclear','Susedí s cudzou parcelou; potrebné vecné bremeno alebo preverenie.',''),
('kn-800376','zoning','dataset','Zmiešané funkčné využitie','review','Viac funkčných plôch; potrebné parcelné rozlíšenie a review.','ÚP 2019'),
('kn-800376','access','výber','Prístup cez súkromnú parcelu','unclear','Prístup možný cez cudzí pozemok — právne neistý.','');

INSERT INTO cases (dataset_id,title,kind,status,owner_role,linked_ref,next_steps) VALUES
('kn-851388','Vysporiadanie LV 4079 — Kysuce','vysporiadanie','review','geodet','LV 4079','Doplniť geometriu parcely, pripraviť prehľad spoluvlastníkov pre právnika (mimo systému).'),
('kn-851388','E-KN screening — nevysporiadané parcely','screening','open','analytik','výber','Prejsť TOP kandidátov, priradiť prioritu a mapový kontext.'),
('kn-800376','Prístup k rozvojovej lokalite','pristup','open','manager','dataset','Preveriť právny prístup a prípadné vecné bremená; založiť zoning review.');

INSERT INTO case_notes (case_id,author_role,body) VALUES
(1,'analytik','Založené z E-KN screeningu. Vysoký počet spoluvlastníkov na LV.'),
(1,'geodet','Geometria parcely potrebuje review pred reportom.'),
(3,'manager','Prístup vyzerá cez súkromnú parcelu — treba právne preveriť.');
