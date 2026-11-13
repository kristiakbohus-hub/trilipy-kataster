-- 0112 — vyhľadávanie v cenách zo zmlúv (stránka „Ceny z katastra", zadanie vlastníka 2026-11-13).
-- Doplnené polia počíta Mac (41_IMPORT/kataster_prices_push.py) z tých istých SPI riadkov:
--   drp     dominantný druh pozemku zmluvy (SPI kód: 2 orná, 5 záhrada, 7 TTP, 10 les, 13 zastavaná, 14 ostatná…)
--   in_zu   1 = všetky pozemky zmluvy v zastavanom území obce, 0 = všetky mimo, NULL = zmiešané / bez pozemku
--   parcels presný zoznam „,C:1500/2,E:9-120/1," (hľadanie podľa čísla parcely bez falošných zhôd 1500/21)
--   obec    obec k.ú. (mesto môže mať viac k.ú.: Žilina = Žilina, Budatín, Bánová, …)
--   lat/lon ťažisko najväčšej parcely zmluvy (byt/dom: parcela stavby) — bod na mape
ALTER TABLE lv_prices ADD COLUMN drp INTEGER;
ALTER TABLE lv_prices ADD COLUMN in_zu INTEGER;
ALTER TABLE lv_prices ADD COLUMN parcels TEXT;
ALTER TABLE lv_prices ADD COLUMN obec TEXT;
ALTER TABLE lv_prices ADD COLUMN lat REAL;
ALTER TABLE lv_prices ADD COLUMN lon REAL;
CREATE INDEX IF NOT EXISTS ix_lv_prices_cas ON lv_prices(cas);
