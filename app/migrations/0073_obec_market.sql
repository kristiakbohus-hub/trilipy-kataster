-- 0073_obec_market.sql — obecné trhové mediány (€/m²) stavebných pozemkov ako CENOVÝ KONTEXT
-- k land-search príležitostiam (LV výpis / prieskum). Počítané na Macu z market_listings (parse obce z titulku,
-- obec_parser.py) — okresné okrsky sú zle geokódované, obec z titulku je spoľahlivejšia. Refresh: denný scraper.
CREATE TABLE IF NOT EXISTS obec_market_median (
  obec TEXT PRIMARY KEY,
  median_ppm2 REAL,
  n INTEGER,
  ptype TEXT DEFAULT 'pozemok_stavebny',
  updated TEXT
);
-- seed (okres Čadca, 2026-09-24) — refresh cez scraper prepíše
INSERT OR IGNORE INTO obec_market_median (obec, median_ppm2, n, updated) VALUES
  ('Čadca',86,8,'2026-09-24'),('Skalité',94,8,'2026-09-24'),('Oščadnica',77,6,'2026-09-24'),
  ('Makov',65,5,'2026-09-24'),('Turzovka',42,4,'2026-09-24'),('Staškov',30,3,'2026-09-24'),
  ('Krásno nad Kysucou',65,3,'2026-09-24'),('Svrčinovec',67,3,'2026-09-24'),('Korňa',67,2,'2026-09-24'),
  ('Olešná',72,1,'2026-09-24'),('Dlhá nad Kysucou',39,1,'2026-09-24'),('Čierne',41,1,'2026-09-24'),
  ('Klokočov',38,1,'2026-09-24');
