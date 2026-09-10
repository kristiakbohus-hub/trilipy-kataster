-- 0060_gdpr.sql — práva dotknutých osôb (GDPR) + suppression (koho nespracúvať/neoslovovať).
CREATE TABLE IF NOT EXISTS data_subject_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,              -- erasure | objection | access | rectification
  subject_name TEXT NOT NULL,
  subject_ku   TEXT,
  subject_lv   TEXT,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'new',-- new | resolved
  by_user      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);
CREATE TABLE IF NOT EXISTS suppression (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                -- name | lv | parcel
  key        TEXT NOT NULL,                -- normalizované meno / '<ku>:<lv>' / '<ku>:<parcel>'
  orig       TEXT,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_suppression_key ON suppression(kind, key);
CREATE INDEX IF NOT EXISTS ix_dsr_status ON data_subject_requests(status);
