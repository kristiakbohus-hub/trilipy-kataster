-- 0015_ce_schema.sql — schéma pre C-KN↔E-KN, evidenčný list (užívateľ) a BPEJ. Jednorazové ALTER-y.
-- (A) vysporiadanosť + E-KN referencia; (B) BPEJ + odňatie; (C) celok/užívateľ (evidenčný list).
ALTER TABLE parcels ADD COLUMN celok INTEGER;            -- pa.CEL — celok (evidenčný list); meno užívateľa je v tabuľke celky (gatované)
ALTER TABLE parcels ADD COLUMN settled INTEGER;          -- (A) 1=vysporiadaná (UO=0, priamo na C-KN LV), 0=má E-KN pod sebou
ALTER TABLE parcels ADD COLUMN ekn_ref TEXT;             -- (A) referencia na E-KN parcelu (UO≠0, napr. 4886/1)
ALTER TABLE parcels ADD COLUMN bpej TEXT;                -- (B) 7-cifrový BPEJ kód
ALTER TABLE parcels ADD COLUMN bpej_skupina INTEGER;     -- (B) skupina kvality 1–9
ALTER TABLE parcels ADD COLUMN odnatie_eur REAL;         -- (B) sadzba €/m² za trvalé odňatie (NV 58/2013)

CREATE TABLE IF NOT EXISTS celky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  celok INTEGER NOT NULL,      -- uz.CEL
  uzivatel TEXT,               -- uz.UZI (historický užívateľ)
  ico TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS ix_celky ON celky(dataset_id, celok);

-- (B) cenník odvodov za odňatie poľnohospodárskej pôdy (NV 58/2013 Z.z.) — skupina kvality → €/m²
CREATE TABLE IF NOT EXISTS bpej_cennik (
  skupina INTEGER PRIMARY KEY,   -- 1..9
  eur_m2 REAL NOT NULL,          -- základná sadzba trvalé odňatie €/m²
  popis TEXT
);
