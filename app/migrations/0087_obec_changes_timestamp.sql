-- Normalizácia už zapísaných časových známok v obec_changes.
--
-- Oprava samotného zápisu nestačila: 113 riadkov vložených pred ňou má ISO tvar s „T"
-- („2026-10-08T07:05:39"), kým SQLite `datetime()` používa medzeru. Dva dôsledky:
--   1) radenie klame — „T" (0x54) > medzera (0x20), takže obecný záznam z rána sa radí NAD
--      katastrálny z poobedia a „najnovšie prvé" nie je pravda,
--   2) UNIQUE(obec,title,change,detected_at) by starý riadok nerozpoznal ako ten istý, takže
--      ďalší push by ho VLOŽIL DRUHÝKRÁT — oprava writera bez tejto migrácie by ticho
--      vyrábala duplikáty.
UPDATE obec_changes
   SET detected_at = substr(replace(detected_at, 'T', ' '), 1, 19)
 WHERE detected_at LIKE '%T%';
