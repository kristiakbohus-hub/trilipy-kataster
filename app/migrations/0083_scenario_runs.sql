-- 0083_scenario_runs.sql — štatistika behu scenára per k.ú. (koľko sa preverilo, koľko vypadlo a prečo).
-- Dôvod: kontrakt klientskeho reportu (dok. 16 §3 F) vyžaduje sekciu „Prečo iné kandidáty neprešli"
-- vrátane spracovaných / nevyhodnotených / truncated počtov. Push scenárov zámerne posiela LEN
-- MATCH+PROVISIONAL (desaťtisíce REJECTED by D1 zbytočne nafúkli), takže sumár musí prísť zvlášť —
-- jeden riadok na (scenár, k.ú.), nie státisíce riadkov.
CREATE TABLE IF NOT EXISTS scenario_runs (
  scenario TEXT NOT NULL,          -- up | settlement | za | landsearch
  kod_ku TEXT NOT NULL,
  ku_name TEXT,
  examined INTEGER,                -- koľko kandidátov engine vyhodnocoval
  n_match INTEGER,
  n_provisional INTEGER,
  n_rejected INTEGER,
  n_pushed INTEGER,                -- koľko sa reálne dostalo do D1 (cap/limit → truncated)
  reasons_json TEXT,               -- [{"reason":"zoning (bývanie): orná pôda","n":412}, …] top dôvody vylúčenia
  params_json TEXT,                -- parametre behu (plocha od-do, účel, limity) — do sekcie C metodika
  as_of TEXT,                      -- kedy beh prebehol
  PRIMARY KEY (scenario, kod_ku)
);
