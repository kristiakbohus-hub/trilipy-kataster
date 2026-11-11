-- 0105 — (bod 24) STAVBY V TERÉNE BEZ ZÁPISU v katastri: budova v ZBGIS (≥ 25 m², ≥ 60 % v parcele), ale na parcele
-- nie je zapísaná stavba (A = kataster nemá žiadnu stavbu, B = mapa má obrys budovy, SPI nemá stavbu).
-- Zdroj: ZBGIS budovy (© ÚGKK SR, CC BY 4.0) × SPI. ~8 % falošných zhôd (zastaraná ZBGIS, stavba na susednej
-- parcele). Väčšina sú vedľajšie stavby (kôlne, garáže) — rodinné domy filtrujeme podľa využitia.
CREATE TABLE IF NOT EXISTS unregistered_buildings (
  dataset_id  TEXT NOT NULL,
  parcel_no   TEXT NOT NULL,
  building_m2 REAL, parcel_m2 REAL, share REAL, n_budov INTEGER, max_m2 REAL,
  vyuzitie    TEXT,     -- ZBGIS: individualResidence, ancillary, industrial, trade…
  druh        TEXT,     -- ZBGIS druh (shed, house…)
  kategoria   TEXT,     -- A | B
  lat REAL, lon REAL,
  PRIMARY KEY (dataset_id, parcel_no)
);
CREATE INDEX IF NOT EXISTS ix_unreg_use ON unregistered_buildings(vyuzitie, kategoria);
