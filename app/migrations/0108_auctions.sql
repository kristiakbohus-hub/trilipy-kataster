-- 0108 — DRAŽBY A KONKURZY (bod 26, 2026-11-11): oznámenia o dražbách nehnuteľností (Notársky centrálny register
-- dražieb a ďalšie verejné zdroje). Fyzická osoba len ako „fyzická osoba" — žiadne mená, adresy ani dátumy narodenia.
CREATE TABLE IF NOT EXISTS auctions (
  source TEXT NOT NULL, id TEXT NOT NULL, url TEXT,
  published TEXT, auction_date TEXT, okres TEXT, obec TEXT, ku_name TEXT,
  property_type TEXT, parcels TEXT, lv TEXT,
  price_min_eur REAL, price_estimate_eur REAL,
  auctioneer_company TEXT, party TEXT, note TEXT,
  updated TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, id)
);
CREATE INDEX IF NOT EXISTS ix_auctions_okres ON auctions(okres, auction_date);
