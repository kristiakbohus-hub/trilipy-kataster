-- 0096: TELEGRAM — ranný súhrn s evidenciou odoslania (rozhodnutie vlastníka 2026-11-11).
-- Súhrn posiela Mac o 7:30; keď Mac neposlal, pošle ho cloud. Kto ho pošle, si ho najprv „zaberie"
-- (tg_deliveries) → nikdy nepríde dvakrát. Položky, ktoré už odišli, sa evidujú (tg_seen) → nový
-- inzerát / udalosť ÚP sa pošle len raz (cena pri inzeráte je súčasťou kľúča → ďalší pokles znova).
CREATE TABLE IF NOT EXISTS tg_deliveries (
  key        TEXT PRIMARY KEY,          -- digest:2026-11-11 | watchdog:2026-11-11
  runner     TEXT,                      -- mac | cloud
  status     TEXT NOT NULL,             -- claimed | sent
  claimed_at TEXT,
  sent_at    TEXT,
  info       TEXT                       -- JSON: kľúče položiek na zaevidovanie po odoslaní
);
CREATE TABLE IF NOT EXISTS tg_seen (
  k        TEXT PRIMARY KEY,            -- L:<source>:<ext_id> | T:<source>:<ext_id>:<cena> | U:<obec>|<titulok>
  first_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- okres obce pri zmenách na úradných tabuliach (monitor ho pozná z registra) → filter na okresy súhrnu
ALTER TABLE obec_changes ADD COLUMN okres TEXT;
CREATE INDEX IF NOT EXISTS ix_obec_changes_okres ON obec_changes(okres, detected_at DESC);
