-- 0029_up_zones.sql — ÚP zóny (funkčné plochy ako polygóny) + registry ÚP zdrojov per k.ú.
CREATE TABLE IF NOT EXISTS up_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  code TEXT,                 -- kód zóny (napr. 501)
  name TEXT,                 -- názov funkčnej plochy
  ipp REAL, izp REAL, kz REAL,
  character TEXT,            -- rozvojove | stabilizovane | nezastavatelne
  kategoria TEXT,
  pripustne TEXT, podmienecne TEXT, nepripustne TEXT,
  geometry_json TEXT NOT NULL,   -- GeoJSON Polygon (WGS84, jeden vonkajší ring)
  source TEXT,              -- import | draw | wms
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_up_zones ON up_zones(dataset_id);

-- Registry ÚP zdrojov per k.ú. (auto-connect + monitoring zmien)
CREATE TABLE IF NOT EXISTS up_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  kind TEXT NOT NULL,       -- wms | geojson | raster | link
  label TEXT,
  url TEXT NOT NULL,
  last_checked INTEGER,     -- unix sekundy
  last_hash TEXT,           -- na detekciu zmeny
  changed INTEGER DEFAULT 0,-- 1 = zdroj sa zmenil od posledného potvrdenia
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_up_sources ON up_sources(dataset_id);
