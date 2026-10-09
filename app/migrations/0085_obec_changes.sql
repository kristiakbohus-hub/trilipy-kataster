-- Zmeny na úradných tabuliach obcí (Mac ÚP monitor → appka).
--
-- POZOR NA POMENOVANIE: monitor sleduje CELÚ úradnú tabuľu obce, nie len územný plán. Z jedného
-- behu (270 zmien, 18 obcí) malo vzťah k pozemkom alebo výstavbe len 8 záznamov; 240 z 270 bolo
-- „removed" a väčšina ostatného sú pozvánky na zasadnutie, VZN a podobne. Nazvať to „zmeny ÚP"
-- by bolo nepravdivé, preto samostatná tabuľka aj samostatný zdroj v karte /zmeny.
--
-- `relevance` triedi, či záznam súvisí s pozemkami/výstavbou — bez toho sa tých 8 užitočných
-- stratí pod 240 zmazanými oznámeniami.
CREATE TABLE IF NOT EXISTS obec_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  obec        TEXT NOT NULL,
  ku_code     TEXT,                       -- monitor ho zatiaľ neplní (sleduje obce, nie k.ú.)
  title       TEXT,
  url         TEXT,
  change      TEXT,                       -- new | changed | removed
  relevance   TEXT NOT NULL DEFAULT 'ine',-- pozemky | vystavba | ine
  detected_at TEXT,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(obec, title, change, detected_at)  -- opakovaný push to neduplikuje
);
CREATE INDEX IF NOT EXISTS ix_obec_changes_det ON obec_changes(detected_at DESC);
CREATE INDEX IF NOT EXISTS ix_obec_changes_rel ON obec_changes(relevance, detected_at DESC);
CREATE INDEX IF NOT EXISTS ix_obec_changes_obec ON obec_changes(obec);
