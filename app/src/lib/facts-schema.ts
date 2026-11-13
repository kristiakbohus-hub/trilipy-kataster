// Popisy predpočítaných údajov listu nehnuteľnosti (property_facts). GENEROVANÉ zo schém Mac modulov
// (13_INFOKAT_CLAUDE/49_LIST_NEHNUTELNOSTI/schemas/*.json) skriptom gen_facts_schema.py — ručne neupravovať.
// Keď kľúč v schéme chýba, list ho zobrazí s ľudsky upraveným názvom kľúča (nič sa nestratí).
export type FactField = { label: string; unit?: string | null; kind?: string; note?: string };
export const FACT_SCHEMA: Record<string, Record<string, FactField>> = {
  "adresa": {
    "adresa": {
      "label": "Adresa",
      "kind": "text",
      "note": "Register adries MV SR; pri pozemku bez stavby najbližší adresný bod do 80 m"
    },
    "ulica": {
      "label": "Ulica",
      "kind": "text"
    },
    "supisne": {
      "label": "Súpisné číslo",
      "kind": "text"
    },
    "orientacne": {
      "label": "Orientačné číslo",
      "kind": "text"
    },
    "psc": {
      "label": "PSČ",
      "kind": "text"
    },
    "cast_obce": {
      "label": "Časť obce",
      "kind": "text"
    },
    "presna": {
      "label": "Adresa stavby (presná)",
      "kind": "bool",
      "note": "áno = adresa stavby na parcele; nie = najbližšia adresa v okolí"
    },
    "vzdialenost_m": {
      "label": "Vzdialenosť k adrese",
      "unit": "m",
      "kind": "num"
    },
    "vchody": {
      "label": "Vchody (orientačné čísla)",
      "kind": "list"
    },
    "skola_zs": {
      "label": "Spádová základná škola",
      "kind": "text",
      "note": "podľa VZN obce o školských obvodoch"
    },
    "skola_zs_adresa": {
      "label": "Adresa spádovej ZŠ",
      "kind": "text"
    },
    "skola_zs_ine": {
      "label": "Ďalšie ZŠ v obvode ulice",
      "kind": "list"
    },
    "skola_pozn": {
      "label": "Poznámka k obvodu",
      "kind": "text"
    },
    "skola_vzn": {
      "label": "VZN o školských obvodoch",
      "kind": "text"
    }
  },
  "bpej": {
    "kod": {
      "label": "Kód BPEJ",
      "kind": "text",
      "note": "prevládajúci kód z VGI BJ (plošný prekryv s parcelou); len poľnohospodárska pôda (DRP 2–7)"
    },
    "klim_region": {
      "label": "Klimatický región (1.–2. číslica)",
      "kind": "object",
      "note": "{kod, popis, suma_teplot_nad_10C} — VÚPOP 2009, Príručka pre používanie máp pôdnoekologických jednotiek, tab. 1"
    },
    "hpj": {
      "label": "Hlavná pôdna jednotka (3.–4. číslica)",
      "kind": "object",
      "note": "{kod, popis} — VÚPOP 2009"
    },
    "sklon_expozicia": {
      "label": "Sklon a expozícia (5. číslica)",
      "kind": "object",
      "note": "{kod, popis} — VÚPOP 2009"
    },
    "skelet_hlbka": {
      "label": "Skeletovitosť a hĺbka pôdy (6. číslica)",
      "kind": "object",
      "note": "{kod, popis} — VÚPOP 2009; platnosť závisí od 5. číslice"
    },
    "zrnitost": {
      "label": "Zrnitosť (7. číslica)",
      "kind": "object",
      "note": "{kod, popis} — VÚPOP 2009"
    },
    "skupina": {
      "label": "Skupina kvality BPEJ",
      "kind": "number",
      "note": "1–9 podľa prílohy NV SR 58/2013 Z.z. (1–4 najkvalitnejšia, chránená pôda)"
    },
    "odvod_eur_m2": {
      "label": "Odvod za trvalé odňatie",
      "unit": "€",
      "kind": "number",
      "note": "€/m² podľa NV SR 58/2013 Z.z. (základná sadzba skupiny)"
    },
    "podiel_pct": {
      "label": "Podiel parcely s týmto kódom",
      "unit": "%",
      "kind": "number"
    },
    "dalsie": {
      "label": "Ďalšie kódy BPEJ na parcele",
      "kind": "list",
      "note": "[{kod, pct}] max 3"
    }
  },
  "byty": {
    "druh": {
      "label": "Druh priestoru",
      "kind": "text",
      "note": "SPI BP.BNP, príloha 9 vyhl. ÚGKK 461/2009 Z.z.: byt / nebytový priestor / rozostavaný byt / rozostavaný nebytový priestor"
    },
    "bnp": {
      "label": "Kód druhu priestoru",
      "kind": "number"
    },
    "cislo": {
      "label": "Číslo bytu / priestoru",
      "kind": "text",
      "note": "byt: BP.CIB + písmeno BP.CNP (napr. 3A); nebytový priestor: BP.CNP"
    },
    "druh_np": {
      "label": "Druh nebytového priestoru",
      "kind": "text",
      "note": "pri NP nesie BP.CIB kód prílohy 10 vyhl. ÚGKK 461/2009 Z.z. (2 garáž, 8 sklad, 12 iný…) — overené na dátach (len hodnoty 0–12)"
    },
    "vchod": {
      "label": "Vchod",
      "kind": "text",
      "note": "BP.CIV"
    },
    "poschodie": {
      "label": "Poschodie",
      "kind": "number",
      "note": "BP.CIP — číslo poschodia tak, ako je zapísané v katastri (niekde 0 = prízemie, inde 1; −1 = suterén)"
    },
    "prve_podlazie": {
      "label": "Najnižšie podlažie vo vchode",
      "kind": "bool",
      "note": "CIP jednotky = najnižšie CIP v tom istom dome a vchode (len ak má vchod viac podlaží)"
    },
    "posledne_podlazie": {
      "label": "Najvyššie podlažie vo vchode",
      "kind": "bool",
      "note": "CIP jednotky = najvyššie CIP v tom istom dome a vchode"
    },
    "podlazia_vchodu": {
      "label": "Rozsah podlaží vo vchode",
      "kind": "text"
    },
    "podiel_sp": {
      "label": "Podiel na spoločných častiach a zariadeniach domu",
      "kind": "text",
      "note": "BP.CIT/MEN"
    },
    "podiel_sp_pct": {
      "label": "Podiel na spoločných častiach",
      "unit": "%",
      "kind": "number"
    },
    "vymera_m2": {
      "label": "Výmera podlahovej plochy",
      "unit": "m²",
      "kind": "number",
      "note": "BP.VYM, len ak je v katastri vyplnená (často nie je)"
    },
    "lv": {
      "label": "List vlastníctva",
      "kind": "number"
    },
    "sc": {
      "label": "Súpisné číslo domu",
      "kind": "number"
    },
    "dom": {
      "label": "Odkaz na stavbu",
      "kind": "text",
      "note": "subjectRef stavby v skupine stavby (sc:<č> alebo p:<parcela>); chýba = dom nie je v SPI CS"
    },
    "druh_domu": {
      "label": "Druh domu",
      "kind": "text"
    },
    "parcely_domu": {
      "label": "Parcely pod domom",
      "kind": "list"
    },
    "pocet_vlastnikov": {
      "label": "Počet vlastníckych zápisov k jednotke",
      "kind": "number",
      "note": "počet riadkov BP (PCS) — BSM manželov je 1 zápis"
    },
    "pocet_bytov": {
      "label": "Počet bytov na LV",
      "kind": "number",
      "note": "subjekt lv"
    },
    "pocet_nebytovych": {
      "label": "Počet nebytových priestorov na LV",
      "kind": "number",
      "note": "subjekt lv"
    },
    "rozostavane": {
      "label": "Rozostavané jednotky na LV",
      "kind": "number",
      "note": "subjekt lv"
    },
    "domy": {
      "label": "Domy (stavby) na LV",
      "kind": "list",
      "note": "subjekt lv; odkazy do skupiny stavby"
    },
    "jednotky": {
      "label": "Jednotky na LV",
      "kind": "list",
      "note": "subjekt lv; prípony odkazov flat 'v:<vchod>:b:<číslo>' → celý odkaz 'lv:<LV>:' + prípona. NP má číslo 'np<CNP>' (bez CNP 'np_d<kód druhu>')"
    }
  },
  "klima": {
    "ref_source": {
      "label": "Zdroj referenčných dát",
      "kind": "text",
      "note": "NASA POWER Daily API (MERRA-2), bez kľúča, verejné dáta NASA LaRC POWER"
    },
    "ref_lat": {
      "label": "Zemepisná šírka bunky POWER",
      "unit": "°",
      "kind": "number"
    },
    "ref_lon": {
      "label": "Zemepisná dĺžka bunky POWER",
      "unit": "°",
      "kind": "number"
    },
    "ref_elev": {
      "label": "Nadmorská výška referencie (bunky MERRA-2)",
      "unit": "m",
      "kind": "number",
      "note": "priemerná výška bunky 0,5° × 0,625° podľa POWER"
    },
    "lapse_c_per_100m": {
      "label": "Výškový teplotný gradient",
      "unit": "°C/100 m",
      "kind": "number",
      "note": "−0,6 °C/100 m; pásmo z = denné T (aj Tmin, Tmax) + gradient × (z − ref_elev), indexy prepočítané z denných radov"
    },
    "elev_range": {
      "label": "Rozsah nadmorských výšok parciel k.ú.",
      "unit": "m",
      "kind": "list",
      "note": "ÚGKK DMR 5.0 v ťažiskách parciel C+E, výška = h − N(EGM2008)"
    },
    "elev_median": {
      "label": "Medián výšky parciel k.ú.",
      "unit": "m",
      "kind": "number"
    },
    "ref": {
      "label": "Klimatické ukazovatele vo výške referencie",
      "kind": "object",
      "note": "rovnaké kľúče ako bands.*"
    },
    "ref_t_m": {
      "label": "Mesačné priemerné teploty vo výške referencie",
      "unit": "°C",
      "kind": "list",
      "note": "jan…dec; pre inú výšku pripočítať gradient × (z − ref_elev)"
    },
    "bands": {
      "label": "Výškové pásma po 100 m",
      "kind": "object",
      "note": "{\"400\": {...}, \"500\": {...}} pokrývajú rozsah výšok parciel k.ú.; appka interpoluje lineárne podľa výšky parcely"
    },
    "coarse": {
      "label": "Zrážky, sneh, vietor, slnko (bez výškovej úpravy)",
      "kind": "object",
      "note": "HRUBÁ MRIEŽKA 0,5° × 0,625° — platí pre bunku, nie pre konkrétnu výšku/údolie; zrážky ~ +12–19 % voči SHMÚ"
    },
    "coarse.precip_year_mm": {
      "label": "Ročný úhrn zrážok",
      "unit": "mm",
      "kind": "number",
      "note": "PRECTOTCORR, priemer 1991–2020"
    },
    "coarse.precip_m_mm": {
      "label": "Mesačné úhrny zrážok",
      "unit": "mm",
      "kind": "list",
      "note": "jan…dec"
    },
    "coarse.snow_days": {
      "label": "Dni so snehovou pokrývkou ≥ 1 cm",
      "unit": "dni/rok",
      "kind": "number",
      "note": "SNODP MERRA-2 — hrubý odhad"
    },
    "coarse.snow_max_cm": {
      "label": "Priemerná ročná maximálna výška snehu",
      "unit": "cm",
      "kind": "number",
      "note": "priemer sezónnych maxím SNODP — hrubý odhad"
    },
    "coarse.wind10_ms": {
      "label": "Priemerná rýchlosť vetra 10 m",
      "unit": "m/s",
      "kind": "number",
      "note": "WS10M"
    },
    "coarse.solar_horiz_kwh_m2": {
      "label": "Ročné globálne žiarenie na vodorovnú plochu (POWER)",
      "unit": "kWh/m²",
      "kind": "number",
      "note": "ALLSKY_SFC_SW_DWN"
    },
    "pvgis": {
      "label": "Fotovoltika PVGIS",
      "kind": "object",
      "note": "EU JRC PVGIS 5.3 (PVGIS-SARAH3 2005–2023), PVcalc 1 kWp, straty 14 %, optimálny sklon aj azimut, horizont z terénu, v „zastavanom“ ťažisku k.ú.; © European Union, voľné použitie s uvedením zdroja"
    },
    "pvgis.yield_kwh_kwp": {
      "label": "Ročná výroba FVE",
      "unit": "kWh/kWp",
      "kind": "number",
      "note": "E_y"
    },
    "pvgis.tilt_opt": {
      "label": "Optimálny sklon panelov",
      "unit": "°",
      "kind": "number"
    },
    "pvgis.azimuth_opt": {
      "label": "Optimálny azimut panelov",
      "unit": "°",
      "kind": "number",
      "note": "0 = juh, záporné = na východ"
    },
    "pvgis.h_inplane_kwh_m2": {
      "label": "Ročné ožiarenie v rovine panelov",
      "unit": "kWh/m²",
      "kind": "number",
      "note": "H(i)_y"
    },
    "pvgis.h_horiz_kwh_m2": {
      "label": "Ročné globálne ožiarenie vodorovnej plochy",
      "unit": "kWh/m²",
      "kind": "number",
      "note": "MRcalc H(h)_m, súčet mesačných priemerov"
    },
    "pvgis.h_horiz_m": {
      "label": "Mesačné ožiarenie vodorovnej plochy",
      "unit": "kWh/m²",
      "kind": "list",
      "note": "jan…dec"
    },
    "pvgis.yield_m": {
      "label": "Mesačná výroba FVE",
      "unit": "kWh/kWp",
      "kind": "list",
      "note": "jan…dec"
    },
    "period": {
      "label": "Obdobie",
      "kind": "text"
    },
    "presnost": {
      "label": "Presnosť (validácia SHMÚ)",
      "kind": "text",
      "note": "pozri out/klima_validacia.json"
    },
    "bands.t_year": {
      "label": "Priemerná ročná teplota",
      "unit": "°C",
      "kind": "number"
    },
    "bands.t_jan": {
      "label": "Priemerná teplota v januári",
      "unit": "°C",
      "kind": "number"
    },
    "bands.t_jul": {
      "label": "Priemerná teplota v júli",
      "unit": "°C",
      "kind": "number"
    },
    "bands.frost_days": {
      "label": "Mrazové dni (Tmin < 0 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "bands.ice_days": {
      "label": "Ľadové dni (Tmax < 0 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "bands.summer_days": {
      "label": "Letné dni (Tmax ≥ 25 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "bands.tropical_days": {
      "label": "Tropické dni (Tmax ≥ 30 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "bands.tropical_nights": {
      "label": "Tropické noci (Tmin ≥ 20 °C)",
      "unit": "noci/rok",
      "kind": "number"
    },
    "bands.last_frost": {
      "label": "Posledný jarný mráz (medián)",
      "unit": "MM-DD",
      "kind": "text",
      "note": "posledný deň s Tmin < 0 °C do 15. 7., medián 1991–2020"
    },
    "bands.first_frost": {
      "label": "Prvý jesenný mráz (medián)",
      "unit": "MM-DD",
      "kind": "text",
      "note": "prvý deň s Tmin < 0 °C od 16. 7., medián"
    },
    "bands.frost_free_days": {
      "label": "Bezmrazové obdobie (medián)",
      "unit": "dni",
      "kind": "number"
    },
    "bands.veg5_len": {
      "label": "Veľké vegetačné obdobie (Tpriem ≥ 5 °C)",
      "unit": "dni",
      "kind": "number",
      "note": "ETCCDI GSL s prahom 5 °C: začiatok = 1. deň prvého behu ≥ 6 dní s Tpriem ≥ 5 °C, koniec = prvý beh ≥ 6 dní s Tpriem < 5 °C po 1. 7.; medián 1991–2020"
    },
    "bands.veg5_start": {
      "label": "Začiatok obdobia ≥ 5 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "bands.veg5_end": {
      "label": "Koniec obdobia ≥ 5 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "bands.veg10_len": {
      "label": "Hlavné vegetačné obdobie (Tpriem ≥ 10 °C)",
      "unit": "dni",
      "kind": "number",
      "note": "ako veg5_len s prahom 10 °C"
    },
    "bands.veg10_start": {
      "label": "Začiatok obdobia ≥ 10 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "bands.veg10_end": {
      "label": "Koniec obdobia ≥ 10 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "bands.heat_days": {
      "label": "Vykurovacie dni (Tpriem ≤ 13 °C, 1. 9.–31. 5.)",
      "unit": "dni/rok",
      "kind": "number",
      "note": "vykurovací deň = denný priemer ≤ 13 °C v období 1. 9.–31. 5. (vyhl. MH SR 152/2005 Z. z. § 1: kúrenie pri poklese pod 13 °C, obdobie 1. 9.–31. 5.); priemer sezón 1991/92–2019/20"
    },
    "bands.hdd": {
      "label": "Dennostupne D = Σ(20 − Tpriem)",
      "unit": "K·deň",
      "kind": "number",
      "note": "D = Σ(θi − θe) cez vykurovacie dni, θi = 20 °C (konvencia zo zadania; hodnota θi v STN 73 0540-3 neoverená, vyhláška 152/2005 udáva 21 °C pre obytné miestnosti); zaokrúhlené na 10"
    },
    "bands.heat_t_mean": {
      "label": "Priemerná vonkajšia teplota vo vykurovacích dňoch",
      "unit": "°C",
      "kind": "number"
    },
    "precip_year_mm": {
      "label": "Ročný úhrn zrážok",
      "unit": "mm",
      "kind": "number",
      "note": "PRECTOTCORR, priemer 1991–2020"
    },
    "precip_m_mm": {
      "label": "Mesačné úhrny zrážok",
      "unit": "mm",
      "kind": "list",
      "note": "jan…dec"
    },
    "snow_days": {
      "label": "Dni so snehovou pokrývkou ≥ 1 cm",
      "unit": "dni/rok",
      "kind": "number",
      "note": "SNODP MERRA-2 — hrubý odhad"
    },
    "snow_max_cm": {
      "label": "Priemerná ročná maximálna výška snehu",
      "unit": "cm",
      "kind": "number",
      "note": "priemer sezónnych maxím SNODP — hrubý odhad"
    },
    "wind10_ms": {
      "label": "Priemerná rýchlosť vetra 10 m",
      "unit": "m/s",
      "kind": "number",
      "note": "WS10M"
    },
    "solar_horiz_kwh_m2": {
      "label": "Ročné globálne žiarenie na vodorovnú plochu (POWER)",
      "unit": "kWh/m²",
      "kind": "number",
      "note": "ALLSKY_SFC_SW_DWN"
    },
    "yield_kwh_kwp": {
      "label": "Ročná výroba FVE",
      "unit": "kWh/kWp",
      "kind": "number",
      "note": "E_y"
    },
    "tilt_opt": {
      "label": "Optimálny sklon panelov",
      "unit": "°",
      "kind": "number"
    },
    "azimuth_opt": {
      "label": "Optimálny azimut panelov",
      "unit": "°",
      "kind": "number",
      "note": "0 = juh, záporné = na východ"
    },
    "h_inplane_kwh_m2": {
      "label": "Ročné ožiarenie v rovine panelov",
      "unit": "kWh/m²",
      "kind": "number",
      "note": "H(i)_y"
    },
    "h_horiz_kwh_m2": {
      "label": "Ročné globálne ožiarenie vodorovnej plochy",
      "unit": "kWh/m²",
      "kind": "number",
      "note": "MRcalc H(h)_m, súčet mesačných priemerov"
    },
    "h_horiz_m": {
      "label": "Mesačné ožiarenie vodorovnej plochy",
      "unit": "kWh/m²",
      "kind": "list",
      "note": "jan…dec"
    },
    "yield_m": {
      "label": "Mesačná výroba FVE",
      "unit": "kWh/kWp",
      "kind": "list",
      "note": "jan…dec"
    },
    "t_year": {
      "label": "Priemerná ročná teplota",
      "unit": "°C",
      "kind": "number"
    },
    "t_jan": {
      "label": "Priemerná teplota v januári",
      "unit": "°C",
      "kind": "number"
    },
    "t_jul": {
      "label": "Priemerná teplota v júli",
      "unit": "°C",
      "kind": "number"
    },
    "frost_days": {
      "label": "Mrazové dni (Tmin < 0 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "ice_days": {
      "label": "Ľadové dni (Tmax < 0 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "summer_days": {
      "label": "Letné dni (Tmax ≥ 25 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "tropical_days": {
      "label": "Tropické dni (Tmax ≥ 30 °C)",
      "unit": "dni/rok",
      "kind": "number"
    },
    "tropical_nights": {
      "label": "Tropické noci (Tmin ≥ 20 °C)",
      "unit": "noci/rok",
      "kind": "number"
    },
    "last_frost": {
      "label": "Posledný jarný mráz (medián)",
      "unit": "MM-DD",
      "kind": "text",
      "note": "posledný deň s Tmin < 0 °C do 15. 7., medián 1991–2020"
    },
    "first_frost": {
      "label": "Prvý jesenný mráz (medián)",
      "unit": "MM-DD",
      "kind": "text",
      "note": "prvý deň s Tmin < 0 °C od 16. 7., medián"
    },
    "frost_free_days": {
      "label": "Bezmrazové obdobie (medián)",
      "unit": "dni",
      "kind": "number"
    },
    "veg5_len": {
      "label": "Veľké vegetačné obdobie (Tpriem ≥ 5 °C)",
      "unit": "dni",
      "kind": "number",
      "note": "ETCCDI GSL s prahom 5 °C: začiatok = 1. deň prvého behu ≥ 6 dní s Tpriem ≥ 5 °C, koniec = prvý beh ≥ 6 dní s Tpriem < 5 °C po 1. 7.; medián 1991–2020"
    },
    "veg5_start": {
      "label": "Začiatok obdobia ≥ 5 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "veg5_end": {
      "label": "Koniec obdobia ≥ 5 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "veg10_len": {
      "label": "Hlavné vegetačné obdobie (Tpriem ≥ 10 °C)",
      "unit": "dni",
      "kind": "number",
      "note": "ako veg5_len s prahom 10 °C"
    },
    "veg10_start": {
      "label": "Začiatok obdobia ≥ 10 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "veg10_end": {
      "label": "Koniec obdobia ≥ 10 °C",
      "unit": "MM-DD",
      "kind": "text"
    },
    "heat_days": {
      "label": "Vykurovacie dni (Tpriem ≤ 13 °C, 1. 9.–31. 5.)",
      "unit": "dni/rok",
      "kind": "number",
      "note": "vykurovací deň = denný priemer ≤ 13 °C v období 1. 9.–31. 5. (vyhl. MH SR 152/2005 Z. z. § 1: kúrenie pri poklese pod 13 °C, obdobie 1. 9.–31. 5.); priemer sezón 1991/92–2019/20"
    },
    "hdd": {
      "label": "Dennostupne D = Σ(20 − Tpriem)",
      "unit": "K·deň",
      "kind": "number",
      "note": "D = Σ(θi − θe) cez vykurovacie dni, θi = 20 °C (konvencia zo zadania; hodnota θi v STN 73 0540-3 neoverená, vyhláška 152/2005 udáva 21 °C pre obytné miestnosti); zaokrúhlené na 10"
    },
    "heat_t_mean": {
      "label": "Priemerná vonkajšia teplota vo vykurovacích dňoch",
      "unit": "°C",
      "kind": "number"
    }
  },
  "mapa": {
    "v_zastavanom_uzemi": {
      "label": "V zastavanom území obce",
      "kind": "bool",
      "note": "SPI PA.UMP (príl. 5 vyhl. ÚGKK 461/2009 Z.z.) — údaj z LV"
    },
    "zu_mapa": {
      "label": "V zastavanom území podľa mapy",
      "kind": "bool",
      "note": "reprezentatívny bod parcely vnútri plôch VGI ZUOB=1 (overené: ZUOB=1 = zastavané územie, ZUOB=2 = mimo)"
    },
    "zu_nesulad": {
      "label": "Nesúlad LV a mapy v zastavanom území",
      "kind": "bool"
    },
    "vymera_lv_m2": {
      "label": "Výmera podľa LV",
      "unit": "m²",
      "kind": "number"
    },
    "vymera_mapa_m2": {
      "label": "Výmera z mapy",
      "unit": "m²",
      "kind": "number",
      "note": "plocha polygónu KLADPAR v S-JTSK"
    },
    "rozdiel_pct": {
      "label": "Rozdiel výmery mapa vs. LV",
      "unit": "%",
      "kind": "number",
      "note": "(mapa − LV) / LV"
    },
    "vb_pretina": {
      "label": "Vecné bremená v mape pretínajúce parcelu",
      "kind": "list",
      "note": "VGI vrstva TARCHY: číslo vkladu/záznamu (VB=…) čiar/plôch, ktoré prechádzajú vnútrom parcely"
    },
    "vb_bez_cisla": {
      "label": "Vecné bremená v mape bez čísla",
      "kind": "number"
    },
    "ppu": {
      "label": "Obvod projektu pozemkových úprav",
      "kind": "text",
      "note": "VGI OBVODPPU (názov projektu), parcela vnútri uzavretého obvodu"
    },
    "miestny_nazov": {
      "label": "Miestny (pomiestny) názov",
      "kind": "text",
      "note": "najbližší popis VGI POPIS s K=2 (pomiestne názvy) do 600 m"
    },
    "miestny_nazov_m": {
      "label": "Vzdialenosť k miestnemu názvu",
      "unit": "m",
      "kind": "number"
    },
    "hranica_ku": {
      "label": "Parcela hraničí so susedným k.ú.",
      "kind": "list",
      "note": "VGI KATUZ (HKU = názov susedného k.ú.), spoločná hranica ≥ 1 m"
    },
    "ochrana": {
      "label": "Ochrana nehnuteľnosti",
      "kind": "list",
      "note": "SPI PA.DN1–DN8, príloha 3 vyhl. ÚGKK 461/2009 Z.z."
    },
    "geometria": {
      "label": "Parcela má geometriu v mape",
      "kind": "bool",
      "note": "false = parcela nie je vo VGI"
    }
  },
  "normy": {
    "elev_range": {
      "label": "Rozsah výšok parciel k.ú.",
      "unit": "m",
      "kind": "list",
      "note": "DMR 5.0"
    },
    "bands": {
      "label": "Normové hodnoty vo výškových pásmach po 100 m",
      "kind": "object",
      "note": "rovnaké úrovne ako klima.bands; zóna = prevládajúca zóna parciel s výškou v pásme ±50 m"
    },
    "bands.snih_zona": {
      "label": "Snehová oblasť",
      "kind": "text",
      "note": "STN EN 1991-1-3/NA1:2012; zóna z digitalizácie mapy (Dlubal) — neoverené"
    },
    "bands.sk_kn_m2": {
      "label": "Charakteristické zaťaženie snehom na zemi s_k",
      "unit": "kN/m²",
      "kind": "number",
      "note": "s_k = a + A/b pre výšku pásma a jeho prevládajúcu zónu"
    },
    "bands.snih_zony_pct": {
      "label": "Podiel snehových oblastí v pásme",
      "unit": "%",
      "kind": "object",
      "note": "uvedené len pri zmiešanom pásme"
    },
    "bands.vb0_ms": {
      "label": "Východisková základná rýchlosť vetra v_b,0",
      "unit": "m/s",
      "kind": "number",
      "note": "do 700 m mapa (24/26), 700–1300 m 30, nad 1300 m 33"
    },
    "snih": {
      "label": "Zaťaženie snehom",
      "kind": "object",
      "note": "STN EN 1991-1-3/NA1:2012: s_k = a + A/b; zóna 1 a 3: a=0,454 b=970; 2: 0,425/505; 4: 0,716/430; 5: 0,934/315 (overené); zóny k.ú. odvodené z KML Dlubal (tretia strana)"
    },
    "snih.zony_pct": {
      "label": "Podiel snehových oblastí (váhou výmery parciel)",
      "unit": "%",
      "kind": "object"
    },
    "snih.zona_hlavna": {
      "label": "Prevládajúca snehová oblasť",
      "kind": "text"
    },
    "snih.sk_rozsah_kn_m2": {
      "label": "Rozsah s_k v k.ú.",
      "unit": "kN/m²",
      "kind": "list",
      "note": "od 2. po 98. percentil výšok parciel v každej zóne"
    },
    "snih.mimoriadny_cesl": {
      "label": "Mimoriadne zaťaženie snehom C_esl",
      "kind": "text",
      "note": "oblasti 1–4: 2,1 / 2,2 / 2,5 / 3,7; N/A = bez mimoriadneho snehu"
    },
    "vietor": {
      "label": "Zaťaženie vetrom",
      "kind": "object",
      "note": "STN EN 1991-1-4/NA:2008 + Z1:2010; legenda mapy: nad 700 m v členitom teréne špeciálne hodnotenie"
    },
    "vietor.vb0_pct": {
      "label": "Podiel parciel podľa v_b,0",
      "unit": "%",
      "kind": "object",
      "note": "váhou výmery; nad 700 m podľa DMR 5.0"
    },
    "vietor.vb0_hlavna_ms": {
      "label": "Prevládajúca v_b,0",
      "unit": "m/s",
      "kind": "number"
    },
    "seizmicita": {
      "label": "Seizmicita",
      "kind": "object",
      "note": "STN EN 1998-1/NA, mapa zo Z2:2012-03; úrovne a_gR overené, zaradenie z KML Dlubal neoverené"
    },
    "seizmicita.agr_hlavna_ms2": {
      "label": "Referenčné špičkové zrýchlenie podložia a_gR",
      "unit": "m/s²",
      "kind": "number"
    },
    "seizmicita.agr_max_ms2": {
      "label": "Najvyššie a_gR v k.ú.",
      "unit": "m/s²",
      "kind": "number"
    },
    "seizmicita.agr_pct": {
      "label": "Podiel parciel podľa a_gR",
      "unit": "%",
      "kind": "object"
    },
    "te_vykurovanie": {
      "label": "Výpočtová vonkajšia teplota θe (tepelná strata)",
      "kind": "object",
      "note": "STN 73 0540-3:2012 podľa tabuľky v Menďan, STU 2025 (CC BY 4.0): Čadca −15 °C (420 m), Žilina −15 °C (350 m), Ružomberok −16 °C (500 m)"
    },
    "te_vykurovanie.te_c": {
      "label": "θe referenčnej obce okresu",
      "unit": "°C",
      "kind": "number",
      "note": "výšková korekcia pre SK vo verejných zdrojoch nenájdená"
    },
    "premrzanie": {
      "label": "Hĺbka premŕzania / založenia",
      "kind": "object",
      "note": "STN 73 1001 podľa Žilinský a kol., STU 2018"
    },
    "premrzanie.min_hlbka_zakladu_m": {
      "label": "Minimálna nezámrzná hĺbka základu",
      "unit": "m",
      "kind": "number",
      "note": "0,8 m pod terénom"
    },
    "premrzanie.jemnozrnne_zeminy_m": {
      "label": "Odporúčaná hĺbka v jemnozrnných zeminách",
      "unit": "m",
      "kind": "number"
    },
    "premrzanie.zeminy_f7_f8_m": {
      "label": "Hĺbka v zmrašťujúcich sa zeminách F7/F8",
      "unit": "m",
      "kind": "number"
    },
    "premrzanie.strk_skala_docasne_m": {
      "label": "Hĺbka na štrkoch, skale, pri dočasných stavbách",
      "unit": "m",
      "kind": "number"
    },
    "vykurovacie_obdobie": {
      "label": "Vykurovacie obdobie",
      "kind": "object",
      "note": "vyhláška MH SR 152/2005 Z. z. § 1: 1. 9.–31. 5., kúrenie pri poklese priemernej dennej teploty pod 13 °C dva dni po sebe"
    },
    "snih_zona": {
      "label": "Snehová oblasť",
      "kind": "text",
      "note": "STN EN 1991-1-3/NA1:2012; zóna z digitalizácie mapy (Dlubal) — neoverené"
    },
    "sk_kn_m2": {
      "label": "Charakteristické zaťaženie snehom na zemi s_k",
      "unit": "kN/m²",
      "kind": "number",
      "note": "s_k = a + A/b pre výšku pásma a jeho prevládajúcu zónu"
    },
    "snih_zony_pct": {
      "label": "Podiel snehových oblastí v pásme",
      "unit": "%",
      "kind": "object",
      "note": "uvedené len pri zmiešanom pásme"
    },
    "vb0_ms": {
      "label": "Východisková základná rýchlosť vetra v_b,0",
      "unit": "m/s",
      "kind": "number",
      "note": "do 700 m mapa (24/26), 700–1300 m 30, nad 1300 m 33"
    },
    "zony_pct": {
      "label": "Podiel snehových oblastí (váhou výmery parciel)",
      "unit": "%",
      "kind": "object"
    },
    "zona_hlavna": {
      "label": "Prevládajúca snehová oblasť",
      "kind": "text"
    },
    "sk_rozsah_kn_m2": {
      "label": "Rozsah s_k v k.ú.",
      "unit": "kN/m²",
      "kind": "list",
      "note": "od 2. po 98. percentil výšok parciel v každej zóne"
    },
    "mimoriadny_cesl": {
      "label": "Mimoriadne zaťaženie snehom C_esl",
      "kind": "text",
      "note": "oblasti 1–4: 2,1 / 2,2 / 2,5 / 3,7; N/A = bez mimoriadneho snehu"
    },
    "vb0_pct": {
      "label": "Podiel parciel podľa v_b,0",
      "unit": "%",
      "kind": "object",
      "note": "váhou výmery; nad 700 m podľa DMR 5.0"
    },
    "vb0_hlavna_ms": {
      "label": "Prevládajúca v_b,0",
      "unit": "m/s",
      "kind": "number"
    },
    "agr_hlavna_ms2": {
      "label": "Referenčné špičkové zrýchlenie podložia a_gR",
      "unit": "m/s²",
      "kind": "number"
    },
    "agr_max_ms2": {
      "label": "Najvyššie a_gR v k.ú.",
      "unit": "m/s²",
      "kind": "number"
    },
    "agr_pct": {
      "label": "Podiel parciel podľa a_gR",
      "unit": "%",
      "kind": "object"
    },
    "te_c": {
      "label": "θe referenčnej obce okresu",
      "unit": "°C",
      "kind": "number",
      "note": "výšková korekcia pre SK vo verejných zdrojoch nenájdená"
    },
    "min_hlbka_zakladu_m": {
      "label": "Minimálna nezámrzná hĺbka základu",
      "unit": "m",
      "kind": "number",
      "note": "0,8 m pod terénom"
    },
    "jemnozrnne_zeminy_m": {
      "label": "Odporúčaná hĺbka v jemnozrnných zeminách",
      "unit": "m",
      "kind": "number"
    },
    "zeminy_f7_f8_m": {
      "label": "Hĺbka v zmrašťujúcich sa zeminách F7/F8",
      "unit": "m",
      "kind": "number"
    },
    "strk_skala_docasne_m": {
      "label": "Hĺbka na štrkoch, skale, pri dočasných stavbách",
      "unit": "m",
      "kind": "number"
    }
  },
  "obec": {
    "obec": {
      "label": "Obec",
      "kind": "text",
      "note": "Obec, do ktorej k.ú. patrí; všetky údaje skupiny sú za CELÚ obec (pri viacerých k.ú. rovnaké)"
    },
    "kod_obce": {
      "label": "Kód obce (ŠÚ SR)",
      "kind": "text",
      "note": "6-miestny kód obce"
    },
    "lau": {
      "label": "Kód LAU",
      "kind": "text",
      "note": "NUTS4 okresu + kód obce (napr. SK0312509507)"
    },
    "okres": {
      "label": "Okres",
      "kind": "text"
    },
    "kraj": {
      "label": "Kraj",
      "kind": "text"
    },
    "ku_nazov": {
      "label": "Katastrálne územie",
      "kind": "text"
    },
    "obyv": {
      "label": "Počet obyvateľov",
      "kind": "number",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) om7101rr, stav k 31.12. roka obyv_rok"
    },
    "obyv_rok": {
      "label": "Rok počtu obyvateľov",
      "kind": "number"
    },
    "obyv_10r": {
      "label": "Počet obyvateľov pred 10 rokmi",
      "kind": "number",
      "note": "om7101rr, stav k 31.12."
    },
    "obyv_trend_10r_pct": {
      "label": "Zmena počtu obyvateľov za 10 rokov",
      "unit": "%",
      "kind": "number",
      "note": "(obyv − obyv_10r) / obyv_10r"
    },
    "obyv_rady": {
      "label": "Vývoj počtu obyvateľov",
      "kind": "object",
      "note": "{rok: počet k 31.12.}, posledných 11 rokov"
    },
    "pohyb_rok": {
      "label": "Rok pohybu obyvateľstva",
      "kind": "number"
    },
    "narodeni": {
      "label": "Živonarodení",
      "kind": "number",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) om7010rr (U_OM_0048)"
    },
    "zomreli": {
      "label": "Zomrelí",
      "kind": "number",
      "note": "om7010rr (U_OM_0013)"
    },
    "pristahovani": {
      "label": "Prisťahovaní",
      "kind": "number",
      "note": "om7010rr (U_OM_0030)"
    },
    "vystahovani": {
      "label": "Vysťahovaní",
      "kind": "number",
      "note": "om7010rr (U_OM_0031)"
    },
    "prirodzeny_prirastok": {
      "label": "Prirodzený prírastok",
      "kind": "number",
      "note": "narodení − zomrelí"
    },
    "migracne_saldo": {
      "label": "Migračné saldo",
      "kind": "number",
      "note": "prisťahovaní − vysťahovaní"
    },
    "narodeni_5r": {
      "label": "Živonarodení – priemer 5 rokov",
      "kind": "number",
      "note": "obdobie v pohyb_5r_obdobie"
    },
    "zomreli_5r": {
      "label": "Zomrelí – priemer 5 rokov",
      "kind": "number"
    },
    "pristahovani_5r": {
      "label": "Prisťahovaní – priemer 5 rokov",
      "kind": "number"
    },
    "vystahovani_5r": {
      "label": "Vysťahovaní – priemer 5 rokov",
      "kind": "number"
    },
    "migracne_saldo_5r": {
      "label": "Migračné saldo – priemer 5 rokov",
      "kind": "number"
    },
    "pohyb_5r_obdobie": {
      "label": "Obdobie 5-ročných priemerov",
      "kind": "text"
    },
    "vek_rok": {
      "label": "Rok vekovej štruktúry",
      "kind": "number"
    },
    "vek_0_14_pct": {
      "label": "Podiel obyvateľov 0–14 rokov",
      "unit": "%",
      "kind": "number",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) om7006rr, k 31.12."
    },
    "vek_15_64_pct": {
      "label": "Podiel obyvateľov 15–64 rokov",
      "unit": "%",
      "kind": "number",
      "note": "om7006rr"
    },
    "vek_65_pct": {
      "label": "Podiel obyvateľov 65+ rokov",
      "unit": "%",
      "kind": "number",
      "note": "om7006rr"
    },
    "index_starnutia": {
      "label": "Index starnutia",
      "kind": "number",
      "note": "om7052rr: počet 65+ na 100 detí 0–14"
    },
    "vek_median": {
      "label": "Mediánový vek",
      "unit": "roky",
      "kind": "number",
      "note": "om7052rr"
    },
    "vek_priemer": {
      "label": "Priemerný vek",
      "unit": "roky",
      "kind": "number",
      "note": "om7052rr"
    },
    "uoz_obec": {
      "label": "Uchádzači o zamestnanie v obci",
      "kind": "number",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) pr5001rr (evidencia ÚPSVR)"
    },
    "uoz_obec_rok": {
      "label": "Rok – uchádzači v obci",
      "kind": "number"
    },
    "uoz_obec_podiel_pct": {
      "label": "Uchádzači o zamestnanie / obyvatelia 15–64",
      "unit": "%",
      "kind": "number",
      "note": "Odvodené: pr5001rr / obyvatelia 15–64 (om7006rr) v tom istom roku; nie je to úradná miera nezamestnanosti"
    },
    "nezam_okres_pdu_pct": {
      "label": "Miera nezamestnanosti v okrese (PDU)",
      "unit": "%",
      "kind": "number",
      "note": "ÚPSVR mesačná štatistika, Tab1: podiel disponibilných UoZ v produktívnom veku na obyvateľstve v produktívnom veku"
    },
    "nezam_okres_pu_pct": {
      "label": "Podiel všetkých UoZ na obyv. v produktívnom veku (okres)",
      "unit": "%",
      "kind": "number",
      "note": "ÚPSVR Tab1 (PU)"
    },
    "nezam_okres_obdobie": {
      "label": "Obdobie údaja ÚPSVR",
      "kind": "text",
      "note": "mesiac/rok"
    },
    "nezam_okres_su_pct": {
      "label": "Miera evidovanej nezamestnanosti v okrese (ŠÚ, ročná)",
      "unit": "%",
      "kind": "number",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) pr3108rr — za okresy dostupné len do roku nezam_okres_su_rok"
    },
    "nezam_okres_su_rok": {
      "label": "Rok – miera nezamestnanosti ŠÚ",
      "kind": "number"
    },
    "mzda_okres_eur": {
      "label": "Priemerná mesačná mzda v okrese",
      "unit": "€",
      "kind": "number",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) np3110rr, pracovisková metóda (podľa sídla pracoviska), všetky odvetvia"
    },
    "mzda_okres_rok": {
      "label": "Rok mzdy",
      "kind": "number"
    },
    "mzda_okres_10r_eur": {
      "label": "Priemerná mzda v okrese pred 10 rokmi",
      "unit": "€",
      "kind": "number",
      "note": "np3110rr"
    },
    "byty_dokoncene_okres": {
      "label": "Dokončené byty v okrese",
      "kind": "object",
      "note": "ŠÚ SR STATdat (statdata.statistics.sk, verejné API) st3004rr {rok: počet}; za obce ŠÚ neposkytuje"
    },
    "byty_zacate_okres": {
      "label": "Začaté byty v okrese",
      "kind": "object",
      "note": "st3004rr {rok: počet}"
    },
    "domy_2021": {
      "label": "Počet domov (SODB 2021)",
      "kind": "number",
      "note": "ŠÚ SR STATdat, Sčítanie obyvateľov, domov a bytov 2021 (SODB 2021); podiel z domov so zisteným údajom, om7815rr"
    },
    "domy_rd_pct": {
      "label": "Podiel rodinných domov",
      "unit": "%",
      "kind": "number",
      "note": "SODB 2021"
    },
    "plyn_pripojka_pct": {
      "label": "Domy s plynovou prípojkou",
      "unit": "%",
      "kind": "number",
      "note": "ŠÚ SR STATdat, Sčítanie obyvateľov, domov a bytov 2021 (SODB 2021); podiel z domov so zisteným údajom, om7815rr"
    },
    "plyn_obec": {
      "label": "Plynofikovaná obec",
      "kind": "bool",
      "note": "Odvodené: ≥ 1 % domov s plynovou prípojkou (SODB 2021); zoznam SPP-distribúcia verejne nedostupný"
    },
    "vodovod_verejny_pct": {
      "label": "Domy napojené na verejný vodovod",
      "unit": "%",
      "kind": "number",
      "note": "ŠÚ SR STATdat, Sčítanie obyvateľov, domov a bytov 2021 (SODB 2021); podiel z domov so zisteným údajom, om7816rr (v dome aj mimo domu z verejnej siete)"
    },
    "kanal_pripojka_pct": {
      "label": "Domy s prípojkou na verejnú kanalizáciu",
      "unit": "%",
      "kind": "number",
      "note": "ŠÚ SR STATdat, Sčítanie obyvateľov, domov a bytov 2021 (SODB 2021); podiel z domov so zisteným údajom, om7811rr"
    },
    "zumpa_septik_pct": {
      "label": "Domy so žumpou / septikom",
      "unit": "%",
      "kind": "number",
      "note": "SODB 2021 om7811rr"
    },
    "domaca_cov_pct": {
      "label": "Domy s domácou ČOV",
      "unit": "%",
      "kind": "number",
      "note": "SODB 2021 om7811rr"
    },
    "bez_odkanal_pct": {
      "label": "Domy bez odkanalizovania",
      "unit": "%",
      "kind": "number",
      "note": "SODB 2021 om7811rr"
    },
    "domy_obdobie_pct": {
      "label": "Domy podľa obdobia výstavby alebo rekonštrukcie",
      "unit": "%",
      "kind": "object",
      "note": "SODB 2021 om7813rr. POZOR: ŠÚ uvádza obdobie len pre časť domov (pozri domy_obdobie_pokrytie_pct); podiely sú z domov s údajom — orientačné"
    },
    "domy_obdobie_pokrytie_pct": {
      "label": "Pokrytie údaja o období výstavby",
      "unit": "%",
      "kind": "number",
      "note": "súčet kategórií / všetky domy"
    },
    "byty_2021": {
      "label": "Počet bytov (SODB 2021)",
      "kind": "number",
      "note": "om7819rr"
    },
    "byty_v_rd_pct": {
      "label": "Podiel bytov v rodinných domoch",
      "unit": "%",
      "kind": "number",
      "note": "om7819rr"
    },
    "dlh_eur": {
      "label": "Celkový dlh obce",
      "unit": "€",
      "kind": "number",
      "note": "MF SR open data „Dlh a dlhová služba miest a obcí SR k ultimu roka“ (xlsx, zoznam1, stĺpec Spolu), k 31.12. roka dlh_rok"
    },
    "dlh_pomer_pct": {
      "label": "Dlh / bežné príjmy predch. roka",
      "unit": "%",
      "kind": "number",
      "note": "MF SR; zákonný limit 60 % (§ 17 zák. 583/2004 Z. z.)"
    },
    "dlhova_sluzba_pct": {
      "label": "Dlhová služba",
      "unit": "%",
      "kind": "number",
      "note": "MF SR (zoznam2); zákonný limit 25 %"
    },
    "dlh_na_obyv_eur": {
      "label": "Dlh na obyvateľa",
      "unit": "€",
      "kind": "number",
      "note": "dlh_eur / obyvatelia k 31.12. toho istého roka"
    },
    "dlh_rok": {
      "label": "Rok údaja o dlhu",
      "kind": "number",
      "note": "najnovší zverejnený súbor MF SR (2023)"
    },
    "dlh_bankove_uvery_eur": {
      "label": "Bankové úvery obce (vrátane predfinancovania EÚ)",
      "unit": "€",
      "kind": "number",
      "note": "uvedené len ak sú vyššie ako celkový dlh (MF nezapočítava úvery na predfinancovanie EÚ)"
    },
    "vodovod_prevadzkovatel": {
      "label": "Prevádzkovateľ verejného vodovodu",
      "kind": "text",
      "note": "Plán rozvoja verejných vodovodov a kanalizácií Žilinského kraja, príloha 2, stav 31.12.2017 (enviroportal.sk/eia/dokument/351039)"
    },
    "vodovod_poznamka": {
      "label": "Poznámka k vodovodu",
      "kind": "text"
    },
    "cena_vodne_eur_m3": {
      "label": "Vodné – variabilná zložka (bez DPH)",
      "unit": "€/m³",
      "kind": "number",
      "note": "ÚRSO cenové rozhodnutie v cena_rozhodnutie; maximálna cena"
    },
    "cena_vodne_s_dph": {
      "label": "Vodné – variabilná zložka s DPH 23 %",
      "unit": "€/m³",
      "kind": "number",
      "note": "odvodené ×1,23 (sadzbu potvrdzuje VSR: 0,9420 bez DPH = 1,1587 s DPH)"
    },
    "cena_stocne_eur_m3": {
      "label": "Stočné – variabilná zložka (bez DPH)",
      "unit": "€/m³",
      "kind": "number",
      "note": "ÚRSO; platí len pri napojení na verejnú kanalizáciu"
    },
    "cena_stocne_s_dph": {
      "label": "Stočné – variabilná zložka s DPH 23 %",
      "unit": "€/m³",
      "kind": "number",
      "note": "odvodené ×1,23"
    },
    "cena_fix_t1_eur_rok": {
      "label": "Fixná zložka ceny (tarifa T1, domácnosť)",
      "unit": "€/rok",
      "kind": "number",
      "note": "od 2025 dvojzložková cena (vyhl. ÚRSO 323/2022 Z. z. v znení 394/2024)"
    },
    "cena_platnost": {
      "label": "Platnosť ceny vody",
      "kind": "text"
    },
    "cena_rozhodnutie": {
      "label": "Cenové rozhodnutie",
      "kind": "text",
      "note": "data.urso.gov.sk"
    },
    "cena_stav": {
      "label": "Stav overenia ceny",
      "kind": "text"
    },
    "cena_stocne_poznamka": {
      "label": "Poznámka k stočnému",
      "kind": "text"
    },
    "kanalizacia_2017": {
      "label": "Verejná kanalizácia a ČOV (2017)",
      "kind": "text",
      "note": "PRVV Žilinského kraja, príloha 1, stav 31.12.2017 (enviroportal.sk/eia/dokument/351034); novšia výstavba neoverená"
    },
    "cov_v_obci": {
      "label": "ČOV v obci",
      "kind": "bool",
      "note": "true = vlastná ČOV obce/mesta; false = bez ČOV (odvádzané inam alebo bez kanalizácie); chýba = neuvedené"
    },
    "elektrina_distribucia": {
      "label": "Distribúcia elektriny",
      "kind": "text",
      "note": "regionálny PDS pre Žilinský kraj: Stredoslovenská distribučná, a.s. (ÚRSO povolenie 2007E 0260; TASR 8.6.2018)"
    },
    "kriminalita_obvod": {
      "label": "Obvod polície (štatistika kriminality)",
      "kind": "text",
      "note": "MV SR vykazuje kriminalitu podľa obvodov okresných riaditeľstiev PZ"
    },
    "kriminalita_zistene_2025": {
      "label": "Zistené trestné činy 2025 (rozpätie)",
      "kind": "text",
      "note": "MV SR mapa kriminality okresov 4Q/2025 (PDF) — počty len ako farebné rozpätie mapy, nie presné číslo"
    },
    "kriminalita_objasnenost_pct": {
      "label": "Objasnenosť trestných činov 2025",
      "unit": "%",
      "kind": "number",
      "note": "MV SR mapa kriminality okresov 4Q/2025"
    },
    "kriminalita_kraj_zistene_2025": {
      "label": "Zistené trestné činy 2025 – Žilinský kraj",
      "kind": "number",
      "note": "MV SR štatistika podľa druhu kriminality 1.1.–31.12.2025 (XML)"
    },
    "zdroje": {
      "label": "Zdroje",
      "kind": "object",
      "note": "skrátený zoznam zdrojov podľa oblastí; plné URL v 49_LIST_NEHNUTELNOSTI/obec_klima/README.md"
    }
  },
  "osm": {
    "vn": {
      "label": "Najbližšie VN vedenie (1–110 kV)",
      "unit": "m",
      "kind": "number",
      "note": "Nadzemné vedenie vysokého napätia (na Kysuciach 22 kV). Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. power=line/minor_line s napätím ≥ 1 kV; power=line bez napätia sa berie ako 22 kV. Poloha vedenia v OSM ±5–10 m. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "vn_kv": {
      "label": "Napätie najbližšieho VN vedenia",
      "unit": "kV",
      "kind": "number",
      "note": "Z OSM tagu voltage (najvyššie z viacerých). Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "vvn": {
      "label": "Najbližšie VVN/ZVN vedenie (≥ 110 kV)",
      "unit": "m",
      "kind": "number",
      "note": "Nadzemné vedenie 110/220/400 kV. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "vvn_kv": {
      "label": "Napätie najbližšieho VVN vedenia",
      "unit": "kV",
      "kind": "number",
      "note": "Z OSM tagu voltage. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "el_op": {
      "label": "V ochrannom pásme el. vedenia / stanice",
      "kind": "bool",
      "note": "Zák. 251/2012 § 43: pásmo od KRAJNÉHO vodiča 1–35 kV 10 m, 35–110 kV 15 m, 110–220 kV 20 m, 220–400 kV 25 m, nad 400 kV 35 m; podzemný kábel 1 m (do 110 kV) / 3 m; elektrická stanica vonkajšieho vyhotovenia 10 m (< 110 kV) / 30 m (≥ 110 kV) od oplotenia, kiosková trafostanica len obrys. OSM má len os vedenia — k pásmu sa pripočíta odhad vzdialenosti krajného vodiča od osi (22 kV +2 m, 110 kV +4 m, 220 kV +6 m, 400 kV +9 m). Pre VN sa predpokladajú holé vodiče (izolované majú len 4 m — pásmo môže byť menšie). Orientačné; záväzne určí prevádzkovateľ (SSD/SEPS). OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "el_op_kv": {
      "label": "Napätie vedenia, do pásma ktorého parcela zasahuje",
      "unit": "kV",
      "kind": "number",
      "note": "Najvyššie napätie spomedzi zasiahnutých pásiem. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "trafo": {
      "label": "Najbližšia trafostanica / rozvodňa",
      "unit": "m",
      "kind": "number",
      "note": "power=transformer, power=substation (aj kiosková a stožiarová). Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "plyn": {
      "label": "Najbližší plynovod (OSM)",
      "unit": "m",
      "kind": "number",
      "note": "man_made=pipeline + substance=gas. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. POZOR: v okrese Čadca, Žilina a Ružomberok OSM plynovody takmer neobsahuje (len pár krátkych úsekov) — chýbajúci údaj NEZNAMENÁ, že plynovod nie je. Distribučnú sieť overiť u SPP-distribúcia, a.s."
    },
    "plyn_op": {
      "label": "V ochrannom pásme plynovodu",
      "kind": "bool",
      "note": "Zák. 251/2012 § 79: od osi 4 m (DN ≤ 200), 8 m (DN 201–500), 12 m (DN 501–700), 50 m (DN > 700), 1 m (NTL/STL v zastavanom území). Ak OSM DN neuvádza, predpokladá sa 8 m (bežný VTL). Bezpečnostné pásmo (§ 80) je pri VTL desiatky až stovky metrov — pri vzdialenosti do 150 m overiť u prevádzkovateľa. Uvedené len ak je plynovod do 10 km."
    },
    "plyn_dn": {
      "label": "Menovitá svetlosť plynovodu",
      "unit": "mm",
      "kind": "number",
      "note": "Tag diameter v OSM (ak je)."
    },
    "ropa": {
      "label": "Najbližší ropovod (OSM)",
      "unit": "m",
      "kind": "number",
      "note": "man_made=pipeline + substance=oil. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. Ropovody Transpetrol sú na juhu SR. OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "cint": {
      "label": "Najbližší cintorín",
      "unit": "m",
      "kind": "number",
      "note": "landuse=cemetery / amenity=grave_yard. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "cint_op": {
      "label": "V ochrannom pásme cintorína (50 m)",
      "kind": "bool",
      "note": "Zák. 131/2010 § 15 ods. 7: 50 m od hranice pozemku pohrebiska — v pásme sa nesmú povoľovať budovy (okrem služieb pohrebníctva). Obec môže VZN pásmo upraviť — overiť na obci. Hranica cintorína podľa OSM (±5 m)."
    },
    "zel": {
      "label": "Najbližšia železničná trať",
      "unit": "m",
      "kind": "number",
      "note": "railway=rail a narrow_gauge (bez zrušených). Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "zel_op": {
      "label": "V ochrannom pásme dráhy",
      "kind": "bool",
      "note": "Zák. 513/2009 § 5: 60 m od osi krajnej koľaje (celoštátna a regionálna dráha), 30 m pri vlečke (service=spur / usage=industrial) a úzkorozchodnej trati. Ak OSM kreslí dvojkoľajku jednou čiarou, chyba ±2 m. Orientačné; záväzne ŽSR / stavebný úrad."
    },
    "farma": {
      "label": "Najbližší hospodársky dvor (farma)",
      "unit": "m",
      "kind": "number",
      "note": "landuse=farmyard — možný zápach/hluk. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "cov": {
      "label": "Najbližšia čistiareň odpadových vôd",
      "unit": "m",
      "kind": "number",
      "note": "man_made=wastewater_plant. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "skladka": {
      "label": "Najbližšia skládka odpadu",
      "unit": "m",
      "kind": "number",
      "note": "landuse=landfill (aj staré/uzavreté, ak sú v OSM). Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "bioplyn": {
      "label": "Najbližšia bioplynová stanica",
      "unit": "m",
      "kind": "number",
      "note": "power=plant/generator so zdrojom biogas. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. V OSM sú na severe SR zriedkavé — údaj väčšinou chýba. OSM nie je úplný register — chýbajúci objekt v OSM neznamená, že v teréne nie je."
    },
    "lampa": {
      "label": "Najbližšia pouličná lampa",
      "unit": "m",
      "kind": "number",
      "note": "highway=street_lamp. Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 2 km. Lampy sú v OSM zmapované len výnimočne (hlavne Žilina) — chýbajúci údaj neznamená neosvetlenú ulicu; pozri aj `cesta_lit`."
    },
    "cesta": {
      "label": "Najbližšia cesta (úsek)",
      "unit": "m",
      "kind": "number",
      "note": "Najbližšia prejazdná cesta z OSM (bez diaľnic a ciest pre motorové vozidlá). Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 2 km. Nehovorí o práve prístupu ani o vlastníkovi cesty (to je skupina `pristup`)."
    },
    "cesta_tr": {
      "label": "Trieda najbližšej cesty",
      "kind": "text",
      "note": "OSM highway preložené: cesta I./II./III. triedy, miestna (ulica), miestna spojovacia, účelová / príjazdová, poľná / lesná cesta, obytná zóna, pešia zóna. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "cesta_pov": {
      "label": "Povrch najbližšej cesty",
      "kind": "text",
      "note": "OSM tag surface (asfalt, betón, štrk, nespevnený …). Chýba = v OSM neuvedený (zmapovaný asi pri 30 % úsekov)."
    },
    "cesta_lit": {
      "label": "Osvetlenie najbližšej cesty",
      "kind": "bool",
      "note": "OSM tag lit. Chýba = neuvedené (zmapované zriedka)."
    },
    "cesta_chod": {
      "label": "Chodník pri najbližšej ceste",
      "kind": "text",
      "note": "OSM tagy sidewalk*: obe strany / ľavá / pravá / samostatný chodník / bez chodníka. Chýba = neuvedené."
    },
    "spev": {
      "label": "Najbližšia spevnená cesta",
      "unit": "m",
      "kind": "number",
      "note": "Vzdialenosť od obrysu parcely (0 = parcelu pretína/dotýka sa), zaokrúhlené na 10 m. Kľúč chýba = nič do 10 km. Spevnená = OSM surface asfalt/betón/dlažba…, alebo bez uvedeného povrchu pri triedach I.–III. tr., miestna, miestna spojovacia, obytná zóna (predpoklad). Poľné/účelové cesty len s výslovne spevneným povrchom."
    },
    "skola": {
      "label": "Najbližšia škola",
      "unit": "m",
      "kind": "number",
      "note": "amenity=school v SR (ZŠ aj SŠ). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "ms": {
      "label": "Najbližšia materská škola / jasle",
      "unit": "m",
      "kind": "number",
      "note": "amenity=kindergarten/childcare v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "lekar": {
      "label": "Najbližší lekár / poliklinika",
      "unit": "m",
      "kind": "number",
      "note": "amenity=doctors/clinic, healthcare=doctor/clinic v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Ambulancie sú v OSM neúplné. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "nemoc": {
      "label": "Najbližšia nemocnica",
      "unit": "m",
      "kind": "number",
      "note": "amenity=hospital v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "lekaren": {
      "label": "Najbližšia lekáreň",
      "unit": "m",
      "kind": "number",
      "note": "amenity=pharmacy v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "super": {
      "label": "Najbližší supermarket",
      "unit": "m",
      "kind": "number",
      "note": "shop=supermarket (SR aj CZ/PL v pohraničí). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "potrav": {
      "label": "Najbližšie potraviny",
      "unit": "m",
      "kind": "number",
      "note": "shop=convenience/general/supermarket (SR aj CZ/PL). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "posta": {
      "label": "Najbližšia pošta",
      "unit": "m",
      "kind": "number",
      "note": "amenity=post_office v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "banka": {
      "label": "Najbližšia banka",
      "unit": "m",
      "kind": "number",
      "note": "amenity=bank v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "atm": {
      "label": "Najbližší bankomat",
      "unit": "m",
      "kind": "number",
      "note": "amenity=atm alebo banka s bankomatom, v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "sport": {
      "label": "Najbližšie športovisko",
      "unit": "m",
      "kind": "number",
      "note": "leisure=sports_centre/pitch/stadium/sports_hall (nie súkromné). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "bazen": {
      "label": "Najbližšia plaváreň / kúpalisko",
      "unit": "m",
      "kind": "number",
      "note": "leisure=water_park, verejné swimming_pool, športové centrum s plávaním. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "ihrisko": {
      "label": "Najbližšie detské ihrisko",
      "unit": "m",
      "kind": "number",
      "note": "leisure=playground (nie súkromné). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "gastro": {
      "label": "Najbližšia reštaurácia / krčma / kaviareň",
      "unit": "m",
      "kind": "number",
      "note": "amenity=restaurant/pub/cafe/bar. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "lyze": {
      "label": "Najbližšie lyžiarske stredisko / vlek",
      "unit": "m",
      "kind": "number",
      "note": "landuse=winter_sports, vleky a lanovky (aerialway), zjazdovky (piste:type=downhill). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "nabij": {
      "label": "Najbližšia nabíjačka elektromobilov",
      "unit": "m",
      "kind": "number",
      "note": "amenity=charging_station (verejná). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "hasic": {
      "label": "Najbližšia hasičská stanica / zbrojnica",
      "unit": "m",
      "kind": "number",
      "note": "amenity=fire_station v SR (aj DHZ). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "policia": {
      "label": "Najbližšia polícia",
      "unit": "m",
      "kind": "number",
      "note": "amenity=police v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "bus": {
      "label": "Najbližšia autobusová zastávka",
      "unit": "m",
      "kind": "number",
      "note": "highway=bus_stop, platform/stop_position bus=yes, autobusová stanica, v SR. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "vlak": {
      "label": "Najbližšia železničná stanica / zastávka",
      "unit": "m",
      "kind": "number",
      "note": "railway=station/halt v SR (bez historických a úzkorozchodných). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Do 1 km (cca 12–15 min pešo vzdušne) → aj v zozname `pesi`. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "pesi": {
      "label": "Do 1 km vzdušne",
      "kind": "list",
      "note": "Zoznam kľúčov vybavenosti (skola, ms, lekar, lekaren, super, potrav, posta, banka, atm, sport, bazen, ihrisko, gastro, lyze, nabij, hasic, policia, bus, vlak), ktorých najbližší objekt je do 1 000 m od stredu parcely. Názov položky = label príslušného kľúča tejto schémy."
    },
    "zjazd": {
      "label": "Najbližší diaľničný zjazd / križovatka",
      "unit": "m",
      "kind": "number",
      "note": "highway=motorway_junction (D1, D3, R, CZ D48/D56, PL S1/S52 …). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 100 km. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "cesta1": {
      "label": "Najbližšia cesta I. triedy / rýchlostná",
      "unit": "m",
      "kind": "number",
      "note": "OSM highway=trunk/primary (SR aj CZ/PL). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 30 km. Zdroj © prispievatelia OpenStreetMap (ODbL)."
    },
    "hr_cz": {
      "label": "Vzdialenosť k hranici s Českom",
      "unit": "m",
      "kind": "number",
      "note": "Spoločné úseky hranice SR (relácia 14296) a ČR (51684) v OSM. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m."
    },
    "hr_pl": {
      "label": "Vzdialenosť k hranici s Poľskom",
      "unit": "m",
      "kind": "number",
      "note": "Spoločné úseky hranice SR (relácia 14296) a PL (49715) v OSM. Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m."
    },
    "mesto": {
      "label": "Vzdialenosť k najbližšiemu mestu",
      "unit": "m",
      "kind": "number",
      "note": "Bod place=city/town v SR (stred mesta podľa OSM). Vzdušná vzdialenosť od stredu (centroidu) parcely, zaokrúhlené na 10 m. Kľúč chýba = nič do 60 km."
    },
    "mesto_n": {
      "label": "Najbližšie mesto",
      "kind": "text",
      "note": "Názov mesta (place=city/town v SR)."
    },
    "t_za": {
      "label": "Čas jazdy autom do: Žilina",
      "unit": "min",
      "kind": "number",
      "note": "Model z cestného grafu OSM (Dijkstra), priemerné rýchlosti podľa triedy cesty: diaľnica 110, rýchlostná/I. tr. (trunk) 85, I. tr. 70, II. tr. 56, III. tr. 45, miestna spojovacia 32, ulica 25, účelová 15, poľná 10–20 km/h; pri uvedenej max. rýchlosti sa berie nižšia z oboch; nespevnené max. 20 km/h. Cieľ = centrum mesta. Plus prístup od stredu parcely k najbližšej ceste (vzdušne × 1,3 pri 15 km/h). Bez dopravných špičiek, križovatiek a zimy. Overené: Turzovka→Žilina 47 vs ~45 min, Čadca→Žilina 32 vs ~30 min, Žilina→Bratislava 118 vs ~120 min (±5 %). Presnosť cca ±10–15 %."
    },
    "t_ca": {
      "label": "Čas jazdy autom do: Čadca",
      "unit": "min",
      "kind": "number",
      "note": "Model z cestného grafu OSM (Dijkstra), priemerné rýchlosti podľa triedy cesty: diaľnica 110, rýchlostná/I. tr. (trunk) 85, I. tr. 70, II. tr. 56, III. tr. 45, miestna spojovacia 32, ulica 25, účelová 15, poľná 10–20 km/h; pri uvedenej max. rýchlosti sa berie nižšia z oboch; nespevnené max. 20 km/h. Cieľ = centrum mesta. Plus prístup od stredu parcely k najbližšej ceste (vzdušne × 1,3 pri 15 km/h). Bez dopravných špičiek, križovatiek a zimy. Overené: Turzovka→Žilina 47 vs ~45 min, Čadca→Žilina 32 vs ~30 min, Žilina→Bratislava 118 vs ~120 min (±5 %). Presnosť cca ±10–15 %."
    },
    "t_ba": {
      "label": "Čas jazdy autom do: Bratislava",
      "unit": "min",
      "kind": "number",
      "note": "Model z cestného grafu OSM (Dijkstra), priemerné rýchlosti podľa triedy cesty: diaľnica 110, rýchlostná/I. tr. (trunk) 85, I. tr. 70, II. tr. 56, III. tr. 45, miestna spojovacia 32, ulica 25, účelová 15, poľná 10–20 km/h; pri uvedenej max. rýchlosti sa berie nižšia z oboch; nespevnené max. 20 km/h. Cieľ = centrum mesta. Plus prístup od stredu parcely k najbližšej ceste (vzdušne × 1,3 pri 15 km/h). Bez dopravných špičiek, križovatiek a zimy. Overené: Turzovka→Žilina 47 vs ~45 min, Čadca→Žilina 32 vs ~30 min, Žilina→Bratislava 118 vs ~120 min (±5 %). Presnosť cca ±10–15 %."
    },
    "t_ova": {
      "label": "Čas jazdy autom do: Ostrava",
      "unit": "min",
      "kind": "number",
      "note": "Model z cestného grafu OSM (Dijkstra), priemerné rýchlosti podľa triedy cesty: diaľnica 110, rýchlostná/I. tr. (trunk) 85, I. tr. 70, II. tr. 56, III. tr. 45, miestna spojovacia 32, ulica 25, účelová 15, poľná 10–20 km/h; pri uvedenej max. rýchlosti sa berie nižšia z oboch; nespevnené max. 20 km/h. Cieľ = centrum mesta. Plus prístup od stredu parcely k najbližšej ceste (vzdušne × 1,3 pri 15 km/h). Bez dopravných špičiek, križovatiek a zimy. Overené: Turzovka→Žilina 47 vs ~45 min, Čadca→Žilina 32 vs ~30 min, Žilina→Bratislava 118 vs ~120 min (±5 %). Presnosť cca ±10–15 %."
    },
    "t_kat": {
      "label": "Čas jazdy autom do: Katowice",
      "unit": "min",
      "kind": "number",
      "note": "Model z cestného grafu OSM (Dijkstra), priemerné rýchlosti podľa triedy cesty: diaľnica 110, rýchlostná/I. tr. (trunk) 85, I. tr. 70, II. tr. 56, III. tr. 45, miestna spojovacia 32, ulica 25, účelová 15, poľná 10–20 km/h; pri uvedenej max. rýchlosti sa berie nižšia z oboch; nespevnené max. 20 km/h. Cieľ = centrum mesta. Plus prístup od stredu parcely k najbližšej ceste (vzdušne × 1,3 pri 15 km/h). Bez dopravných špičiek, križovatiek a zimy. Overené: Turzovka→Žilina 47 vs ~45 min, Čadca→Žilina 32 vs ~30 min, Žilina→Bratislava 118 vs ~120 min (±5 %). Presnosť cca ±10–15 %."
    }
  },
  "pristup": {
    "hranici_s_cestou": {
      "label": "Hraničí s cestou",
      "kind": "bool",
      "note": "spoločná hranica ≥ 0,5 m s parcelou C, ktorej spôsob využívania (PKK) je 21 diaľnica/rýchlostná alebo 22 cesta, miestna/účelová komunikácia, lesná/poľná cesta, chodník, parkovisko (príl. 2 vyhl. 461/2009)"
    },
    "trieda": {
      "label": "Prístup",
      "kind": "text",
      "note": "priamy z verejnej cesty (cesta vo vlastníctve obce/štátu/SSC/kraja) | cez súkromnú/účelovú cestu (cesta FO/PO/SPF/cirkev/urbár alebo nezistený vlastník) | bez priameho prístupu | neznáme (chýba geometria). Právny stav podľa katastra, nie fyzický stav cesty"
    },
    "je_cesta": {
      "label": "Parcela je sama cestou",
      "kind": "bool"
    },
    "front_m": {
      "label": "Dĺžka hranice s cestami",
      "unit": "m",
      "kind": "number",
      "note": "súčet spoločnej hranice so všetkými cestnými parcelami (tolerancia 0,15 m pri C, 0,3 m pri E)"
    },
    "front_verejna_m": {
      "label": "Dĺžka hranice s verejnou cestou",
      "unit": "m",
      "kind": "number"
    },
    "cesty": {
      "label": "Susedné cesty",
      "kind": "list",
      "note": "[{p: parcela C, d: diaľnica/rýchlostná | komunikácia, t: typ vlastníka cesty, h: spoločná hranica m}] max 8; Typ vlastníka: obec | štát/SSC/kraj | SPF | súkromná FO | súkromná PO | cirkev/urbár | nezistený (z mien a IČO v SPI, mená von nejdú); cesta bez LV → vlastník podľa parciel E pod ňou (vážené plochou)"
    },
    "pocet_ciest": {
      "label": "Počet susedných ciest (ak > 8)",
      "kind": "number"
    },
    "cez_vlastnu_parcelu": {
      "label": "Prístup cez susednú parcelu toho istého vlastníka",
      "kind": "text",
      "note": "parcela s rovnakým LV alebo rovnakým okruhom vlastníkov, ktorá má priamy prístup z verejnej cesty"
    },
    "pod_cestou_pct": {
      "label": "Podiel parcely E pod cestou",
      "unit": "%",
      "kind": "number",
      "note": "len parcel_e: koľko plochy leží pod cestnou parcelou C"
    }
  },
  "slnko": {
    "hor": {
      "label": "Horizont (výška terénu nad obzorom) po 5°",
      "unit": "0,5°",
      "kind": "list",
      "note": "72 celých čísel v jednotkách 0,5° pre pravé azimuty 0, 5, …, 355° (0 = sever, 90 = východ, 180 = juh); hodnota/2 = uhol v °. Z bodu 2 m nad terénom v ťažisku parcely (parcely v spoločnej bunke 25 m zdieľajú bod). Blízke okolie 10–1500 m z DMR 5.0 (mriežka 5 m), ďalej do 8,5 km z DMR (25 m), mimo SR Terrain Tiles; zakrivenie Zeme + refrakcia. Bez stromov a budov (DMR = holý terén)."
    },
    "hor_avg": {
      "label": "Priemerná výška horizontu (uzavretosť polohy)",
      "unit": "°",
      "kind": "number",
      "note": "priemer 72 smerov; nízke = otvorená poloha, vysoké = zovretá dolina"
    },
    "vyhlad_az": {
      "label": "Smer najotvorenejšieho výhľadu",
      "unit": "°",
      "kind": "number",
      "note": "stred 45° sektora s najnižším horizontom (proxy výhľadu, bez vegetácie a budov)"
    },
    "vyhlad_smer": {
      "label": "Smer najotvorenejšieho výhľadu",
      "kind": "text",
      "note": "S, SV, V, JV, J, JZ, Z, SZ"
    },
    "vyhlad_hor": {
      "label": "Výška horizontu v smere výhľadu",
      "unit": "°",
      "kind": "number",
      "note": "priemer v sektore"
    },
    "bod_v": {
      "label": "Nadmorská výška bodu výpočtu",
      "unit": "m",
      "kind": "number",
      "note": "nadmorská výška terénu v bode výpočtu (DMR 5.0 − geoid EGM2008)"
    },
    "zima_strata_h": {
      "label": "Strata slnka terénom 21. 12.",
      "unit": "h",
      "kind": "number",
      "note": "astronomická dĺžka dňa − hodiny priameho slnka nad terénnym horizontom"
    },
    "zima_strata_pct": {
      "label": "Strata slnka terénom 21. 12.",
      "unit": "%",
      "kind": "number",
      "note": "podiel dňa, keď je Slnko za kopcom"
    },
    "dec_den": {
      "label": "Dĺžka dňa astronomická – 21. 12. (zimný slnovrat)",
      "unit": "h",
      "kind": "number",
      "note": "od východu po západ Slnka nad rovným obzorom (NOAA, horný okraj disku, refrakcia)"
    },
    "dec_slnko": {
      "label": "Hodiny priameho slnka (terén) – 21. 12. (zimný slnovrat)",
      "unit": "h",
      "kind": "number",
      "note": "minúty, keď je horný okraj Slnka nad terénnym horizontom; bez oblačnosti, stromov a budov"
    },
    "dec_vychod": {
      "label": "Slnko vyjde spoza terénu – 21. 12. (zimný slnovrat)",
      "kind": "text",
      "note": "miestny čas (SEČ, v júni SELČ); prázdne = v ten deň Slnko nevyjde nad horizont"
    },
    "dec_zapad": {
      "label": "Slnko zapadne za terén – 21. 12. (zimný slnovrat)",
      "kind": "text",
      "note": "miestny čas"
    },
    "dec_vychod_astr": {
      "label": "Astronomický východ Slnka – 21. 12. (zimný slnovrat)",
      "kind": "text",
      "note": "nad rovným obzorom, miestny čas"
    },
    "dec_zapad_astr": {
      "label": "Astronomický západ Slnka – 21. 12. (zimný slnovrat)",
      "kind": "text",
      "note": "nad rovným obzorom, miestny čas"
    },
    "mar_den": {
      "label": "Dĺžka dňa astronomická – 21. 3. (rovnodennosť)",
      "unit": "h",
      "kind": "number",
      "note": "od východu po západ Slnka nad rovným obzorom (NOAA, horný okraj disku, refrakcia)"
    },
    "mar_slnko": {
      "label": "Hodiny priameho slnka (terén) – 21. 3. (rovnodennosť)",
      "unit": "h",
      "kind": "number",
      "note": "minúty, keď je horný okraj Slnka nad terénnym horizontom; bez oblačnosti, stromov a budov"
    },
    "mar_vychod": {
      "label": "Slnko vyjde spoza terénu – 21. 3. (rovnodennosť)",
      "kind": "text",
      "note": "miestny čas (SEČ, v júni SELČ); prázdne = v ten deň Slnko nevyjde nad horizont"
    },
    "mar_zapad": {
      "label": "Slnko zapadne za terén – 21. 3. (rovnodennosť)",
      "kind": "text",
      "note": "miestny čas"
    },
    "mar_vychod_astr": {
      "label": "Astronomický východ Slnka – 21. 3. (rovnodennosť)",
      "kind": "text",
      "note": "nad rovným obzorom, miestny čas"
    },
    "mar_zapad_astr": {
      "label": "Astronomický západ Slnka – 21. 3. (rovnodennosť)",
      "kind": "text",
      "note": "nad rovným obzorom, miestny čas"
    },
    "jun_den": {
      "label": "Dĺžka dňa astronomická – 21. 6. (letný slnovrat)",
      "unit": "h",
      "kind": "number",
      "note": "od východu po západ Slnka nad rovným obzorom (NOAA, horný okraj disku, refrakcia)"
    },
    "jun_slnko": {
      "label": "Hodiny priameho slnka (terén) – 21. 6. (letný slnovrat)",
      "unit": "h",
      "kind": "number",
      "note": "minúty, keď je horný okraj Slnka nad terénnym horizontom; bez oblačnosti, stromov a budov"
    },
    "jun_vychod": {
      "label": "Slnko vyjde spoza terénu – 21. 6. (letný slnovrat)",
      "kind": "text",
      "note": "miestny čas (SEČ, v júni SELČ); prázdne = v ten deň Slnko nevyjde nad horizont"
    },
    "jun_zapad": {
      "label": "Slnko zapadne za terén – 21. 6. (letný slnovrat)",
      "kind": "text",
      "note": "miestny čas"
    },
    "jun_vychod_astr": {
      "label": "Astronomický východ Slnka – 21. 6. (letný slnovrat)",
      "kind": "text",
      "note": "nad rovným obzorom, miestny čas"
    },
    "jun_zapad_astr": {
      "label": "Astronomický západ Slnka – 21. 6. (letný slnovrat)",
      "kind": "text",
      "note": "nad rovným obzorom, miestny čas"
    }
  },
  "stavby": {
    "druh": {
      "label": "Druh stavby",
      "kind": "text",
      "note": "SPI CS.DRS dekódované podľa prílohy 7 vyhl. ÚGKK 461/2009 Z.z. (subjekt building)"
    },
    "drs": {
      "label": "Kód druhu stavby",
      "kind": "number",
      "note": "príloha 7 vyhl. ÚGKK 461/2009 Z.z."
    },
    "sc": {
      "label": "Súpisné číslo",
      "kind": "number",
      "note": "SPI CS.PEC; bez s.č. je odkaz p:<parcela>"
    },
    "nejednoznacne_sc": {
      "label": "Súpisné číslo sa v k.ú. opakuje",
      "kind": "bool",
      "note": "Rôzne časti obce majú rovnaké s.č. (napr. Žilina) → stavba má odkaz p:<parcela>; riadok sc:<č> obsahuje 'varianty'"
    },
    "popis": {
      "label": "Popis stavby v katastri",
      "kind": "text",
      "note": "SPI CS (text popisu); popisy, ktoré by mohli obsahovať meno osoby, sú vynechané"
    },
    "parcely": {
      "label": "Parcely C pod stavbou",
      "kind": "list",
      "note": "SPI CS.CPA"
    },
    "lv": {
      "label": "List vlastníctva stavby",
      "kind": "number"
    },
    "umiestnenie": {
      "label": "Umiestnenie stavby",
      "kind": "text",
      "note": "SPI CS.UMS, príloha 8 vyhl. ÚGKK 461/2009 Z.z."
    },
    "rozostavana": {
      "label": "Rozostavaná stavba",
      "kind": "bool",
      "note": "DRS 21 alebo parcela pod stavbou s PKK 26"
    },
    "na_cudzom_pozemku": {
      "label": "Stavba na cudzom pozemku",
      "kind": "bool",
      "note": "Pozemok pod stavbou je na inom LV s iným okruhom vlastníkov (porovnaná množina vlastníkov, nie len číslo LV), alebo PA.DRV = 5; pri parcele C bez LV sa porovnávajú LV parciel E pod ňou. Chýba = nedá sa určiť"
    },
    "pozemok_lv": {
      "label": "LV pozemku pod stavbou",
      "kind": "list"
    },
    "pozemok_vlastnik": {
      "label": "Typ vlastníka pozemku pod stavbou",
      "kind": "list",
      "note": "Typ vlastníka: obec | štát/SSC/kraj | SPF | súkromná FO | súkromná PO | cirkev/urbár | nezistený (z mien a IČO v SPI, mená von nejdú)"
    },
    "ochrana": {
      "label": "Ochrana stavby",
      "kind": "list",
      "note": "SPI CS.DON, príloha 3 vyhl. ÚGKK 461/2009 Z.z. (napr. kultúrna pamiatka)"
    },
    "byty": {
      "label": "Počet bytov v stavbe",
      "kind": "number",
      "note": "z SPI BP (byty + rozostavané byty), rovnaké priradenie ako v skupine byty"
    },
    "nebytove": {
      "label": "Počet nebytových priestorov",
      "kind": "number",
      "note": "SPI BP, BNP 2 a 4"
    },
    "rozostavane_jednotky": {
      "label": "Rozostavané byty/priestory",
      "kind": "number",
      "note": "BNP 3 a 4"
    },
    "vchody": {
      "label": "Počet vchodov",
      "kind": "number",
      "note": "rôzne čísla vchodu (BP.CIV) jednotiek v stavbe"
    },
    "najvyssie_podlazie": {
      "label": "Najvyššie podlažie s jednotkou",
      "kind": "number",
      "note": "max BP.CIP v stavbe (číslovanie podľa katastra)"
    },
    "pocet_stavieb": {
      "label": "Počet stavieb bez s.č. na parcele",
      "kind": "number",
      "note": "pri odkaze p:<parcela>, ak je na parcele viac stavieb bez s.č."
    },
    "druhy": {
      "label": "Druhy stavieb na parcele",
      "kind": "list"
    },
    "dalsie": {
      "label": "Ďalšie stavby s rovnakým odkazom",
      "kind": "list",
      "note": "[{druh, sc, lv}] — zriedkavá kolízia odkazu p:<parcela>"
    },
    "varianty": {
      "label": "Stavby s týmto súpisným číslom",
      "kind": "list",
      "note": "len riadok sc:<č> pri opakovanom s.č.: [{ref, druh, parcely, lv}]"
    },
    "poznamka": {
      "label": "Poznámka",
      "kind": "text"
    },
    "stavby": {
      "label": "Stavby na parcele",
      "kind": "list",
      "note": "subjekt parcel_c: [{ref (odkaz na building), druh, sc}]"
    },
    "pocet": {
      "label": "Počet stavieb na parcele",
      "kind": "number",
      "note": "subjekt parcel_c"
    }
  },
  "susedia": {
    "pocet": {
      "label": "Počet susedných parciel C",
      "kind": "number",
      "note": "spoločná hranica ≥ 0,5 m (VGI KLADPAR, tolerancia 0,15 m); susedia za hranicou k.ú. nie sú zahrnutí"
    },
    "cesty": {
      "label": "Z toho cestné parcely",
      "kind": "number"
    },
    "rovnaky_vlastnik": {
      "label": "Susedia s rovnakým vlastníkom",
      "kind": "number",
      "note": "rovnaké LV alebo identický okruh vlastníkov na inom LV — kandidáti na scelenie"
    },
    "susedia": {
      "label": "Susedné parcely",
      "kind": "list",
      "note": "max 12 podľa dĺžky hranice: [{p, druh (skrátený druh pozemku), vym m², lv, t: typ vlastníka, h: spoločná hranica m, sv: 'lv' rovnaké LV | 'vl' rovnakí vlastníci, cesta: true}]; Typ vlastníka: obec | štát/SSC/kraj | SPF | súkromná FO | súkromná PO | cirkev/urbár | nezistený (z mien a IČO v SPI, mená von nejdú)"
    },
    "obvod_m": {
      "label": "Obvod parcely",
      "unit": "m",
      "kind": "number",
      "note": "z mapy"
    },
    "celok": {
      "label": "Celok rovnakého vlastníka",
      "kind": "object",
      "note": "súvislá skupina susediacich parciel s rovnakým vlastníkom (FO/PO/cirkev/urbár, ≤ 50 parciel): {id: najnižšie č. parcely, n: počet parciel, m2: súčet výmer z LV}"
    },
    "bez_lv": {
      "label": "Parcela C bez LV",
      "kind": "bool",
      "note": "vlastníctvo je evidované na parcelách E"
    },
    "e_parcely": {
      "label": "Parcely E pod parcelou C",
      "kind": "list",
      "note": "len pri parcele C bez LV: [{p, lv, t, m2 prekryvu}] max 8"
    },
    "e_parciel": {
      "label": "Počet parciel E pod parcelou (ak > 8)",
      "kind": "number"
    }
  },
  "teren": {
    "v_min": {
      "label": "Nadmorská výška – najnižší bod",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0) prevzorkované na 2 m; WCS dáva elipsoidickú výšku ETRS89 → nadmorská výška = h − N (geoid EGM2008, rovina pre k.ú.; rozdiel voči Bpv kvazigeoidu do ~0,5 m)"
    },
    "v_avg": {
      "label": "Nadmorská výška – priemer",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0) prevzorkované na 2 m; WCS dáva elipsoidickú výšku ETRS89 → nadmorská výška = h − N (geoid EGM2008, rovina pre k.ú.; rozdiel voči Bpv kvazigeoidu do ~0,5 m)"
    },
    "v_max": {
      "label": "Nadmorská výška – najvyšší bod",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0) prevzorkované na 2 m; WCS dáva elipsoidickú výšku ETRS89 → nadmorská výška = h − N (geoid EGM2008, rovina pre k.ú.; rozdiel voči Bpv kvazigeoidu do ~0,5 m)"
    },
    "prevysenie": {
      "label": "Prevýšenie v rámci parcely (max − min)",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0), prevzorkované na 2 m"
    },
    "sklon_avg": {
      "label": "Sklon – priemer",
      "unit": "%",
      "kind": "number",
      "note": "Hornova metóda 3×3 na mriežke 2 m; ÚGKK DMR 5.0 (1 m, CC BY 4.0), prevzorkované na 2 m"
    },
    "sklon_p90": {
      "label": "Sklon – 90. percentil (strmšie časti)",
      "unit": "%",
      "kind": "number",
      "note": "10 % plochy je strmšej"
    },
    "sklon_max": {
      "label": "Sklon – maximum",
      "unit": "%",
      "kind": "number",
      "note": "najstrmšia 2 m bunka (zachytí aj násypy, terasy, múriky)"
    },
    "sklon_avg_deg": {
      "label": "Sklon – priemer",
      "unit": "°",
      "kind": "number",
      "note": "to isté v stupňoch"
    },
    "sklon_p90_deg": {
      "label": "Sklon – 90. percentil",
      "unit": "°",
      "kind": "number",
      "note": "to isté v stupňoch"
    },
    "sklon_max_deg": {
      "label": "Sklon – maximum",
      "unit": "°",
      "kind": "number",
      "note": "to isté v stupňoch"
    },
    "zast_podiel": {
      "label": "Podiel plochy so sklonom do 15 % (prakticky zastaviteľná)",
      "unit": "%",
      "kind": "number",
      "note": "podiel 2 m buniek so sklonom < 15 %"
    },
    "zast_m2": {
      "label": "Plocha so sklonom do 15 %",
      "unit": "m²",
      "kind": "number",
      "note": "podiel × výmera z mapy KN (VGI)"
    },
    "rovina_podiel": {
      "label": "Podiel rovinatej plochy (sklon < 2 %)",
      "unit": "%",
      "kind": "number",
      "note": "na rovine sa orientácia neurčuje"
    },
    "orient": {
      "label": "Prevládajúca orientácia svahu",
      "kind": "text",
      "note": "S, SV, V, JV, J, JZ, Z, SZ podľa najčastejšieho smeru spádu (bunky so sklonom ≥ 2 %); „rovina“ ak ≥ 70 % plochy má sklon < 2 %"
    },
    "orient_deg": {
      "label": "Orientácia svahu – priemerný azimut",
      "unit": "°",
      "kind": "number",
      "note": "kruhový priemer smeru spádu vážený sklonom, pravý azimut od severu (0 = S, 180 = J); chýba na rovine"
    },
    "juh_podiel": {
      "label": "Podiel plochy orientovanej na juh (JV–J–JZ)",
      "unit": "%",
      "kind": "number",
      "note": "bunky so sklonom ≥ 2 % a azimutom 112,5°–247,5°, z celej plochy parcely"
    },
    "poloha": {
      "label": "Poloha v teréne",
      "kind": "text",
      "note": "TPI 300 m (výška − priemer okolia v kruhu 300 m, mriežka 5 m, priemer cez parcelu) + priemerný sklon: hrebeň (> +15 m), horná časť svahu (+7,5…+15 m), svah / rovina (±7,5 m; rovina pri sklone ≤ 5°), úpätie (−7,5…−15 m), dolina (< −15 m). Prahy = ±0,5/±1 SD TPI krajiny Kysúc (Weiss 2001), pevné pre všetky k.ú."
    },
    "tpi": {
      "label": "TPI 300 m (vyvýšenie voči okoliu)",
      "unit": "m",
      "kind": "number",
      "note": "+ = vyššie ako okolie (chrbát), − = nižšie (údolie)"
    },
    "tpi_kraj": {
      "label": "TPI 1500 m (poloha v krajine)",
      "unit": "m",
      "kind": "number",
      "note": "to isté v kruhu 1,5 km (mriežka 25 m) — dno kotliny/doliny má veľké záporné číslo"
    },
    "tpi_5k": {
      "label": "TPI 5 km (poloha v kotline / doline)",
      "unit": "m",
      "kind": "number",
      "note": "výška − priemer okolia v kruhu 5 km (mriežka 25 m); dno širokej kotliny (napr. Žilinská) má veľké záporné číslo aj tam, kde TPI 300 m/1,5 km je blízko nuly"
    },
    "mraz": {
      "label": "Mrazová kotlina / inverzná poloha",
      "kind": "bool",
      "note": "áno ak priemerný sklon < 5 %, poloha dolina/úpätie/rovina a zároveň TPI300 < −7,5 m (lokálna depresia) alebo TPI1500 < −50 m (dno doliny) alebo TPI5000 < −60 m (dno kotliny) — miesta, kde sa hromadí studený vzduch: inverzie, hmly, neskoré jarné mrazy. Heuristika z reliéfu, nie meranie."
    },
    "odtok": {
      "label": "Priteká na parcelu voda zo svahu nad ňou?",
      "kind": "text",
      "note": "nie / mierne / výrazne. D8 smer odtoku na mriežke 5 m (DMR 5.0) po vyplnení bezodtokových depresií (Priority-Flood+ε, Barnes 2014); parcela = bunky so stredom do 2,5 m od obrysu. výrazne = sústredený prítok z ≥ 5 ha (ryha, jarok, potok) alebo prítok ≥ 3 ha a ≥ 3× výmera; mierne = prítok ≥ 2000 m² a ≥ 0,5× výmera. Bez priepustov a kanalizácie (DMR = holý terén)."
    },
    "odtok_m2": {
      "label": "Plocha svahu nad parcelou, z ktorej voda steká na parcelu",
      "unit": "m²",
      "kind": "number",
      "note": "súčet povodí buniek mimo parcely, ktoré odtekajú priamo do parcely (povodie siahajúce za okraj výpočtu 1,6 km od k.ú. je orezané; mimo SR z Terrain Tiles)"
    },
    "odtok_tok_m2": {
      "label": "Najväčší sústredený prítok (jeden vtok)",
      "unit": "m²",
      "kind": "number",
      "note": "povodie najväčšieho jednotlivého vtoku — vysoké číslo = ryha, potok, priekopa"
    },
    "profil": {
      "label": "Výškový profil pozdĺž hlavnej osi",
      "unit": "m",
      "kind": "list",
      "note": "5 nadmorských výšok v 0/25/50/75/100 % dĺžky osi (os = dlhšia strana min. otočeného obdĺžnika, vedená jeho stredom, orezaná na parcelu), začína vyšším koncom"
    },
    "profil_dl": {
      "label": "Dĺžka hlavnej osi",
      "unit": "m",
      "kind": "number",
      "note": "úsek osi vnútri parcely"
    },
    "profil_az": {
      "label": "Smer osi (od vyššieho konca)",
      "unit": "°",
      "kind": "number",
      "note": "pravý azimut"
    },
    "profil_pokles": {
      "label": "Pokles pozdĺž osi (začiatok − koniec)",
      "unit": "m",
      "kind": "number"
    },
    "dom": {
      "label": "Zemné práce pre dom 12×10 m",
      "kind": "text",
      "note": "najrovnejšie miesto, kde sa celý pôdorys 12×10 m zmestí s odstupom 2 m od hranice parcely (otočený pozdĺž aj naprieč osi parcely): nízke < 1 m prevýšenia v pôdoryse, stredné 1–2,5 m, vysoké ≥ 2,5 m; „nezmestí sa“ = parcela je na dom úzka/malá (nehovorí o právnej zastaviteľnosti)"
    },
    "dom_prev": {
      "label": "Prevýšenie terénu v pôdoryse domu",
      "unit": "m",
      "kind": "number",
      "note": "max − min výšky v 42 bodoch pôdorysu (sieť 2 m)"
    },
    "dom_bod": {
      "label": "Stred najvhodnejšieho miesta pre dom",
      "kind": "list",
      "note": "[lat, lon] WGS84"
    },
    "mala": {
      "label": "Malá parcela – hodnoty len orientačné",
      "kind": "bool",
      "note": "menej ako 3 bunky 2 m so stredom v parcele; použité bunky dotknuté obrysom"
    }
  },
  "up": {
    "zona": {
      "label": "Funkčné využitie podľa ÚP",
      "kind": "text",
      "note": "Kategória plochy z komplexného výkresu ÚP obce (odvodené z rastrového/PDF výkresu — orientačné)"
    },
    "kat": {
      "label": "Kód kategórie",
      "kind": "text",
      "note": "byvanie_rd, byvanie_bd, zmiesane, ov, vyroba, polno_vyroba, tech, doprava, sport, rekreacia, zelen, zahrady, orna, ttp, pol_poda, les, voda"
    },
    "rodina": {
      "label": "Rodina zóny (engine)",
      "kind": "text",
      "note": "Rovnaké rodiny ako gold_li_engine (bývanie/rekreácia, hromadné bývanie, OV/zmiešané, výroba/technická, šport, zeleň/orná/lesy, vodné, doprava)"
    },
    "podiel": {
      "label": "Podiel dominantnej zóny na parcele",
      "unit": "%",
      "kind": "number",
      "note": "0–1; podiel zo zaradených pixelov výkresu v obryse parcely"
    },
    "pokrytie": {
      "label": "Čitateľnosť výkresu v parcele",
      "unit": "%",
      "kind": "number",
      "note": "0–1; podiel plochy parcely, kde výkres má rozpoznateľnú farbu legendy (zvyšok čiary, text, biela)"
    },
    "jednoznacne": {
      "label": "Zóna jednoznačná",
      "kind": "bool",
      "note": "podiel ≥ 50 % a pokrytie ≥ 25 %; inak len odhad"
    },
    "dalsie": {
      "label": "Ďalšie zóny v parcele",
      "kind": "list",
      "note": "[[zóna, podiel], …] ak ≥ 10 %"
    },
    "legenda": {
      "label": "Položka legendy výkresu",
      "kind": "text",
      "note": "text z legendy výkresu"
    },
    "presnost_m": {
      "label": "Presnosť polohy výkresu",
      "unit": "m",
      "kind": "number",
      "note": "RMSE vlícovacích bodov (min. 2 m / pol pixelu výkresu)"
    },
    "vzorka": {
      "label": "Spôsob vzorky",
      "kind": "text",
      "note": "pri malých parcelách okno okolo centroidu"
    },
    "metoda": {
      "label": "Metóda",
      "kind": "text",
      "note": "georef na VGI + legenda"
    },
    "zdroj": {
      "label": "Zdroj ÚP (k.ú.)",
      "kind": "text",
      "note": "riadok subjectType=ku"
    },
    "dokumenty": {
      "label": "Použité výkresy ÚP",
      "kind": "list",
      "note": "názov, URL, dátum, stránka"
    },
    "parciel_c_so_zonou": {
      "label": "Parciel C so zónou",
      "kind": "number",
      "note": "jednoznačné"
    },
    "parciel_c_s_odhadom": {
      "label": "Parciel C s odhadom zóny",
      "kind": "number",
      "note": "vrátane nejednoznačných"
    },
    "parciel_e_so_zonou": {
      "label": "Parciel E so zónou",
      "kind": "number",
      "note": "jednoznačné"
    },
    "poznamka": {
      "label": "Poznámka",
      "kind": "text"
    }
  },
  "vlastnici": {
    "pocet": {
      "label": "Počet zápisov v časti B",
      "kind": "number",
      "note": "riadky SPI VL na LV (vlastníci, správcovia, iné osoby); LEN agregáty — žiadne mená, dátumy, adresy"
    },
    "vlastnikov": {
      "label": "Počet vlastníkov",
      "kind": "number",
      "note": "VL.TUC = 1"
    },
    "fo": {
      "label": "Fyzické osoby",
      "kind": "number"
    },
    "po": {
      "label": "Právnické osoby (súkromné)",
      "kind": "number"
    },
    "obec": {
      "label": "Obec / mesto",
      "kind": "number",
      "note": "chýba = 0"
    },
    "stat": {
      "label": "Štát / SSC / kraj / štátny podnik",
      "kind": "number",
      "note": "chýba = 0"
    },
    "spf": {
      "label": "Slovenský pozemkový fond (ako vlastník)",
      "kind": "number",
      "note": "chýba = 0"
    },
    "cirkev_urbar": {
      "label": "Cirkev / urbár / pozemkové spoločenstvo",
      "kind": "number",
      "note": "chýba = 0"
    },
    "nezisteny": {
      "label": "Nezistení vlastníci (v správe SPF/lesov)",
      "kind": "number",
      "note": "zápisy so správcom (VL.TUC = 2) alebo 'nezistený/neznámy'"
    },
    "zahranicie": {
      "label": "Vlastníci so štátom mimo SR",
      "kind": "number",
      "note": "VL.STT"
    },
    "ina_osoba": {
      "label": "Iné oprávnené osoby (nájomca…)",
      "kind": "number"
    },
    "najmensi_podiel": {
      "label": "Najmenší spoluvlastnícky podiel",
      "kind": "text"
    },
    "pravdepodobne_zosnuli": {
      "label": "Pravdepodobne zosnulí vlastníci",
      "kind": "number",
      "note": "počet FO narodených pred 1925 (dátum narodenia z SPI, ak je zapísaný) alebo s poznámkou 'zomr.' — len počet"
    },
    "prevazuje": {
      "label": "Prevažujúci typ vlastníka",
      "kind": "text",
      "note": "podľa súčtu podielov; Typ vlastníka: obec | štát/SSC/kraj | SPF | súkromná FO | súkromná PO | cirkev/urbár | nezistený (z mien a IČO v SPI, mená von nejdú)"
    },
    "podiely_pct": {
      "label": "Podiely podľa typu vlastníka",
      "kind": "object",
      "note": "{fo, po, obec, stat, spf, cirkev_urbar, nezisteny: % podielov}"
    },
    "posledna_zmena_rok": {
      "label": "Posledná zmena vlastníka (rok)",
      "kind": "number",
      "note": "najnovší rok zápisu/listiny z nadobúdacích titulov (SPI PV, CDE 3)"
    },
    "nadobudnutie": {
      "label": "Spôsob nadobudnutia",
      "kind": "list",
      "note": "[{druh: dedičstvo | kúpa | darovanie | exekúcia/dražba | ROEP | zámena | reštitúcia/navrátenie | pozemkové úpravy | vyporiadanie BSM… | iné, n: počet vlastníkov, rok: najnovší rok}]"
    }
  },
  "vzn": {
    "obec": {
      "label": "Obec",
      "kind": "text"
    },
    "overene": {
      "label": "Overené z platného VZN",
      "kind": "bool"
    },
    "dan": {
      "label": "Daň z nehnuteľností (VZN)"
    },
    "vzn": {
      "label": "VZN",
      "kind": "text"
    },
    "ucinnost": {
      "label": "Účinnosť",
      "kind": "date"
    },
    "url": {
      "label": "Dokument",
      "kind": "url"
    },
    "pozemky_pct": {
      "label": "Sadzby dane z pozemkov",
      "unit": "%",
      "kind": "obj"
    },
    "hodnota_pozemku_eur_m2": {
      "label": "Hodnota pozemku podľa VZN",
      "unit": "€/m²",
      "kind": "obj"
    },
    "stavby_eur_m2": {
      "label": "Sadzby dane zo stavieb",
      "unit": "€/m²",
      "kind": "obj"
    },
    "priplatok_podlazie_eur_m2": {
      "label": "Príplatok za podlažie",
      "unit": "€/m²",
      "kind": "num"
    },
    "byty_eur_m2": {
      "label": "Daň z bytov",
      "unit": "€/m²",
      "kind": "num"
    },
    "nebytove_eur_m2": {
      "label": "Daň z nebytových priestorov",
      "unit": "€/m²",
      "kind": "num"
    },
    "poznamky": {
      "label": "Poznámky",
      "kind": "text"
    },
    "odpad": {
      "label": "Poplatok za odpad (VZN)"
    },
    "eur_osoba_rok": {
      "label": "Poplatok na osobu",
      "unit": "€/rok",
      "kind": "num"
    },
    "chata_eur_rok": {
      "label": "Poplatok za chatu / nebývajúci",
      "unit": "€/rok",
      "kind": "num"
    }
  }
};

export const FACT_GROUP_LABEL: Record<string, string> = {
  teren: "Terén", slnko: "Slnko a svetlo", stavby: "Stavby", byty: "Byty a nebytové priestory", pristup: "Prístup z cesty",
  susedia: "Susedné parcely", mapa: "Z katastrálnej mapy", bpej: "Pôda (BPEJ)", vlastnici: "Vlastníci — súhrn",
  osm: "Siete, doprava a vybavenosť (OSM)", obec: "Obec a ľudia", klima: "Klíma", normy: "Stavebné normy lokality", eia: "Zámery EIA/SEA v obci", up: "Územný plán z výkresu", adresa: "Adresa a spádová škola", vzn: "Dane a poplatky obce (VZN)", financie: "Sadzby bánk",
};
