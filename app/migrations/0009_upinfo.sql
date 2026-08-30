-- 0009_upinfo.sql — Územnoplánovacia informácia: body z georeferencovaného ÚP rastra (Fáza D).
CREATE TABLE IF NOT EXISTS up_info (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  parcel_no TEXT,
  functional_area TEXT,
  regulativ TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_up_info ON up_info(dataset_id);
