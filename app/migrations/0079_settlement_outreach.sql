-- 0079_settlement_outreach.sql — GOLD 04: ranked owner-outreach ('koho osloviť prvého').
-- Mac engine dopĺňa anonymizovaný rebríček spoluvlastníkov podložného pozemku podľa veľkosti podielu
-- (bez mien — JSON [{share,pct,kind,absent}]). Mená/kontakty ostávajú v gated LV výpise.
ALTER TABLE settlement_cases ADD COLUMN outreach_json TEXT;
