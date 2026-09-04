-- 0052_regulativ_bukovina.sql — reálne regulatívy ÚPN-Z Turzovka IBV Bukovina (k.ú. 800376).
-- Zdroj: ÚPN-Z Turzovka IBV Bukovina, textová časť (turzovka.sk file_storage id 144), sekcia h) Zastavovacie podmienky.
-- Idempotentné: najprv zmaž parsed seed pre tento dataset, potom vlož. Aplikuje sa na Higgsfield aj CF (deploy).
DELETE FROM up_regulativ WHERE dataset_id = 'kn-800376' AND source = 'parsed';
INSERT INTO up_regulativ (dataset_id, zone_code, funkcia, izp, kz, ipp, max_vyska, max_podlazi, note, source) VALUES
 ('kn-800376', 'A', 'IBV — izolovaný RD klasický (2 NP + podkrovie)', 0.28, 0.50, 0.56, 9.0, 3, 'kSO≤2,24; šírka priečelia 10–15 m; odstup domov min 7 m; zeleň min 50%', 'parsed'),
 ('kn-800376', 'B', 'IBV — izolovaný RD bungalov (1 NP)', 0.34, 0.50, 0.34, 7.0, 1, 'kSO≤2,38; nízkospádová valbová strecha; zeleň min 50%', 'parsed'),
 ('kn-800376', 'C', 'OV — obchod, pohostinstvo', NULL, NULL, NULL, NULL, NULL, 'základná občianska vybavenosť; bezbariérové vstupy; neoplocovať', 'parsed'),
 ('kn-800376', 'D', 'Verejná zeleň (nezastavateľné)', 0.0, 1.0, 0.0, NULL, NULL, 'parková úprava; bez stavieb okrem drobnej architektúry', 'parsed'),
 ('kn-800376', '*', 'Bukovina IBV (default = typ A)', 0.28, 0.50, 0.56, 9.0, 3, 'default pre parcely bez presného označenia zóny; prevažuje typ A (klasický RD)', 'parsed');
