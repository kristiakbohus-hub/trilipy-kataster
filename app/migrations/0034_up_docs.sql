-- 0034_up_docs.sql — register publikovaných ÚP dokumentov obce (auto-fetch z webygroup CMS a pod.).
CREATE TABLE IF NOT EXISTS up_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  title TEXT,
  url TEXT NOT NULL,
  kind TEXT,               -- vykres | text | schema | ine
  source_page TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(dataset_id, url)
);
CREATE INDEX IF NOT EXISTS ix_up_docs ON up_docs(dataset_id, kind);
