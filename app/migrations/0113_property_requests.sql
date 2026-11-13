-- 0113 — EVIDENCIA ŽIADOSTÍ k nehnuteľnosti (2026-11-13, porovnanie s parcelnik.sk): vyjadrenia správcov sietí
-- a územnoplánovacia informácia obce. Koncept žiadosti tlačí /ziadosti (nič sa neodosiela automaticky); tu sa
-- eviduje odoslanie, odpoveď a jej stručný obsah, ktorý sa potom ukáže v liste nehnuteľnosti. Bez osobných údajov.
CREATE TABLE IF NOT EXISTS property_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id  TEXT NOT NULL,
  ref         TEXT NOT NULL,             -- 'p:1500/2' (hlavná parcela) alebo 'lv:123'
  kind        TEXT NOT NULL,             -- elektrina | plyn | voda | telekom_st | telekom_orange | up_obec
  status      TEXT NOT NULL DEFAULT 'pripravena',  -- pripravena | odoslana | odpoved | bez_odpovede
  sent_at     TEXT,
  answered_at TEXT,
  outcome     TEXT,                      -- ok | pozor | riziko (výsledok odpovede pre semafor)
  summary     TEXT,                      -- stručný obsah odpovede bežnou rečou
  ref_no      TEXT,                      -- číslo vyjadrenia
  valid_until TEXT,                      -- platnosť vyjadrenia
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dataset_id, ref, kind)
);
CREATE INDEX IF NOT EXISTS ix_property_requests_ds ON property_requests(dataset_id, ref);
