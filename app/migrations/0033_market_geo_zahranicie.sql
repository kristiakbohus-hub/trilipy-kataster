-- 0033_market_geo_zahranicie.sql — bazos zahraničné inzeráty do vlastného pseudo-kraja (nie „(neurčené)").
INSERT OR REPLACE INTO okres_kraj (okres, kraj) VALUES
 ('Zahraničie','Zahraničie'),
 ('Česká republika','Zahraničie');
