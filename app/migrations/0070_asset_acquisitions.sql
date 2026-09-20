-- 0070_asset_acquisitions.sql — NL prieskum: per-nehnuteľnosť AKTUÁLNA akvizícia (byt/parcela/stavba).
-- Jadro presných dopytov „byty prededené v roku 2026", „exekúcia zapísaná od 2025" — na úrovni
-- konkrétnej nehnuteľnosti, nie len LV. Plní sa cez /api/ingest-acquisitions z kanonickej Mac DB
-- (odvodené z SPI: bp/pa/ep/cs.PVZ ↔ vl.PVZ ↔ pv.PVZ; typ = najnovší vlastnícky prevod, rok ≤2027).
CREATE TABLE IF NOT EXISTS asset_acquisitions (
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  lv_number TEXT,
  asset_type TEXT,              -- flat | parcel_c | parcel_e | building
  asset_id INTEGER,            -- lokálne id z kanonickej DB (dedup/upsert)
  unit_number TEXT,
  area_m2 REAL,
  acquisition_kind TEXT,       -- inheritance | sale | gift | execution | lien
  registration_year INTEGER,   -- rok zápisu do KN (1950–2027)
  instrument_year INTEGER,
  owner_addr_differs INTEGER DEFAULT 0,
  has_person INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_aacq_kind_year ON asset_acquisitions(acquisition_kind, registration_year, asset_type);
CREATE INDEX IF NOT EXISTS ix_aacq_ku ON asset_acquisitions(kod_ku);
