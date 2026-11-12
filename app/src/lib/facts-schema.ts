// Popisy predpočítaných údajov listu nehnuteľnosti (property_facts). GENEROVANÉ zo schém Mac modulov
// (13_INFOKAT_CLAUDE/49_LIST_NEHNUTELNOSTI/schemas/*.json) skriptom gen_facts_schema.py — ručne neupravovať.
// Keď kľúč v schéme chýba, list ho zobrazí s ľudsky upraveným názvom kľúča (nič sa nestratí).
export type FactField = { label: string; unit?: string | null; kind?: string; note?: string };
export const FACT_SCHEMA: Record<string, Record<string, FactField>> = {
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
      "note": "terén v ťažisku (DMR 5.0)"
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
  "teren": {
    "v_min": {
      "label": "Nadmorská výška – najnižší bod",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0), prevzorkované na 2 m; výšky Bpv"
    },
    "v_avg": {
      "label": "Nadmorská výška – priemer",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0), prevzorkované na 2 m"
    },
    "v_max": {
      "label": "Nadmorská výška – najvyšší bod",
      "unit": "m",
      "kind": "number",
      "note": "ÚGKK DMR 5.0 (1 m, CC BY 4.0), prevzorkované na 2 m"
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
      "note": "TPI 300 m (výška bodu − priemer okolia v kruhu 300 m, mriežka 5 m) + sklon: hrebeň (> +9 m), horná časť svahu (+4…+9 m), svah / rovina (±4 m; rovina pri sklone ≤ 5°), úpätie (−4…−9 m), dolina (< −9 m); prahy pevné pre všetky k.ú."
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
    "mraz": {
      "label": "Mrazová kotlina / inverzná poloha",
      "kind": "bool",
      "note": "áno ak priemerný sklon < 8 %, poloha dolina/úpätie/rovina a TPI300 < −4 m alebo TPI1500 < −40 m (stekanie a hromadenie studeného vzduchu, hmly, neskoré mrazy) — heuristika"
    },
    "odtok": {
      "label": "Priteká na parcelu voda zo svahu nad ňou?",
      "kind": "text",
      "note": "nie / mierne / výrazne; D8 smer odtoku na mriežke 5 m po vyplnení bezodtokových depresií (Priority-Flood+ε). výrazne = sústredený prítok z ≥ 2 ha alebo prítok ≥ 1 ha a ≥ 5× výmera parcely; mierne = prítok ≥ 1000 m² a ≥ 0,5× výmera"
    },
    "odtok_m2": {
      "label": "Plocha svahu nad parcelou, z ktorej voda steká na parcelu",
      "unit": "m²",
      "kind": "number",
      "note": "súčet povodia všetkých buniek mimo parcely, ktoré odtekajú do parcely (mimo SR / za okrajom 1,5 km orezané)"
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
      "note": "5 výšok v 0/25/50/75/100 % dĺžky osi (os = dlhšia strana min. otočeného obdĺžnika cez jeho stred), začína vyšším koncom"
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
  }
};

export const FACT_GROUP_LABEL: Record<string, string> = {
  teren: "Terén", slnko: "Slnko a svetlo", stavby: "Stavby", byty: "Byty a nebytové priestory", pristup: "Prístup z cesty",
  susedia: "Susedné parcely", mapa: "Z katastrálnej mapy", bpej: "Pôda (BPEJ)", vlastnici: "Vlastníci — súhrn",
  osm: "Siete, doprava a vybavenosť (OSM)", obec: "Obec a ľudia", klima: "Klíma", normy: "Stavebné normy lokality",
};
