-- 0065_change_log.sql — história zmien v katastri (Fáza 3). Aditívne.
-- Napĺňa canonical diff engine (Mac) cez /api/ingest-changes; zobrazuje sa na LV/parcele + alerty.
CREATE TABLE IF NOT EXISTS change_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id  TEXT,
  lv_no       INTEGER,
  parcel_no   TEXT,
  entity      TEXT NOT NULL,        -- owner | share | tarcha | title | parcel | lv | score
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  change_type TEXT NOT NULL,        -- added | removed | changed
  importance  TEXT NOT NULL DEFAULT 'normal',  -- high | normal | low
  run_id      TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  alerted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_change_lv ON change_log(dataset_id, lv_no);
CREATE INDEX IF NOT EXISTS ix_change_parcel ON change_log(dataset_id, parcel_no);
CREATE INDEX IF NOT EXISTS ix_change_recent ON change_log(detected_at);
CREATE INDEX IF NOT EXISTS ix_change_alert ON change_log(alerted, importance);
