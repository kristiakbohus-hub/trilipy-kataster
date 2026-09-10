-- 0062_dataset_stats.sql — predpočítané počty na datasete.
-- Koniec COUNT(*) skenov nad 952k+ riadkami pri KAŽDOM načítaní stránky (Mission Control, Dashboard, System, detail).
-- Stránky teraz čítajú malé stĺpce z 15-riadkovej datasets tabuľky. Backfill je jednorazový.
ALTER TABLE datasets ADD COLUMN n_parcels INTEGER;
ALTER TABLE datasets ADD COLUMN n_owners INTEGER;
ALTER TABLE datasets ADD COLUMN sum_area_m2 REAL;
UPDATE datasets SET
  n_parcels = (SELECT COUNT(*) FROM parcels p WHERE p.dataset_id = datasets.id),
  n_owners = (SELECT COUNT(*) FROM lv_owners o WHERE o.dataset_id = datasets.id),
  sum_area_m2 = (SELECT COALESCE(SUM(area_m2),0) FROM parcels p WHERE p.dataset_id = datasets.id);
