-- Údaje od predávajúceho k nehnuteľnosti (2026-11-13): energetický certifikát, povolenia a kolaudácia, rekonštrukcie,
-- známe vady, spory, príslušenstvo, pri byte správca / fond opráv / zálohy, pri pozemku nájom poľnohospodárovi.
-- Zadáva maklér (interná appka); v klientskej verzii s označením „podľa vyhlásenia predávajúceho". Bez osobných údajov.
CREATE TABLE IF NOT EXISTS property_declarations (
  dataset_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,      -- lv | parcel_c | parcel_e | building | flat
  subject_ref TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (dataset_id, subject_type, subject_ref)
);
