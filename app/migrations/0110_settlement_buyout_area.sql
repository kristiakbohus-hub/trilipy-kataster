-- 0110 — VYSPORIADANIE: odhad odkupu z plochy POD STAVBOU (2026-11-12).
-- Doteraz buyout_eur = výmera CELEJ podložnej parcely × €/m². Pri registri E to bola často veľká parcela pozemkovej
-- knihy (napr. 70 ha ornej pôdy), ktorá sa navyše rátala pod každým domom znova → súčet na karte 15,7 mil. €.
-- Teraz sa ráta len kus zeme pod stavbou (parcela C stavby, najviac celá parcela E). land_area_m2/land_druh ostávajú
-- údaje o celej parcele; tieto dva stĺpce hovoria, z čoho je odhad.
ALTER TABLE settlement_cases ADD COLUMN buyout_area_m2 INTEGER;
ALTER TABLE settlement_cases ADD COLUMN buyout_druh TEXT;
