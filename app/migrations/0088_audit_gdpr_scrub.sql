-- 0088: Z auditu odstrániť mená dotknutých osôb pri GDPR žiadostiach a výmazoch.
-- Dôvod (review 2026-11-10): submitDataSubjectRequest/applyErasure zapisovali do audit_log celé meno
-- („Výmaz: <meno>") a getAudit bol verejný GET bez prihlásenia — kto žiadal o výmaz, bolo čitateľné
-- z internetu. Kód už zapisuje len ID žiadosti; tu sa vyčistia staršie záznamy. Meno ostáva len
-- v data_subject_requests (prístup len admin). Idempotentné.
UPDATE audit_log SET detail = 'Žiadosť (meno odstránené z auditu)'
  WHERE action = 'gdpr.request' AND detail NOT LIKE '%#%';
UPDATE audit_log SET detail = 'Výmaz (meno odstránené z auditu)'
  WHERE action = 'gdpr.erasure' AND detail NOT LIKE '%žiadosti #%';
