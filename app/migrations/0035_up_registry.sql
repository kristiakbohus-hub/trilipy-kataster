-- 0035_up_registry.sql — kompletný ÚP subsystém: číselník obec→ÚP URL, sledovanie zmien, regulatívy.

-- Číselník: k.ú. → ÚP stránka obce (zdroj pre auto-fetch pri importe + denný monitoring).
CREATE TABLE IF NOT EXISTS up_registry (
  ku_code TEXT PRIMARY KEY,
  obec TEXT,
  up_page_url TEXT,
  cms TEXT,
  note TEXT,
  last_check TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
-- seed okres Čadca (overené URL 2026-08-15)
INSERT OR REPLACE INTO up_registry (ku_code, obec, up_page_url, cms) VALUES
 ('800376','Turzovka','https://www.turzovka.sk/mesto/samosprava/strategicke-dokumenty/uzemny-plan/?kateg=47&per_page=200','webygroup'),
 ('843610','Olešná','https://www.obecolesna.sk/sk/uzemny-plan-obce','ine');

-- up_docs: sledovanie zmien dokumentov (verzia = zmena URL/veľkosti; webygroup hash v URL sa mení pri náhrade súboru)
ALTER TABLE up_docs ADD COLUMN size_bytes INTEGER;
ALTER TABLE up_docs ADD COLUMN first_seen TEXT;
ALTER TABLE up_docs ADD COLUMN last_seen TEXT;
ALTER TABLE up_docs ADD COLUMN change_state TEXT;   -- new | changed | current | removed

-- História zmien ÚP (pre signál + zoznam „čo sa zmenilo").
CREATE TABLE IF NOT EXISTS up_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT, ku_code TEXT, title TEXT, url TEXT,
  change TEXT,        -- new | changed | removed
  detected_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_up_changes ON up_changes(dataset_id, detected_at);

-- Regulatívy per funkčná zóna (parsed zo záväznej časti alebo ručne) → development kalkulačka.
CREATE TABLE IF NOT EXISTS up_regulativ (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT, zone_code TEXT, funkcia TEXT,
  izp REAL, kz REAL, ipp REAL, max_vyska REAL, max_podlazi INTEGER,
  note TEXT, source TEXT,   -- parsed | manual
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_up_regulativ ON up_regulativ(dataset_id, zone_code);
