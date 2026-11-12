-- 0109 — LIST NEHNUTEĽNOSTI (rozhodnutie vlastníka 2026-11-12): predpočítané údaje k nehnuteľnosti z Mac modulov
-- (terén, slnko, stavby, byty, prístup, susedia, mapové vrstvy, BPEJ, vlastníci-agregáty, OSM siete a vybavenosť,
-- obec, klíma, normy). Kontrakt: 13_INFOKAT_CLAUDE/49_LIST_NEHNUTELNOSTI/CONTRACT.md. Bez osobných údajov —
-- len agregáty a typy. Bežná rowid tabuľka (týždenná záloha číta po rowid).
CREATE TABLE IF NOT EXISTS property_facts (
  kod_ku       TEXT NOT NULL,          -- 6-miestny kód k.ú.
  subject_type TEXT NOT NULL,          -- parcel_c | parcel_e | lv | building | flat | ku
  subject_ref  TEXT NOT NULL,          -- „1234/5" | „123" | „sc:45" | „lv:12:v:2:b:7" | kód k.ú.
  grp          TEXT NOT NULL,          -- teren | slnko | stavby | byty | pristup | susedia | mapa | bpej | vlastnici | osm | obec | klima | normy
  data_json    TEXT NOT NULL,
  source       TEXT,
  as_of        TEXT,
  PRIMARY KEY (kod_ku, subject_type, subject_ref, grp)
);
CREATE INDEX IF NOT EXISTS ix_property_facts_grp ON property_facts(kod_ku, grp);

-- Klientska verzia listu cez odkaz bez prihlásenia: snapshot očistený od mien a internej práce v čase zdieľania.
CREATE TABLE IF NOT EXISTS property_shares (
  token       TEXT PRIMARY KEY,         -- 32 náhodných hex znakov
  dataset_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,            -- parcela | lv | stavba | byt
  ref         TEXT NOT NULL,
  title       TEXT,
  snapshot    TEXT NOT NULL,            -- JSON klientskej verzie (bez mien)
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  last_view   TEXT
);
CREATE INDEX IF NOT EXISTS ix_property_shares_ref ON property_shares(dataset_id, kind, ref);
