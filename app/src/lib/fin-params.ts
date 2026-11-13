// PARAMETRE FINANCIÍ LISTU NEHNUTEĽNOSTI — GENEROVANÉ 2026-11-13 z 49_LIST_NEHNUTELNOSTI/financie/gen_fin_params.py
// (research/parametre_pravo.json + zdroje_trh.json). NEUPRAVOVAŤ RUČNE — upraviť JSON a spustiť generátor.
// Trhové sadzby tu nie sú — načítajú sa živo (fin-market.server.ts: ECB/Eurostat + verejné sadzby bánk).
export type FinParams = typeof FIN;

export const FIN = {
 "asOf": "2026-11-13",
 "fallbackRatePct": 3.9,
 "nbs": {
  "ltvMax": 0.9,
  "ltvHighFrom": 0.8,
  "ltv2027": {
   "od": "2027-01-01",
   "mladi35": 0.9,
   "ostatni": 0.8,
   "tretia": 0.7
  },
  "dtiMax": 8,
  "dtiAgeFrom": 40,
  "dtiAgeStep": 0.25,
  "dtiMin": 3,
  "dtiAgeEnd": 65,
  "dstiMax": 0.6,
  "stressAddPp": 2,
  "stressAddPpFix10": 1,
  "stressCapPct": 6,
  "maxYears": 30,
  "maxAgeEnd": 70
 },
 "zivotneMinimum": {
  "adult1": 295.22,
  "adultNext": 205.96,
  "child": 134.8
 },
 "poplatky": {
  "vkladEl": 50,
  "vkladPapier": 100,
  "vkladZrychleny": 150,
  "overeniePodpis": 2,
  "overenieNotar": 4,
  "uschovaTarifa": [
   [
    0,
    5000,
    0.01
   ],
   [
    5000,
    50000,
    0.005
   ],
   [
    50000,
    100000,
    0.003
   ],
   [
    100000,
    500000,
    0.001
   ],
   [
    500000,
    10000000,
    0.0005
   ]
  ],
  "uschovaMin": 50,
  "dphNotar": 0.23,
  "znalecByt": 225,
  "znalecDom": 375,
  "znalecPozemok": 250,
  "bankaPoplatok": 0,
  "geometrickyPlan": 490,
  "proviziaText": "bežne 2–4 % z ceny + DPH, často ju platí predávajúci"
 },
 "dane": {
  "oslobodenieRoky": 5,
  "foSadzby": [
   0.19,
   0.25,
   0.3,
   0.35
  ],
  "foHranice": [
   43983.32,
   60349.21,
   75010.32
  ],
  "foSadzba1": 0.19,
  "foSadzba2": 0.25,
  "najomOslobodene": 500,
  "dividendy": 0.07,
  "dividendyZp": 0.15,
  "poSadzbaText": "10 % (príjmy do 100 000 €), 21 %, 24 % (nad 5 mil. €)",
  "odpisyText": "budova na bývanie 40 rokov (6. skupina), iné budovy 20 alebo 40 rokov",
  "dph": 0.23,
  "dphBytyText": "znížená 5 % len pri štátom podporovanom nájomnom bývaní"
 },
 "podpora": {
  "bonusVekMax": 35,
  "bonusPrijemText": "1,6-násobku priemernej mzdy",
  "bonusRoky": 5,
  "bonusPct": 50,
  "bonusMaxEur": 1200,
  "sfrbMaxM2": 80,
  "sfrbMaxM2Rd": 120,
  "sfrbMaxEur": 200000,
  "sfrbText": "Štátny fond rozvoja bývania požičiava na kúpu bytu alebo domu až 100 % ceny (najviac 200 000 €) na 40 rokov s nízkym úrokom — pre mladých do 35 rokov a rodiny; byt do 80 m²  rodinný dom do 120 m²; žiadosti v termínoch výzvy fondu."
 },
 "stavba": {
  "eurM2": {
   "rd": 2100,
   "bd": 1800,
   "obchod": 1900,
   "garaz": 800,
   "hala": 620,
   "chata": 1700
  },
  "stavK": "2026, odhad (stavebný cenový index SR +4,8 % r/r)"
 },
 "poistenie": {
  "nehnPromile": 1.0,
  "domacnostPromile": 2.5,
  "domacnostEurM2": 300,
  "zodpovednostEur": 30
 },
 "udrzbaPct": 1.5,
 "energie": {
  "kurenieKwhM2Dom": 120,
  "kurenieKwhM2Byt": 90,
  "plynEurKwh": 0.1,
  "teploEurKwh": 0.12,
  "elektrinaKwhRok": 2500,
  "elektrinaEurKwh": 0.1978,
  "elektrinaStalaMes": 9.59,
  "stavK": "ceny domácností 2026 (elektrina SSD D2 0,1978 €/kWh; plyn s distribúciou ~0,10 €/kWh — odhad)"
 },
 "byty": {
  "fondOpravEurM2Mes": 1.0,
  "spravaEurMes": 12
 },
 "pripojky": {
  "elektrinaPoplatok": 316.5,
  "plynPoplatok": 190,
  "vodaPoplatok": 300,
  "kanalPoplatok": 500,
  "eurM": {
   "elektrina": 65,
   "voda": 90,
   "kanal": 115,
   "plyn": 75
  }
 },
 "vystavba": {
  "projektPovolenie": 6000,
  "zemnePraceEurM3": 18,
  "developerEurM2Hpp": 1800,
  "developerZiskPct": 15,
  "developerVedlajsiePct": 10
 },
 "investicia": {
  "neobsadenostMes": 1,
  "predajNakladyPct": 4
 },
 "hodnotaPozemku": {
  "pasma": [
   {
    "doObyv": 1000,
    "zahrady": 1.32,
    "zastavane": 1.32,
    "ostatne": 1.32,
    "stavebne": 13.27
   },
   {
    "doObyv": 6000,
    "zahrady": 1.85,
    "zastavane": 1.85,
    "ostatne": 1.85,
    "stavebne": 18.58
   },
   {
    "doObyv": 10000,
    "zahrady": 2.12,
    "zastavane": 2.12,
    "ostatne": 2.12,
    "stavebne": 21.24
   },
   {
    "doObyv": 25000,
    "zahrady": 2.65,
    "zastavane": 2.65,
    "ostatne": 2.65,
    "stavebne": 26.55
   },
   {
    "doObyv": 10000000,
    "zahrady": 3.31,
    "zastavane": 3.31,
    "ostatne": 3.31,
    "stavebne": 33.19
   }
  ],
  "sidloOkresu": {
   "doObyv": 0,
   "zahrady": 4.64,
   "zastavane": 4.64,
   "ostatne": 4.64,
   "stavebne": 46.47
  },
  "sidloKraja": {
   "doObyv": 0,
   "zahrady": 5.31,
   "zastavane": 5.31,
   "ostatne": 5.31,
   "stavebne": 53.11
  },
  "sidlaOkresov": [
   "Čadca",
   "Kysucké Nové Mesto",
   "Ružomberok",
   "Bytča",
   "Martin",
   "Dolný Kubín",
   "Liptovský Mikuláš",
   "Námestovo",
   "Turčianske Teplice",
   "Tvrdošín"
  ],
  "sidlaKrajov": [
   "Žilina",
   "Banská Bystrica",
   "Nitra",
   "Trenčín",
   "Trnava",
   "Prešov",
   "Košice"
  ],
  "ornaTtp": {
   "810908": {
    "orna": 0.0647,
    "ttp": 0.0175
   },
   "812561": {
    "orna": 0.2091,
    "ttp": 0.0185
   },
   "813630": {
    "orna": 0.4086,
    "ttp": 0.0219
   },
   "818526": {
    "orna": 0.1599,
    "ttp": 0.0245
   },
   "824551": {
    "orna": 0.1035,
    "ttp": 0.0235
   },
   "824852": {
    "orna": 0.0995,
    "ttp": 0.0192
   },
   "826294": {
    "orna": 0.0773,
    "ttp": 0.0179
   },
   "828483": {
    "orna": 0.2987,
    "ttp": 0.0265
   },
   "807117": {
    "orna": 0,
    "ttp": 0.0295
   },
   "830283": {
    "orna": 0.3601,
    "ttp": 0.0521
   },
   "844811": {
    "orna": 0.311,
    "ttp": 0.0252
   },
   "830381": {
    "orna": 0.2575,
    "ttp": 0.0278
   },
   "832987": {
    "orna": 0.0647,
    "ttp": 0.0232
   },
   "833126": {
    "orna": 0.2124,
    "ttp": 0.0225
   },
   "834858": {
    "orna": 0.1035,
    "ttp": 0.0199
   },
   "839728": {
    "orna": 0.1563,
    "ttp": 0.0249
   },
   "815802": {
    "orna": 0,
    "ttp": 0.0199
   },
   "841633": {
    "orna": 0.1045,
    "ttp": 0.0192
   },
   "843229": {
    "orna": 0.1566,
    "ttp": 0.0239
   },
   "843610": {
    "orna": 0.1098,
    "ttp": 0.0185
   },
   "843644": {
    "orna": 0.1158,
    "ttp": 0.0252
   },
   "844748": {
    "orna": 0.1716,
    "ttp": 0.0205
   },
   "847771": {
    "orna": 0.3107,
    "ttp": 0.0444
   },
   "849057": {
    "orna": 0.2253,
    "ttp": 0.0185
   },
   "851027": {
    "orna": 0.1825,
    "ttp": 0.0189
   },
   "851388": {
    "orna": 0.1417,
    "ttp": 0.0202
   },
   "819221": {
    "orna": 0.318,
    "ttp": 0.0185
   },
   "853801": {
    "orna": 0.2087,
    "ttp": 0.0265
   },
   "855774": {
    "orna": 0,
    "ttp": 0.0189
   },
   "857921": {
    "orna": 0.1287,
    "ttp": 0.0239
   },
   "858633": {
    "orna": 0.2124,
    "ttp": 0.0265
   },
   "860018": {
    "orna": 0.1765,
    "ttp": 0.0315
   },
   "866083": {
    "orna": 0.1434,
    "ttp": 0.0258
   },
   "871061": {
    "orna": 0.1287,
    "ttp": 0.0205
   },
   "872903": {
    "orna": 0.0647,
    "ttp": 0.0205
   },
   "872253": {
    "orna": 0.0902,
    "ttp": 0.0189
   },
   "808393": {
    "orna": 0.1457,
    "ttp": 0.0252
   },
   "808512": {
    "orna": 0.137,
    "ttp": 0.0315
   },
   "809624": {
    "orna": 0.1384,
    "ttp": 0.0209
   },
   "800759": {
    "orna": 0.2187,
    "ttp": 0.0537
   },
   "807753": {
    "orna": 0.159,
    "ttp": 0.0185
   },
   "865371": {
    "orna": 0.1507,
    "ttp": 0.0212
   },
   "874604": {
    "orna": 0.3223,
    "ttp": 0.0687
   },
   "874825": {
    "orna": 0.2004,
    "ttp": 0.0242
   },
   "874876": {
    "orna": 0.1875,
    "ttp": 0.0298
   },
   "800376": {
    "orna": 0.1364,
    "ttp": 0.0388
   }
  },
  "lesneDefault": 0.1
 }
};

/** Zdroje parametrov (zobrazujú sa v kapitolách financií). */
export const FIN_SOURCES: { key: string; text: string; url?: string | null; overene: boolean }[] = [
 {
  "key": "nbs_dsti_stres",
  "text": "Opatrenie NBS č. 10/2016 v znení noviel (LTV 90 %, DTI 8 a pokles od 41 r., DSTI 60 % so stresom +2 b. max. 6 %); opatrenie NBS 3/2026 — LTV od 1. 1. 2027",
  "url": "https://nbs.sk/en/financial-stability/fs-instruments/dsti/",
  "overene": true
 },
 {
  "key": "zivotne_minimum_od_2026_07_01",
  "text": "Životné minimum od 1. 7. 2026: 295.22 / 205.96 / 134.8 €",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/2026/155/20260701.html",
  "overene": true
 },
 {
  "key": "kataster_poplatok_vklad",
  "text": "Zákon 145/1995 Z. z. — vklad 50 € elektronicky / 100 € listinne",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/1995/145/20261101.html",
  "overene": true
 },
 {
  "key": "notarska_uschova_odmena",
  "text": "Vyhláška 31/1993 Z. z. (odmena notára za úschovu) — pravdepodobné",
  "url": "https://www.zakonypreludi.sk/zz/1993-31/znenie-20250101",
  "overene": false
 },
 {
  "key": "dan_fo_sadzby_2026",
  "text": "Zákon 595/2003 Z. z. — sadzby 19/25/30/35 %, oslobodenie predaja po 5 rokoch, prenájom 500 €",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/2003/595/20260101.html",
  "overene": true
 },
 {
  "key": "dph_predaj_nehnutelnosti",
  "text": "Zákon 222/2004 Z. z. § 38 — DPH 23 %, oslobodenie stavby po 5 rokoch od kolaudácie",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html",
  "overene": true
 },
 {
  "key": "dan_bonus_urok_33a",
  "text": "§ 33a zákona 595/2003 — bonus 50 % úrokov, max. 1 200 € ročne, 5 rokov, 18–35 rokov",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/2003/595/20260101.html",
  "overene": true
 },
 {
  "key": "sfrb_uver_kupa_bytu",
  "text": "Zákon 150/2013 Z. z. o ŠFRB — podmienky úveru",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/2013/150/20260101.html",
  "overene": false
 },
 {
  "key": "dan_nehnutelnosti_priloha_1",
  "text": "Zákon 582/2004 Z. z. prílohy č. 1 a 2 — hodnota pôdy podľa k.ú. a podľa veľkosti obce",
  "url": "https://static.slov-lex.sk/static/SK/ZZ/2004/582/20260101.html",
  "overene": true
 },
 {
  "key": "odhady",
  "text": "Náklady stavby, poistné, údržba, prípojky, znalec, geodet — trhové odhady 2026 (bez autoritatívneho cenníka)",
  "url": null,
  "overene": false
 }
];
