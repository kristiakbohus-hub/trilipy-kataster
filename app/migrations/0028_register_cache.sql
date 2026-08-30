-- 0028_register_cache.sql — cache pre živé verejné registre (RPVS, Obchodný vestník). TTL rieši app.
CREATE TABLE IF NOT EXISTS register_cache (
  cache_key TEXT PRIMARY KEY,   -- napr. "rpvs:ico:35697270" | "ov:name:..."
  kind TEXT NOT NULL,           -- rpvs | ov
  payload TEXT NOT NULL,        -- JSON výsledok
  fetched_at INTEGER NOT NULL   -- unix sekundy
);
