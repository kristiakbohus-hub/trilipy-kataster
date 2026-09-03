-- Per-inzerát história ceny (krivka pohybu ceny v čase) — plnené z scrapera cez market-pricehistory-<i>.json chunky.
CREATE TABLE IF NOT EXISTS market_price_history (
  source TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  day TEXT NOT NULL,
  price_eur REAL,
  ppm2 REAL,
  PRIMARY KEY (source, ext_id, day)
);
CREATE INDEX IF NOT EXISTS idx_price_history_listing ON market_price_history(source, ext_id, day);
