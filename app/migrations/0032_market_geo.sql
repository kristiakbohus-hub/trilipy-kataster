-- 0032_market_geo.sql — rozdeľovník Kraj → Okres → Lokalita pre trhové ceny.
-- Číselník okres→kraj (SR; Bratislava a Košice ako jeden okres tak, ako ich uvádza inzercia)
-- + stĺpec market_listings.okres a backfill z obce (bazos „obec" = OKRESNÉ MESTO = okres).

CREATE TABLE IF NOT EXISTS okres_kraj ( okres TEXT PRIMARY KEY, kraj TEXT NOT NULL );

INSERT OR REPLACE INTO okres_kraj (okres, kraj) VALUES
 ('Bratislava','Bratislavský'),('Malacky','Bratislavský'),('Pezinok','Bratislavský'),('Senec','Bratislavský'),
 ('Dunajská Streda','Trnavský'),('Galanta','Trnavský'),('Hlohovec','Trnavský'),('Piešťany','Trnavský'),('Senica','Trnavský'),('Skalica','Trnavský'),('Trnava','Trnavský'),
 ('Bánovce nad Bebravou','Trenčiansky'),('Ilava','Trenčiansky'),('Myjava','Trenčiansky'),('Nové Mesto nad Váhom','Trenčiansky'),('Partizánske','Trenčiansky'),('Považská Bystrica','Trenčiansky'),('Prievidza','Trenčiansky'),('Púchov','Trenčiansky'),('Trenčín','Trenčiansky'),
 ('Komárno','Nitriansky'),('Levice','Nitriansky'),('Nitra','Nitriansky'),('Nové Zámky','Nitriansky'),('Šaľa','Nitriansky'),('Topoľčany','Nitriansky'),('Zlaté Moravce','Nitriansky'),
 ('Bytča','Žilinský'),('Čadca','Žilinský'),('Dolný Kubín','Žilinský'),('Kysucké Nové Mesto','Žilinský'),('Liptovský Mikuláš','Žilinský'),('Martin','Žilinský'),('Námestovo','Žilinský'),('Ružomberok','Žilinský'),('Turčianske Teplice','Žilinský'),('Tvrdošín','Žilinský'),('Žilina','Žilinský'),
 ('Banská Bystrica','Banskobystrický'),('Banská Štiavnica','Banskobystrický'),('Brezno','Banskobystrický'),('Detva','Banskobystrický'),('Krupina','Banskobystrický'),('Lučenec','Banskobystrický'),('Poltár','Banskobystrický'),('Revúca','Banskobystrický'),('Rimavská Sobota','Banskobystrický'),('Veľký Krtíš','Banskobystrický'),('Zvolen','Banskobystrický'),('Žarnovica','Banskobystrický'),('Žiar nad Hronom','Banskobystrický'),
 ('Bardejov','Prešovský'),('Humenné','Prešovský'),('Kežmarok','Prešovský'),('Levoča','Prešovský'),('Medzilaborce','Prešovský'),('Poprad','Prešovský'),('Prešov','Prešovský'),('Sabinov','Prešovský'),('Snina','Prešovský'),('Stará Ľubovňa','Prešovský'),('Stropkov','Prešovský'),('Svidník','Prešovský'),('Vranov nad Topľou','Prešovský'),
 ('Gelnica','Košický'),('Košice','Košický'),('Košice-okolie','Košický'),('Michalovce','Košický'),('Rožňava','Košický'),('Sobrance','Košický'),('Spišská Nová Ves','Košický'),('Trebišov','Košický');

ALTER TABLE market_listings ADD COLUMN okres TEXT;

-- Backfill: bazos „obec" je v skutočnosti okresné mesto = okres; reality obec ostáva (kraj bude NULL kým nedoplní Nominatim).
UPDATE market_listings SET okres = obec WHERE (okres IS NULL OR okres='') AND obec IS NOT NULL AND obec <> '';

-- Normalizácia variantov na kanonický názov okresu (zhoda s okres_kraj).
UPDATE market_listings SET okres='Bratislava'          WHERE okres LIKE 'Bratislava%' AND okres <> 'Bratislava';
UPDATE market_listings SET okres='Košice'              WHERE okres LIKE 'Košice%'     AND okres NOT IN ('Košice','Košice-okolie');
UPDATE market_listings SET okres='Nové Mesto nad Váhom' WHERE okres IN ('Nové Mesto n.Váhom','Nové Mesto n. Váhom','Nové Mesto n/Váhom');
UPDATE market_listings SET okres='Nové Zámky'          WHERE okres IN ('Štúrovo');
UPDATE market_listings SET okres='Komárno'             WHERE okres IN ('Hurbanovo');
UPDATE market_listings SET okres='Senec'               WHERE okres IN ('Hrubá Borša');
UPDATE market_listings SET okres='Stará Ľubovňa'       WHERE okres IN ('Vyšné Ružbachy');

CREATE INDEX IF NOT EXISTS ix_ml_okres ON market_listings(okres, ptype, deal);
