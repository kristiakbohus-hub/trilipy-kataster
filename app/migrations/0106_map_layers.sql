-- 0106 — VRSTVY Z VGI do mapy (body 16/17, 2026-11-11): vecné bremená (TARCHY, číslo vkladu), hranica
-- zastavaného územia obce (ZUOB), obvod pozemkových úprav (OBVODPPU, napr. Bukovina1). Čiary vo WGS84.
CREATE TABLE IF NOT EXISTS map_layers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id  TEXT NOT NULL,
  layer       TEXT NOT NULL,     -- tarchy | zuob | ppu
  label       TEXT,
  geometry_json TEXT NOT NULL    -- [[ [lng,lat], ... ], ...] (MultiLineString súradnice)
);
CREATE INDEX IF NOT EXISTS ix_map_layers ON map_layers(dataset_id, layer);
