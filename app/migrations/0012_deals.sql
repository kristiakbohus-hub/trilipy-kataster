-- 0012_deals.sql — deal pipeline: deal = LV, vlastníci ako úkony, poznámky. (Bod 2b)
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  lv_no INTEGER NOT NULL,
  ku_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',   -- new | checking | contacted | negotiation | closed_won | closed_lost
  score INTEGER,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS ix_deals_lv ON deals(dataset_id, lv_no);

CREATE TABLE IF NOT EXISTS deal_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  share TEXT,
  addr TEXT,
  is_company INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending',  -- pending | contacted | agreed | signed | declined
  note TEXT
);
CREATE INDEX IF NOT EXISTS ix_deal_tasks ON deal_tasks(deal_id);

CREATE TABLE IF NOT EXISTS deal_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,
  author_role TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_deal_notes ON deal_notes(deal_id);
