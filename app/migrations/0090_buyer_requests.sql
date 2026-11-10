-- 0090: KUPUJÚCI — evidencia dopytu (plán vlastníka 2026-11-10: popri pozemkoch rovno aj kupci).
-- Kto chce čo kúpiť (osoba, firma, developer, stavebná firma, investor), kde, akú výmeru, za koľko
-- a dokedy. Appka k záznamu automaticky páruje pozemkové príležitosti a trhové inzeráty; pri každom
-- pozemku naopak ukáže zhodný dopyt. Kontakt sa zadáva RUČNE — appka kontakty osôb nedohľadáva.
CREATE TABLE IF NOT EXISTS buyer_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,              -- osoba | firma | developer | stavebna_firma | investor
  name        TEXT NOT NULL,
  ico         TEXT,
  contact     TEXT,                       -- ručne zadaný kontakt (owner-sensitive pri osobe)
  source      TEXT NOT NULL DEFAULT 'manual',   -- manual | os_tri_lipy
  ptype       TEXT NOT NULL,              -- pozemok | byt | dom | chata | komercne
  purpose     TEXT,                       -- residential | retail | industrial | rekreacia
  area_min    REAL,
  area_max    REAL,
  budget_max  REAL,
  locations   TEXT,                       -- k.ú. kódy / názvy k.ú. / okresy, oddelené čiarkou
  timeframe   TEXT,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'aktivny',  -- aktivny | pozastaveny | uzavrety
  user_id     TEXT,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_buyer_requests_status ON buyer_requests(status, ptype);
