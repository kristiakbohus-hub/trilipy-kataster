-- 0081_criteria_json.sql — Property-360 kontrakt (42_NL docs/16): sekcia "Výsledok dopytu" vyžaduje
-- PASS/FAIL/UNKNOWN PO KRITÉRIÁCH, nie len jeden súhrnný reason. Pridáva plnú criteria+evidence
-- maticu (JSON z candidate.py Candidate.criteria) k settlement_cases a za_cases.
ALTER TABLE settlement_cases ADD COLUMN criteria_json TEXT;
ALTER TABLE za_cases ADD COLUMN criteria_json TEXT;
