-- 0103 — DRUHÝ FAKTOR (TOTP, RFC 6238) pri prihlásení (bod 29, 2026-11-11). Zapína si ho používateľ sám
-- (odporúčané pre admina): po hesle chce appka 6-miestny kód z overovacej aplikácie.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_pending TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
