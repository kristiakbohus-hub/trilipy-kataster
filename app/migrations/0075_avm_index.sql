-- AVM index: trhový €/m² STAVEBNÝCH pozemkov per okres (asking medián z inzerátov, blend s realizovanými keď je dosť).
-- Ostatné druhy (orná/les/záhrada…) = kalibrované defaulty v kóde. Prepočítava sa pri dennom ingeste.
CREATE TABLE IF NOT EXISTS avm_index (
  okres TEXT PRIMARY KEY,
  ppm2_stavebny REAL,      -- €/m² stavebných pozemkov (medián)
  n_asking INTEGER,        -- počet asking comparables
  ppm2_realized REAL,      -- €/m² z predaných (removed_at) — keď je dosť
  n_realized INTEGER,
  basis TEXT,              -- 'realized' | 'asking' | 'blend'
  updated TEXT
);
