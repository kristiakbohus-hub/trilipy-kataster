-- 0030_market.sql — trhové ceny zo scrapu inzercie: denný index + príležitosti + meta.
-- Dáta plní Mac scraper → publikuje market-data.json → Worker ho fetchne (refreshMarketData) → sem.
CREATE TABLE IF NOT EXISTS market_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  okres TEXT, obec TEXT,
  ptype TEXT,               -- byt | dom | pozemok | komercne
  deal TEXT,                -- predaj | prenajom
  day TEXT,                 -- YYYY-MM-DD
  median_eur_m2 REAL, p25 REAL, p75 REAL, cnt INTEGER,
  UNIQUE(okres, obec, ptype, deal, day)
);
CREATE INDEX IF NOT EXISTS ix_market_index ON market_index(okres, ptype, deal, day);

CREATE TABLE IF NOT EXISTS market_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT, ext_id TEXT, url TEXT,
  title TEXT, ptype TEXT, deal TEXT,
  okres TEXT, obec TEXT, area_m2 REAL, rooms INTEGER,
  price_eur REAL, price_per_m2 REAL,
  first_seen TEXT, last_seen TEXT, days_on_market INTEGER,
  price_drop_pct REAL, below_market_pct REAL,
  flags TEXT,               -- csv: drop,long,below
  updated_at TEXT,
  UNIQUE(source, ext_id)
);
CREATE INDEX IF NOT EXISTS ix_market_opp ON market_opportunities(okres, ptype, flags);

CREATE TABLE IF NOT EXISTS market_meta ( key TEXT PRIMARY KEY, value TEXT );
