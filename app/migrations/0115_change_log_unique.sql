-- 0115 — detektor zmien idempotentný (audit GOLD v2, 2026-11-13): ingestChanges robil holý INSERT, takže opakovaný
-- beh toho istého porovnania importov zapísal tie isté zmeny znova. Najprv odstrániť doterajšie duplikáty (ponechať
-- najstarší riadok), potom jedinečný index cez COALESCE (v SQLite sú NULL v UNIQUE navzájom rôzne).
DELETE FROM change_log WHERE id NOT IN (
  SELECT MIN(id) FROM change_log
  GROUP BY COALESCE(run_id, ''), COALESCE(dataset_id, ''), COALESCE(lv_no, -1), COALESCE(parcel_no, ''), entity,
           COALESCE(field, ''), COALESCE(old_value, ''), COALESCE(new_value, ''), change_type
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_change_log_dedup ON change_log (
  COALESCE(run_id, ''), COALESCE(dataset_id, ''), COALESCE(lv_no, -1), COALESCE(parcel_no, ''), entity,
  COALESCE(field, ''), COALESCE(old_value, ''), COALESCE(new_value, ''), change_type
);
