-- 0097: MAPA ako ZBGIS (zadanie vlastníka 2026-11-11) — vyhľadávanie parciel C aj E, LV a stavieb
-- podľa súpisného čísla v zamknutom k.ú. Parcely E a stavby sa do appky dovtedy neposielali (D1 mala
-- len parcely C s obrysom z mapy), takže LV založené na parcelách E nemali v appke výpis ani hľadanie.
-- Plní ich Mac skript 41_IMPORT/kataster_lvparts_push.py cez /api/ingest-lvparts.
ALTER TABLE lv_buildings ADD COLUMN supisne_cislo TEXT;
CREATE INDEX IF NOT EXISTS ix_lv_parcels_no ON lv_parcels(dataset_id, register, parcel_no);
CREATE INDEX IF NOT EXISTS ix_lv_buildings_sc ON lv_buildings(dataset_id, supisne_cislo);
CREATE INDEX IF NOT EXISTS ix_parcels_no ON parcels(dataset_id, parcel_no);
