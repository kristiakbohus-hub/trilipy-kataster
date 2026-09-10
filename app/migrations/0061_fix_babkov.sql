-- 0061_fix_babkov.sql — oprava placeholder názvu k.ú. 800376 → Babkov (okres Žilina).
-- ÚGKK ESKN kód 800376 = Babkov (obec Lietavská Svinná-Babkov, okres Žilina). NIE Turzovka (tá je 866083).
-- Idempotentné: dotkne sa len riadku, ktorý má ešte placeholder názov.
UPDATE datasets
SET ku_name = 'k.ú. Babkov', region = 'okres Žilina · Žilinský kraj'
WHERE ku_code = '800376' AND ku_name = 'k.ú. 800376';
