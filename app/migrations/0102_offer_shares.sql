-- 0102 — ZDIEĽATEĽNÝ ODKAZ NA PONUKU PRE KLIENTA (bod 10, 2026-11-11). Klient otvorí /p/<token> bez prihlásenia
-- a vidí LEN položky ponuky (snapshot zhody: popis, parcela, LV, výmera, cena, dôvody, čo overiť) — žiadne mená
-- vlastníkov ani klienta. Platnosť obmedzená (default 14 dní), dá sa zrušiť.
CREATE TABLE IF NOT EXISTS offer_shares (
  token       TEXT PRIMARY KEY,         -- 32 náhodných hex znakov
  request_id  INTEGER NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  last_view   TEXT
);
CREATE INDEX IF NOT EXISTS ix_offer_shares_req ON offer_shares(request_id);
