-- 0089: evidencia vydaní klientskeho reportu — komu a na aký účel (dok. 16: „share/export audit —
-- oprávnený príjemca a účel"). Review 2026-11-10: report sa dal stiahnuť (JSON) a vytlačiť bez
-- akejkoľvek stopy. Každé vydanie (JSON, CSV, tlač/PDF) teraz vyžaduje príjemcu a účel a zapíše
-- sa sem spolu s `result_hash`, takže sa dá dohľadať, ktorú verziu výsledku kto dostal.
CREATE TABLE IF NOT EXISTS report_exports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario    TEXT NOT NULL,
  kod_ku      TEXT NOT NULL,
  format      TEXT NOT NULL,              -- json | csv | print
  result_hash TEXT NOT NULL,
  recipient   TEXT NOT NULL,              -- komu (firma/osoba alebo „interné")
  purpose     TEXT NOT NULL,              -- na aký účel
  user_id     TEXT,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_report_exports_subject ON report_exports(scenario, kod_ku);
