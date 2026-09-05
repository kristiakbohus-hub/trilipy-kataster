-- 0053_auth_collab.sql — reálne účty (email+heslo) + kolaborácia (komentáre, watchlisty, denník aktivity).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analytik',   -- prvý registrovaný účet dostane 'admin'
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

-- Komentáre k parcele/LV (subject_type='parcel'|'lv'|'dataset', subject_id=napr. 'kn-800376:123/4')
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author TEXT,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_comments_subject ON comments(subject_type, subject_id);

-- Watchlisty (sledované parcely/LV/obce) — unikátne per používateľ+subjekt
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  label TEXT,
  note TEXT,
  status TEXT DEFAULT 'novy',              -- novy | rozpracovany | hotovy
  assignee_id TEXT,                        -- priradený kolega (zdieľanie dossieru)
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS ix_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS ix_watchlist_subject ON watchlist(subject_type, subject_id);

-- Denník aktivity (feed) — kto čo robil
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  author TEXT,
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_activity_created ON activity(id DESC);

-- In-app notifikácie (zvonček) — zmeny na watchlistoch + priradenia
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- watch_change | assigned | comment | mention
  subject_type TEXT,
  subject_id TEXT,
  body TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id, is_read);
