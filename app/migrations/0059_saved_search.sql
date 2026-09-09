-- 0059_saved_search.sql — uložené NL hľadania + alerty (notifications reuse z 0053).
CREATE TABLE IF NOT EXISTS saved_search (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  query      TEXT NOT NULL,                 -- pôvodná NL veta (re-runuje sa cez nlQuery)
  sort       TEXT,                          -- score | area | owners
  alert      INTEGER NOT NULL DEFAULT 0,    -- 1 = sledovať zmeny
  channels   TEXT NOT NULL DEFAULT 'inapp', -- CSV: inapp,telegram
  last_run   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_saved_user ON saved_search(user_id);
CREATE TABLE IF NOT EXISTS alert_seen (
  saved_id   INTEGER NOT NULL,
  gid        TEXT NOT NULL,                 -- dataset_id || ':' || lv_no
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (saved_id, gid)
);
