-- Katastrálny druh pozemku (DRP → text) pre land-search parcely → presný AVM „ako-je" (namiesto poľnohosp odhadu).
-- Pozn.: existing_use je OSM využitie (ihrisko/dvor/škola), NIE katastrálny druh — preto samostatný stĺpec.
ALTER TABLE landsearch_results ADD COLUMN druh TEXT;
