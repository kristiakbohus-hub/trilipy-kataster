-- TRI LIPY KATASTER CORE — D1 schéma. Additívne (CREATE TABLE IF NOT EXISTS).
-- Jedna DB pre celý live deploy. Bound ako env.DB.

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  ku_code TEXT NOT NULL,
  ku_name TEXT NOT NULL,
  region TEXT NOT NULL,
  kn_type TEXT NOT NULL,                 -- C-KN | E-KN
  status TEXT NOT NULL,                  -- ready | ready_with_warnings | blocked
  geometry_coverage INTEGER NOT NULL DEFAULT 0,   -- %
  canonical_confidence REAL NOT NULL DEFAULT 0,   -- 0..1
  import_version TEXT NOT NULL DEFAULT 'v1',
  updated_at TEXT NOT NULL DEFAULT (date('now')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  parcel_no TEXT NOT NULL,
  kn_type TEXT NOT NULL,
  area_m2 INTEGER NOT NULL DEFAULT 0,
  use_type TEXT,
  lv_no INTEGER,
  geometry_quality TEXT NOT NULL DEFAULT 'derived',  -- verified | derived | review
  centroid_lat REAL,
  centroid_lng REAL,
  geometry_json TEXT                     -- GeoJSON Polygon (odvodená pracovná geometria)
);

CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  parcel_id TEXT NOT NULL,
  display_label TEXT NOT NULL,           -- sanitizovaný štítok (nie reálne meno)
  share TEXT,
  lv_no INTEGER,
  protected INTEGER NOT NULL DEFAULT 1   -- owner-sensitive → rolovo chránené
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  parcel_id TEXT,
  kind TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',    -- new | review | qualified | blocked
  rationale TEXT,
  est_price_eur INTEGER
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- evidence_list | parcel_pack | map_sheet
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | review | signed
  audit_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  step TEXT NOT NULL,
  state TEXT NOT NULL,                   -- done | failed | skipped | blocked | running
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT,
  action TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parcels_dataset ON parcels(dataset_id);
CREATE INDEX IF NOT EXISTS idx_owners_parcel ON owners(parcel_id);
CREATE INDEX IF NOT EXISTS idx_opps_dataset ON opportunities(dataset_id);
CREATE INDEX IF NOT EXISTS idx_reports_dataset ON reports(dataset_id);
CREATE INDEX IF NOT EXISTS idx_jobs_dataset ON import_jobs(dataset_id);
