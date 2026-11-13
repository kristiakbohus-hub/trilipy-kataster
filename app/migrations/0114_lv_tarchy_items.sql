-- 0114 — ŤARCHY PO POLOŽKÁCH (časť C LV) s výkladom (2026-11-13, zadanie vlastníka). Plní Mac
-- 41_IMPORT/kataster_tarchy_push.py zo SPI (PV, CDE=1). Štruktúra je bez osobných údajov fyzických osôb
-- (opr_nazov len pri banke/firme/obci/štáte); pôvodný text `txt` vracia appka LEN plnému prístupu.
CREATE TABLE IF NOT EXISTS lv_tarchy_items (
  dataset_id TEXT NOT NULL,
  lv_no      INTEGER NOT NULL,
  idx        INTEGER NOT NULL,
  kat        TEXT NOT NULL,     -- zalozne_pravo | dozivotne_byvanie | pravo_prechodu | siete | uzivanie | predkupne_pravo | exekucia | zakaz | najom | ine
  opr_typ    TEXT,              -- banka | firma | obec | stat | parcely | fyzicka_osoba | neuvedene
  opr_nazov  TEXT,
  parcely    TEXT,
  listina    TEXT,
  rok        INTEGER,
  txt        TEXT,
  PRIMARY KEY (dataset_id, lv_no, idx)
);
