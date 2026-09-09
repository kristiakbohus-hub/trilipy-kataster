-- 0058_parcels_ds_lv_idx.sql — index parcels(dataset_id, lv_no) pre lacné per-LV lookupy.
-- Bez neho E-KN post-filter v NL prieskume skenoval celý dataset (7971 riadkov/3 LV). S indexom číta len parcely daného LV.
CREATE INDEX IF NOT EXISTS idx_parcels_ds_lv ON parcels(dataset_id, lv_no);
