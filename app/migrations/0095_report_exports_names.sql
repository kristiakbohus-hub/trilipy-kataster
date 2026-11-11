-- 0095: OI-14 (rozhodnutie vlastníka 2026-11-11) — klientsky report smie obsahovať mená fyzických osôb
-- LEN keď ich vlastník pri konkrétnom reporte výslovne zapne; vydanie sa eviduje s týmto príznakom.
ALTER TABLE report_exports ADD COLUMN with_names INTEGER NOT NULL DEFAULT 0;
