-- 0104 — (bod 9) FINANČNÁ SILA FIRIEM z RÚZ a (bod 27) NOVÁ VÝSTAVBA zo satelitu (Copernicus HRL Imperviousness).
CREATE TABLE IF NOT EXISTS firm_finance (
  ico      TEXT PRIMARY KEY,
  name     TEXT,
  year     INTEGER,          -- rok poslednej riadnej závierky
  revenue  REAL,             -- tržby / čisté výnosy (€)
  assets   REAL,             -- majetok spolu netto (€)
  equity   REAL,             -- vlastné imanie (€)
  profit   REAL,             -- výsledok hospodárenia po zdanení (€)
  nace     TEXT,
  founded  TEXT,
  updated  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Nová zástavba 2018–2024 podľa k.ú. (súhrn) a ohniská (zhluky ≥ 1000 m²). Zdroj: Copernicus CLMS, voľná licencia.
CREATE TABLE IF NOT EXISTS construction_ku (
  kod_ku        TEXT PRIMARY KEY,
  nazov         TEXT,
  okres         TEXT,
  period        TEXT,
  new_ha        REAL,
  new_ha_bez_infra REAL,
  new_ha_2018_2021 REAL,
  new_ha_2021_2024 REAL,
  intensity     REAL,          -- ha na km² k.ú.
  hotspots      INTEGER,
  updated       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS construction_hotspots (
  kod_ku   TEXT NOT NULL,
  id       INTEGER NOT NULL,
  lat      REAL NOT NULL,
  lon      REAL NOT NULL,
  area_m2  REAL,
  period   TEXT,
  typ      TEXT,              -- zastavba | infrastruktura
  density  REAL,              -- % zapečatenia 2024
  PRIMARY KEY (kod_ku, id)
);
