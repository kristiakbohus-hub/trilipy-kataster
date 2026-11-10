-- 0091: upozornenie na NOVÚ zhodu dopytu (kupujúci). Alert runner (9:05/17:05) prejde aktívne dopyty,
-- napáruje pozemky a inzeráty a ohlási len tie, ktoré ešte nevidel. Prvý prechod dopytu = základ
-- (zhody sa len zaevidujú) — aktuálne zhody používateľ vidí hneď v karte, netreba ich zahlcovať.
CREATE TABLE IF NOT EXISTS buyer_match_seen (
  request_id  INTEGER NOT NULL,
  mkey        TEXT NOT NULL,              -- L:<kod_ku>:<parcely>:<účel> | M:<url inzerátu>
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (request_id, mkey)
);
ALTER TABLE buyer_requests ADD COLUMN last_matched TEXT;
