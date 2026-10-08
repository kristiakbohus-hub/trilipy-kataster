-- Záznam kontaktu s vlastníkom — most medzi „našli sme príležitosť" a „niečo sa s ňou stalo".
-- Dovtedy appka príležitosť našla a tam to skončilo: nikde nebolo, komu sa už volalo, čo odpovedal
-- a kedy sa ozvať znova. Pri 117 zhodách a 30 k.ú. sa to v hlave udržať nedá.
--
-- `owner_name` je OWNER-SENSITIVE (rovnako ako lv_owners) → čítanie musí byť rolovo gatované.
CREATE TABLE IF NOT EXISTS contact_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id  TEXT,
  lv_no       INTEGER,
  parcel_no   TEXT,
  owner_name  TEXT,                       -- koho sa to týka (owner-sensitive)
  channel     TEXT NOT NULL,              -- list | telefon | email | osobne | ine
  outcome     TEXT NOT NULL,              -- nezastihnuty | zaujem | nezaujem | rozmysli | dohoda | odmietol
  note        TEXT,
  next_at     TEXT,                       -- kedy sa ozvať znova (YYYY-MM-DD), NULL = netreba
  user_id     TEXT,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_contact_subject ON contact_log(dataset_id, lv_no);
CREATE INDEX IF NOT EXISTS ix_contact_next ON contact_log(next_at);
CREATE INDEX IF NOT EXISTS ix_contact_owner ON contact_log(owner_name);
