-- Odstránenie testovacieho záznamu, ktorý ostal po ladení karty /zmeny.
--
-- Pri hľadaní príčiny prázdnej karty som do change_log zapísal kontrolný riadok, aby sa overilo,
-- či zápisy vôbec dopadnú (dopadli — ukázal sa na výpise LV, takže chyba bola v mojom SQL aliase
-- `AS change`). Tabuľka nemá mazací endpoint, preto to ide migráciou.
DELETE FROM change_log WHERE change_type = 'diagnostika_zapisu' AND entity = 'test';
