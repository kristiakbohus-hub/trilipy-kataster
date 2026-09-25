-- Zmazané/stiahnuté inzeráty: dátum, keď re-verify zistil, že bazos inzerát presmeroval (301) = vymazaný z ponuky.
-- NULL = aktívny/neznámy; dátum = potvrdene zmiznutý (posledná cena = odhad clearing ceny → sold-comps + AVM).
ALTER TABLE market_listings ADD COLUMN removed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_market_listings_removed ON market_listings(removed_at);
