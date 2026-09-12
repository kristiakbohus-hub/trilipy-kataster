-- 0066_calib.sql — kalibrácia AVM/GDV (Fáza 5). Aditívne.
-- Editovateľné sadzby/náklady/ceny bez zásahu do kódu. Naseedované PRESNE na dnešné kódové hodnoty
-- → po nasadení nulová zmena správania. computeAvm/developmentCalc čítajú calib, kód = fallback.
CREATE TABLE IF NOT EXISTS calib (
  key        TEXT PRIMARY KEY,
  value      REAL NOT NULL,
  category   TEXT NOT NULL,          -- ag_base | region | dev | discount
  label      TEXT,
  unit       TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
-- Agri základ €/m² podľa druhu pozemku (AG_BASE_PPM2)
INSERT OR IGNORE INTO calib (key,value,category,label,unit) VALUES
 ('ag_base.1', 1.5, 'ag_base', 'Orná pôda', '€/m²'),
 ('ag_base.2', 2.0, 'ag_base', 'Chmeľnica', '€/m²'),
 ('ag_base.3', 3.0, 'ag_base', 'Vinica', '€/m²'),
 ('ag_base.4', 6.0, 'ag_base', 'Záhrada', '€/m²'),
 ('ag_base.5', 5.0, 'ag_base', 'Ovocný sad', '€/m²'),
 ('ag_base.6', 1.0, 'ag_base', 'Trvalý trávny porast', '€/m²'),
 ('ag_base.7', 0.6, 'ag_base', 'Lesný pozemok', '€/m²'),
 ('ag_base.8', 0.3, 'ag_base', 'Vodná plocha', '€/m²'),
 ('ag_base.10', 2.5, 'ag_base', 'Ostatná plocha', '€/m²'),
 ('ag_base.default', 1.5, 'ag_base', 'Predvolený (neznámy druh)', '€/m²'),
 ('region.fertile', 1.5, 'region', 'Úrodné nížiny (faktor)', '×'),
 ('region.mountain', 0.65, 'region', 'Hornaté okresy — Kysuce/Orava/Liptov/Spiš (faktor)', '×'),
 ('region.default', 1.0, 'region', 'Ostatné okresy (faktor)', '×'),
 ('dev.m2_per_byt', 70, 'dev', 'Bytový dom — m² ČPP na 1 byt', 'm²'),
 ('dev.naklady_eur_m2', 2800, 'dev', 'Bytový dom — stavebné náklady', '€/m² HPP'),
 ('dev.predaj_eur_m2', 2500, 'dev', 'Bytový dom — predajná cena', '€/m² ČPP'),
 ('dev.low_m2_per_byt', 110, 'dev', 'IBV/RD — m² na 1 jednotku', 'm²'),
 ('dev.low_naklady_eur_m2', 1500, 'dev', 'IBV/RD — stavebné náklady', '€/m² HPP'),
 ('dev.low_predaj_eur_m2', 1900, 'dev', 'IBV/RD — predajná cena', '€/m² ČPP'),
 ('discount.unsettled', 0.8, 'discount', 'Zľava za nevysporiadanosť (faktor)', '×');
