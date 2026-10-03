-- 0078_settlement_resolve.sql — GOLD 04 RESOLVE: odhad odkupu + flavor (disjunktné vs menšinový podiel).
-- Mac engine (settlement_push) dopĺňa: príznak menšinového podielu, výmeru + druh podložného pozemku
-- a orientačný odhad hodnoty (výmera × €/m² podľa druhu) = horná hranica odkupu na vysporiadanie.
ALTER TABLE settlement_cases ADD COLUMN minority_share INTEGER DEFAULT 0;
ALTER TABLE settlement_cases ADD COLUMN land_area_m2 INTEGER;
ALTER TABLE settlement_cases ADD COLUMN land_druh TEXT;
ALTER TABLE settlement_cases ADD COLUMN buyout_eur REAL;
