-- 0101 — PRÍZNAKY LV zo SPI (zadanie vlastníka 2026-11-11, body 14/15/18): poznámky v časti C (exekúcia,
-- súdne konanie, konkurz, dražba, spochybnené vlastníctvo, zákaz), rozostavané stavby/priestory, chránené
-- nehnuteľnosti (CHKO, NP, pamiatky…). BEZ textu poznámky (obsahuje mená) — len kategória, rok, parcela.
CREATE TABLE IF NOT EXISTS lv_flags (
  dataset_id TEXT NOT NULL,
  lv_no      INTEGER NOT NULL,
  kind       TEXT NOT NULL,   -- exekucia | sudne_konanie | konkurz | drazba | spochybnene | zakaz | poznamka | rozostavana_stavba | rozostavany_priestor | chranena
  label      TEXT NOT NULL,
  year       INTEGER,
  parcel_no  TEXT
);
CREATE INDEX IF NOT EXISTS ix_lv_flags_lv ON lv_flags(dataset_id, lv_no);
CREATE INDEX IF NOT EXISTS ix_lv_flags_kind ON lv_flags(kind, dataset_id, year);
CREATE INDEX IF NOT EXISTS ix_lv_flags_parcel ON lv_flags(dataset_id, parcel_no);
