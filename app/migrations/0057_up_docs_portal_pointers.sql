-- 0057_up_docs_portal_pointers.sql — pointery na mapové portály / ÚP stránky pre 6 k.ú. bez stiahnuteľných ÚP súborov.
-- Tieto obce zverejňujú ÚP len cez mapový portál (mObec) / SEA (enviroportal) — kind='portal' = odkaz do dossieru.
INSERT OR IGNORE INTO up_docs (dataset_id,title,url,kind,source_page) VALUES
('kn-826294','Územný plán – mapový portál obce Korňa (mObec)','https://www.korna.sk/sk/mapovy-portal','portal','Korňa'),
('kn-824852','Územný plán – mapový portál obce Klubina','https://klubina.sk/mapovy-portal-obce-klubina/','portal','Klubina'),
('kn-824551','Územnoplánovacia dokumentácia obce Klokočov (ÚPN 2008)','https://www.klokocov.sk/uradna-tabula/uradne-dokumenty/3374-uzemnoplanovacia-dokumentacia-obce-klokocov-uzemny-plan-2008','portal','Klokočov'),
('kn-813630','Územný plán obce Dunajov – SEA/EIA (enviroportal)','https://www.enviroportal.sk/sk_SK/eia/detail/uzemny-plan-obce-dunajov','portal','Dunajov'),
('kn-810908','Obec Dlhá nad Kysucou – oficiálna stránka (ÚP na vyžiadanie)','https://www.dlhanadkysucou.sk/','portal','Dlhá nad Kysucou'),
('kn-815802','Nová Bystrica – oficiálna stránka obce (k.ú. Harvelka)','https://www.novabystrica.sk/','portal','Harvelka / Nová Bystrica');
