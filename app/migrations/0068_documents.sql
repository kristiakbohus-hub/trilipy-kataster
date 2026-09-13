-- 0068_documents.sql — Fáza 6: dokumenty (PDF/DOCX/GP/ZPMZ/zmluvy/foto) v R2 (STORAGE), prepojené na spis/LV/parcelu/vlastníka.
-- Aditívne. Bytes v R2 (kľúč docs/<dataset_id>/<id>), metadáta tu. Reuse up_rasters vzoru.
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  dataset_id   TEXT NOT NULL,
  case_id      INTEGER,                 -- ak visí na spise
  subject_type TEXT,                    -- lv | parcel | owner | case | null
  subject_ref  TEXT,                    -- lv_no / parcel_no / meno vlastníka / case id
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'ine',  -- vypis | GP | ZPMZ | zmluva | foto | ine
  mime         TEXT,
  size_bytes   INTEGER,
  r2_key       TEXT NOT NULL,
  note         TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS ix_documents_subject ON documents(dataset_id, subject_type, subject_ref);
