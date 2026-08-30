// Právny referent — kurátorovaná referencia k slovenskému katastru.
// Zdroj: platné predpisy (katastrálny zákon 162/1995 Z.z., vyhl. 461/2009, Občiansky
// zákonník 40/1964, z. 180/1995, 330/1991, 220/2004, NV 58/2013, z. 215/1995) a usmernenia
// ÚGKK/KGK. Ide o interný informatívny podklad, NIE o právne poradenstvo ani úradný výklad.

export interface LegalCite {
  law: string;   // napr. "162/1995 Z.z." (katastrálny zákon)
  par?: string;  // napr. "§ 28–31" alebo "Príloha č. 1"
}

export interface LegalEntry {
  id: string;
  term: string;
  category: string;
  refs: LegalCite[];
  summary: string;
}

export const LEGAL_CATEGORIES = [
  "Zápisy do katastra",
  "Vlastníctvo a podiely",
  "Registre a stav pozemkov",
  "Ochrana pôdy a odňatie",
  "Kataster a geodézia",
] as const;

export const LEGAL: LegalEntry[] = [
  // ——— Zápisy do katastra ———
  {
    id: "vklad", term: "Vklad", category: "Zápisy do katastra",
    refs: [{ law: "162/1995 Z.z.", par: "§ 28–31" }],
    summary:
      "Vklad je zápis, ktorým vzniká, mení sa alebo zaniká právo k nehnuteľnosti (kúpa, darovanie, zámena…). Katastrálny odbor o návrhu rozhoduje v konaní o povolení vkladu; právne účinky nastávajú dňom právoplatnosti rozhodnutia o povolení vkladu (konštitutívny účinok).",
  },
  {
    id: "zaznam", term: "Záznam", category: "Zápisy do katastra",
    refs: [{ law: "162/1995 Z.z.", par: "§ 34–35" }],
    summary:
      "Záznamom sa zapisujú práva, ktoré vznikli, zmenili sa alebo zanikli zo zákona, rozhodnutím súdu alebo štátneho orgánu a pod. Záznam nemá vplyv na vznik práva — iba ho eviduje (deklaratórny účinok).",
  },
  {
    id: "poznamka", term: "Poznámka", category: "Zápisy do katastra",
    refs: [{ law: "162/1995 Z.z.", par: "§ 38–39" }],
    summary:
      "Poznámka vyjadruje skutočnosti alebo právny pomer týkajúci sa nehnuteľnosti či osoby (začaté exekučné/konkurzné konanie, predbežné opatrenie, spochybnenie hodnovernosti údajov). Nemá vplyv na vznik ani zmenu práva, len naň upozorňuje.",
  },
  {
    id: "plomba", term: "Plomba", category: "Zápisy do katastra",
    refs: [{ law: "162/1995 Z.z.", par: "§ 44a" }],
    summary:
      "Plomba o zmene práva sa vyznačí na liste vlastníctva, keď sa začne konanie o zmene práva (doručený návrh na vklad, verejná listina na záznam). Signalizuje, že prebieha zmena — údaje LV nemusia byť momentálne aktuálne.",
  },
  {
    id: "list_vlastnictva", term: "List vlastníctva (LV)", category: "Zápisy do katastra",
    refs: [{ law: "162/1995 Z.z." }, { law: "461/2009 Z.z." }],
    summary:
      "Verejná listina preukazujúca vlastníctvo. Časť A = majetková podstata (parcely, stavby), časť B = vlastníci a iné oprávnené osoby (spoluvlastnícke podiely, tituly nadobudnutia), časť C = ťarchy.",
  },
  // ——— Vlastníctvo a podiely ———
  {
    id: "spoluvlastnicky_podiel", term: "Spoluvlastnícky podiel", category: "Vlastníctvo a podiely",
    refs: [{ law: "40/1964 Zb. (OZ)", par: "§ 137–142" }],
    summary:
      "Podiel vyjadruje mieru, akou sa spoluvlastníci podieľajú na právach a povinnostiach k spoločnej veci. O hospodárení rozhodujú podľa veľkosti podielov.",
  },
  {
    id: "predkupne", term: "Predkupné právo spoluvlastníkov", category: "Vlastníctvo a podiely",
    refs: [{ law: "40/1964 Zb. (OZ)", par: "§ 140" }],
    summary:
      "Ak sa prevádza spoluvlastnícky podiel, ostatní podieloví spoluvlastníci majú predkupné právo (neplatí pri prevode blízkej osobe). Dôležité pri odkupovaní podielov.",
  },
  {
    id: "bsm", term: "Bezpodielové spoluvlastníctvo manželov (BSM)", category: "Vlastníctvo a podiely",
    refs: [{ law: "40/1964 Zb. (OZ)", par: "§ 143–151" }],
    summary:
      "Majetok nadobudnutý počas manželstva (okrem darov, dedičstva a vecí osobnej potreby) patrí obom manželom spoločne a nerozdielne.",
  },
  {
    id: "tarcha", term: "Ťarcha (záložné právo, vecné bremeno)", category: "Vlastníctvo a podiely",
    refs: [{ law: "40/1964 Zb. (OZ)", par: "§ 151a–151me, § 151n–151p" }],
    summary:
      "Ťarcha zaťažuje nehnuteľnosť — najmä záložné právo (zabezpečuje pohľadávku) alebo vecné bremeno (právo užívania, napr. právo prechodu). Zapisuje sa do časti C listu vlastníctva.",
  },
  // ——— Registre a stav pozemkov ———
  {
    id: "register_c", term: "Register C (C-KN)", category: "Registre a stav pozemkov",
    refs: [{ law: "162/1995 Z.z." }],
    summary:
      "Parcely registra C zodpovedajú súčasnej katastrálnej mape (reálne hranice v teréne). Ak je parcela C vysporiadaná, vlastníctvo je priamo na jej liste vlastníctva.",
  },
  {
    id: "register_e", term: "Register E (E-KN)", category: "Registre a stav pozemkov",
    refs: [{ law: "162/1995 Z.z." }, { law: "180/1995 Z.z." }],
    summary:
      "Parcely registra E sú pozemky pôvodného/pozemkovoknižného stavu, ktoré neboli preklopené do registra C. Nesú vlastníctvo prekrývajúce sa s parcelami C — cez ne sa dohľadáva vlastník nevysporiadanej parcely C.",
  },
  {
    id: "evidencny_list", term: "Evidenčný list", category: "Registre a stav pozemkov",
    refs: [{ law: "180/1995 Z.z." }],
    summary:
      "Na rozdiel od LV zobrazuje historického užívateľa parciel (nie vlastníka), zoskupených do celku. Súvisí s usporiadaním vlastníctva k pozemkom a s registrom obnovenej evidencie pozemkov (ROEP).",
  },
  {
    id: "usporiadanie_vlastnictva", term: "Usporiadanie vlastníctva k pozemkom (ROEP)", category: "Registre a stav pozemkov",
    refs: [{ law: "180/1995 Z.z." }],
    summary:
      "Register obnovenej evidencie pozemkov dopĺňa a spresňuje evidenciu vlastníckych vzťahov, najmä pri nevysporiadaných pozemkoch, kde vlastníctvo nesie register E.",
  },
  {
    id: "pozemkove_upravy", term: "Pozemkové úpravy", category: "Registre a stav pozemkov",
    refs: [{ law: "330/1991 Zb." }],
    summary:
      "Racionálne priestorové usporiadanie pozemkov (sceľovanie, vyrovnanie hraníc, sprístupnenie) vo verejnom záujme; výsledkom je nové usporiadanie vlastníckych a užívacích vzťahov.",
  },
  // ——— Ochrana pôdy a odňatie ———
  {
    id: "bpej", term: "BPEJ — bonitovaná pôdno-ekologická jednotka", category: "Ochrana pôdy a odňatie",
    refs: [{ law: "220/2004 Z.z.", par: "Príloha č. 3" }],
    summary:
      "Sedemciferný kód vyjadrujúci kvalitu a produkčný potenciál poľnohospodárskej pôdy. Podľa kódu sa pôda zaraďuje do 9 skupín kvality (1 = najkvalitnejšia, 9 = najmenej produkčná).",
  },
  {
    id: "odnatie", term: "Odňatie poľnohospodárskej pôdy", category: "Ochrana pôdy a odňatie",
    refs: [{ law: "220/2004 Z.z.", par: "§ 17" }],
    summary:
      "Trvalé alebo dočasné použitie poľnohospodárskej pôdy na nepoľnohospodársky účel (napr. stavba). Vyžaduje rozhodnutie orgánu ochrany pôdy a je spojené s odvodom.",
  },
  {
    id: "odvody", term: "Odvody za odňatie", category: "Ochrana pôdy a odňatie",
    refs: [{ law: "58/2013 Z.z.", par: "Príloha č. 1" }],
    summary:
      "Sadzby odvodu (€/m²) podľa skupiny kvality BPEJ — trvalé odňatie jednorazovo, dočasné za každý aj začatý rok (1/100 sadzby trvalého). Skupina 1: 20 €/m², 2: 15, 3: 10, 4: 7, 5: 4, 6: 2, 7: 1, 8: 0,7, 9: 0,5 €/m².",
  },
  // ——— Kataster a geodézia ———
  {
    id: "katastralny_zakon", term: "Katastrálny zákon", category: "Kataster a geodézia",
    refs: [{ law: "162/1995 Z.z." }, { law: "461/2009 Z.z." }],
    summary:
      "Základný predpis o katastri nehnuteľností — vymedzuje obsah katastra, listy vlastníctva, zápisy práv (vklad, záznam, poznámka) a poskytovanie údajov. Vykonáva ho vyhláška 461/2009 Z.z.",
  },
  {
    id: "geodezia", term: "Geodézia a kartografia (S-JTSK)", category: "Kataster a geodézia",
    refs: [{ law: "215/1995 Z.z." }],
    summary:
      "Zákon upravuje geodetické a kartografické činnosti, geodetické systémy (S-JTSK / EPSG:5514) a autorizované overovanie — základ pre presné priestorové umiestnenie parciel.",
  },
];

export function legalById(id: string): LegalEntry | undefined {
  return LEGAL.find((e) => e.id === id);
}

export function citeLabel(c: LegalCite): string {
  return c.par ? `${c.par}, z. ${c.law}` : `z. ${c.law}`;
}
