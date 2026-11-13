-- 0116: rozdelené kľúče pre zápisové endpointy (audit GOLD v2, 2026-11-13).
-- Kľúč Macu (25_SAVED_ALERTS/alerts_cron.json) sa v D1 NEUKLADÁ — len jeho SHA-256 (256-bit náhodný kľúč,
-- hash je bezpečné zverejniť). alert_secret (pozná ho aj cloud GitHub Actions) odteraz otvára len
-- ingest-market, run-alerts a tg-digest. Viď ingestSecretOk v src/lib/api/kataster.functions.ts.
INSERT INTO market_meta (key, value) VALUES ('ingest_secret_sha256', '4f5dd80931e05153801d59fa97b27f8347aeadab5970a3a4596b26a3d2d3326b')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
