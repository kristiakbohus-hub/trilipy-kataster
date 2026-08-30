-- 0031_market_listings.sql — všetky inzeráty (celé SR) s históriou (navždy).
-- Plní chunkovaný ingest (refreshMarketListings) z market-listings-<i>.json chunkov.
CREATE TABLE IF NOT EXISTS market_listings (
  source TEXT NOT NULL, ext_id TEXT NOT NULL,
  url TEXT, title TEXT, ptype TEXT, deal TEXT,
  obec TEXT, psc TEXT, lat REAL, lng REAL,
  area_m2 REAL, rooms INTEGER, price_eur REAL, ppm2 REAL,
  first_seen TEXT, last_seen TEXT, first_price REAL, flags TEXT,
  PRIMARY KEY(source, ext_id)
);
CREATE INDEX IF NOT EXISTS ix_ml_loc ON market_listings(obec, ptype, deal);
CREATE INDEX IF NOT EXISTS ix_ml_geo ON market_listings(lat, lng);
CREATE INDEX IF NOT EXISTS ix_ml_seen ON market_listings(last_seen);
