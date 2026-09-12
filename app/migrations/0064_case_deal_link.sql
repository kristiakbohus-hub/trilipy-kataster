-- 0064_case_deal_link.sql — Case = nadradený spis, deal jeho súčasť + prepojovacia vrstva.
-- Aditívne, nič nemení na existujúcich dátach/funkciách.
CREATE TABLE IF NOT EXISTS case_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    INTEGER NOT NULL,
  link_type  TEXT NOT NULL,          -- parcel | lv | owner | deal | doc
  dataset_id TEXT,
  ref        TEXT NOT NULL,          -- lv_no / parcel_no / meno vlastníka / deal id / report id
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_case_links_case ON case_links(case_id, link_type);
ALTER TABLE deals ADD COLUMN case_id INTEGER;
ALTER TABLE deals ADD COLUMN odkup_eur INTEGER;
ALTER TABLE deals ADD COLUMN next_step TEXT;
