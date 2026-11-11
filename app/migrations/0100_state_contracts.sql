-- 0100 — ŠTÁTNE ZMLUVY O POZEMKOCH z CRZ (rozhodnutie vlastníka 2026-11-11 „Riziká a štátne predaje").
-- Predaje, zámeny, vecné bremená a nájmy pozemkov štátnych správcov (SPF, Lesy SR, SVP, ŽSR, NDS…).
-- BEZ osobných údajov: druhá strana len firma/obec, inak „fyzická osoba"; predmet zmluvy sa neukladá.
CREATE TABLE IF NOT EXISTS state_contracts (
  crz_id    TEXT PRIMARY KEY,
  day       TEXT NOT NULL,          -- deň zverejnenia v CRZ
  signed    TEXT,                   -- dátum podpisu
  publisher TEXT NOT NULL,          -- štátny správca (zverejňovateľ)
  kind      TEXT NOT NULL,          -- kupa | zamena | vecne_bremeno | najom
  amount    REAL,
  ku_name   TEXT,
  okres     TEXT,
  party     TEXT,                   -- firma / obec, alebo „fyzická osoba"
  url       TEXT
);
CREATE INDEX IF NOT EXISTS ix_state_contracts_day ON state_contracts(day);
CREATE INDEX IF NOT EXISTS ix_state_contracts_okres ON state_contracts(okres, day);
