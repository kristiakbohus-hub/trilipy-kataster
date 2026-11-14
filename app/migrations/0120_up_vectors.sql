-- 0120_up_vectors.sql — vektorizovaný územný plán po k.ú. (2026-11-14, Program ÚP — celý kraj)
-- Súbory sú v R2 (up-vector/<kod>/...), tu len evidencia: formát, veľkosť, verzia ÚP, zdroj, stav k, presnosť, kontrola.
-- fmt: wgs84 (GeoJSON pre mapu) | geojson5514 | gpkg | dxf (export pre architektov, S-JTSK EPSG:5514)
CREATE TABLE IF NOT EXISTS up_vectors (
  kod_ku TEXT NOT NULL,
  fmt TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  bytes INTEGER,
  n_features INTEGER,
  verzia TEXT,
  zdroj TEXT,
  stav_k TEXT,
  presnost_m REAL,
  qa TEXT,
  published_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (kod_ku, fmt)
);
