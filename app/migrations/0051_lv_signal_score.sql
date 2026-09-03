-- 0051_lv_signal_score.sql — predpočítané skóre LV signálu (šetrí D1 čítania v Deal radare).
-- Radar predtým skenoval ~8000 riadkov/load a skóroval v JS; teraz číta top-N cez index.
-- Váhy identické s getDealRadar: co 0.30 (min 20) / spf 0.25 / dedic 0.15 / buildable 0.15 / absent 0.10 / clean 0.05, wsum 0.95.

ALTER TABLE lv_signals ADD COLUMN signal_score REAL DEFAULT 0;

UPDATE lv_signals SET signal_score = ROUND(100.0 * (
    0.30 * MIN(COALESCE(co_owners,0), 20) / 20.0
  + 0.25 * COALESCE(has_spf,0)
  + 0.15 * COALESCE(dedic,0)
  + 0.15 * COALESCE(buildable,0)
  + 0.10 * COALESCE(absenter_ratio,0)
  + 0.05 * COALESCE(clean_title,0)
) / 0.95);

CREATE INDEX IF NOT EXISTS idx_lv_signal_score ON lv_signals(signal_score);

-- budúce inserty (nové k.ú. cez migrácie) dostanú skóre automaticky
DROP TRIGGER IF EXISTS lv_signals_score_ai;
CREATE TRIGGER lv_signals_score_ai AFTER INSERT ON lv_signals BEGIN
  UPDATE lv_signals SET signal_score = ROUND(100.0 * (
      0.30 * MIN(COALESCE(NEW.co_owners,0), 20) / 20.0
    + 0.25 * COALESCE(NEW.has_spf,0)
    + 0.15 * COALESCE(NEW.dedic,0)
    + 0.15 * COALESCE(NEW.buildable,0)
    + 0.10 * COALESCE(NEW.absenter_ratio,0)
    + 0.05 * COALESCE(NEW.clean_title,0)
  ) / 0.95)
  WHERE dataset_id = NEW.dataset_id AND lv_no = NEW.lv_no;
END;
