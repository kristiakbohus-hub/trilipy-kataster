# ZADANIE: verejný web na predaj listu nehnuteľnosti

**Stav:** zadanie na implementáciu · **Dátum:** 13. 11. 2026 · **Zadávateľ:** Ing. Bohuš Krištiak, TRI LIPY, s.r.o.
**Pre:** Claude Code v repe `trilipy-kataster` (`app/`, TanStack Start + Cloudflare D1)
**Podklady:** dokument „List nehnuteľnosti ako produkt – monetizácia“ (Claude Docs), PR #1 (anonymizácia cien zo zmlúv)

> **Predpoklad:** PR #1 (`anonymne-ceny-klient`) musí byť zlúčený skôr. Klient nesmie nikdy dostať cenu
> konkrétnej zmluvy (pozri časť 7).

---

## 1. Cieľ

Verejný web, cez ktorý si kupujúci, predávajúci alebo maklér:

1. zadá nehnuteľnosť (parcelu, LV, adresu alebo bod na mape),
2. **zadarmo** dostane teaser (1 strana: semafor + 3 hlavné zistenia),
3. **zaplatí** za balík listu (29 / 49 / 79 / 149 €) alebo doplnok (siete, obhliadka, EN verzia),
4. dostane odkaz `/n/<token>` a PDF e-mailom; pri balíku „S geodetom“ až po kontrole geodetom.

Makléri a firmy si kúpia mesačný balík (B2B) a listy generujú sami, so svojím logom.

Web je **predajná vrstva nad existujúcim listom**. List sa neprepisuje, len sa obmedzí výberom kapitol
(`hide`) a variantom (`teaser`), ktoré appka už má.

---

## 2. Cenník (zdroj pravdy pre web)

Ceny sú konečné. **Pred spustením treba overiť, či je TRI LIPY platiteľ DPH**. Ak áno, ceny sú s DPH
a na faktúre musí byť rozpis. Ceny drž v jednom konfiguračnom súbore (`app/src/lib/pricing.ts`), nie natvrdo v komponentoch.

### 2.1 Balíky pre kupujúcich (B2C)

| Kód | Názov | Cena | Dodanie | Pre koho |
| --- | --- | --- | --- | --- |
| `teaser` | Teaser | 0 € | hneď | každý, výmenou za e-mail |
| `pozemok` | Preverenie pozemku | 29 € | hneď | pozemok bez stavby |
| `dom` | Preverenie domu alebo bytu | 49 € | hneď | dom, byt, chata so súpisným číslom |
| `kompletny` | Kompletný list | 79 € | hneď | kto chce vedieť aj hodnotu, hypotéku a náklady |
| `geodet` | List s geodetom | 149 € | do 3 pracovných dní | **odporúčaný** pre pozemky, chaty, lazy, register E |
| `obhliadka` | List + obhliadka v teréne | od 290 € | do 7 pracovných dní | len Kysuce a Žilina (okresy CA, KM, ZA) — objednávka ako dopyt, nie platba vopred |

Balíky `pozemok` a `dom` sa **nevyberajú ručne**: po zadaní nehnuteľnosti appka podľa `core.kind`
ponúkne správny základný balík. Klient tak vyberá len z troch: **základný (29 alebo 49 €) · Kompletný (79 €) · S geodetom (149 €)**.

**Zavádzacie ceny do 31. 1. 2027:** `pozemok` 19 €, `dom` 35 €. Ostatné bez zľavy.

### 2.2 Doplnky

| Kód | Doplnok | Cena |
| --- | --- | --- |
| `en` | Anglická verzia | +15 € (v balíku `geodet` zadarmo) |
| `porovnanie` | Porovnanie 3 nehnuteľností vedľa seba | 59 € |
| `ziadosti` | Žiadosti správcom sietí a obci pripravené na podpis (klient podá sám) | 39 € |
| `siete` | **Siete komplet** (podáme, urgujeme, zakreslíme, vysvetlíme — časť 4) | 189 € samostatne / +149 € k listu `dom` alebo `kompletny` |
| `geodet_siete` | List s geodetom + Siete komplet | 279 € (namiesto 338 €) |
| `upgrade` | Prechod na vyšší balík do 30 dní | rozdiel cien |

### 2.3 Započítanie

Ak klient do 60 dní od nákupu objedná u TRI LIPY GP, vytýčenie, vysporiadanie, projekt prípojky alebo
predaj, cena listu aj sietí sa mu odpočíta. Na webe to treba zobraziť pri každom balíku a v PDF na
poslednej strane, vrátane kódu objednávky. V administrácii stačí ručne označiť objednávku ako „započítaná“.

### 2.4 Makléri a firmy (B2B)

| Kód | Balík | Cena mesačne | Obsah |
| --- | --- | --- | --- |
| `b2b_start` | Maklér Štart | 49 € | 5 kompletných listov, logo a meno makléra v päte, QR, výber kapitol |
| `b2b_profi` | Maklér Profi | 129 € | 20 listov, porovnanie, EN verzia, obhliadka v mobile |
| `b2b_kancelaria` | Kancelária | 299 € | 60 listov, 5 účtov, vlastná značka (white-label), kontrola geodetom za 49 € namiesto 70 € |
| `b2b_developer` | Developer a investor | individuálne, od 490 € za projekt | dávkové listy, potenciál rozparcelovania, bez osobných údajov |
| `partner` | Partner (notár, advokát, hypo maklér) | 0 € | kód: klient má 15 % zľavu, partner 15 % provízie |

List nad rámec balíka stojí 9 €. Ročná platba znamená 2 mesiace zadarmo. Nevyčerpané listy sa neprenášajú.

---

## 3. Obsah balíkov (mapovanie na kapitoly listu)

Všetky balíky sú **ten istý `PropertySheet` v `mode="client"`**. Balík určí zoznam skrytých kapitol (`hide`).
ID kapitol sú z `components/property-sheet.tsx` (`nav`).

| Kapitola (ID) | teaser | pozemok | dom | kompletny | geodet |
| --- | --- | --- | --- | --- | --- |
| Semafor + 3 hlavné zistenia (titulka) | áno | áno | áno | áno | áno |
| `prehlad`, `skladba` | stručne | áno | áno | áno | áno |
| `vlastnictvo` (počet a podiely, bez mien) | — | áno | áno | áno | áno |
| `pravo` (ťarchy, VB, záložné, exekúcie, predkupné, skóre) | — | áno | áno | áno | áno |
| `pristup` (cesta, susedné parcely) | — | áno | áno | áno | áno |
| `up` (zóna, regulatívy, zastavateľnosť, uzávera) | len zóna | áno | áno | áno | áno |
| `limity` (51 registrov, ochranné pásma) | — | áno | áno | áno | áno |
| `teren`, `klima` | — | áno | áno | áno | áno |
| `siete`, `doprava` | — | áno | áno | áno | áno |
| `historia`, `postup`, `overit` | — | áno | áno | áno | áno |
| `udaje` (od predávajúceho), `povolenia` | — | — | áno | áno | áno |
| stavba a byt v `skladba` (s.č., kolaudácia, EC, fond opráv) | — | — | áno | áno | áno |
| `hodnota` (anonymné predaje, odhad, rozpätie) | — | — | — | áno | áno |
| `predikcia`, `trh`, `investicia` | — | — | — | áno | áno |
| `financovanie`, `naklady`, `poistenie` | — | — | — | áno | áno |
| `rozhodnutie`, `obec` | — | — | — | áno | áno |
| `zdroje` | áno | áno | áno | áno | áno |
| Komentár Ing. geodeta (nový blok na titulke + v `overit`) | — | — | — | — | áno |
| Anglická verzia | — | +15 € | +15 € | +15 € | áno |

**Kapitola `hodnota` je hlavná páka** na prechod z 49 na 79 €. V nižších balíkoch ju na webe ukáž ako
zamknutú („Odhad hodnoty z predajov v okolí — v balíku Kompletný“).

Implementácia: `app/src/lib/pricing.ts` exportuje `PACKAGES: Record<Code, { price, hide: string[], variant?, lang? }>`.
Snímka listu sa uloží cez existujúci `sanitizeShareSnapshot` (hide, variant, lang už podporuje).

---

## 4. Siete komplet (služba, nie report)

| Krok | Výstup pre klienta |
| --- | --- |
| 1. Správcovia v lokalite | zoznam: elektrina, plyn, voda a kanalizácia, telekomunikácie (aj menší operátori), obec (VO, rozhlas, obecná kanalizácia), cesta, železnica, správca toku |
| 2. Žiadosti | podanie žiadostí o vyjadrenie k existencii sietí na základe splnomocnenia a úhrada poplatkov |
| 3. Sledovanie | stav každej žiadosti, urgencie (využiť existujúcu evidenciu `property_requests`, migrácia 0113) |
| 4. Zákres | všetky siete v jednej mape nad katastrom vrátane ochranných pásiem |
| 5. Súhrn od geodeta | čo vedie cez pozemok, kde a za akých podmienok pripojenie, čo obmedzuje umiestnenie domu, odporúčania |
| 6. Dokumenty | originály vyjadrení v PDF s dátumom platnosti |

V cene **nie je:** žiadosť o pripojenie, vytýčenie v teréne ani projekt prípojky (nadväzujúce zákazky, započítanie podľa 2.3).
Dodanie 15 až 30 dní. Poplatky správcov sú v cene do 40 €, vyššie sa doúčtujú podľa skutočnosti.

Na webe potrebuje: krok „Splnomocnenie“ v objednávke (meno, adresa, podpis cez slovensko.sk alebo
naskenovaný podpis), stav objednávky viditeľný pre klienta na `/objednavka/<kod>`.

---

## 5. Stránky webu

Všetky verejné stránky pridať do verejných ciest v `__root.tsx` (Gate), rovnako ako `/metodika`.
Dizajn: značka TRI LIPY (`/tl-logo.png`), rovnaké tokeny ako list. Mobil prvý: väčšina návštev príde z FB/IG a z QR kódov.

| Cesta | Obsah |
| --- | --- |
| `/preverenie` (hlavná landing) | Hlavný text: „Preverte pozemok alebo dom pred kúpou. Výsledok hneď, z 51 úradných registrov.“ Pod ním vyhľadávanie (parcela, LV, adresa, mapa). Tri balíky, odkaz na ukážku, sekcia „Prečo s geodetom“, započítanie, FAQ, odkaz na `/metodika`. |
| `/preverenie/ukazka` | vzorový list na anonymnej nehnuteľnosti (statická snímka), aby klient videl, čo kupuje |
| `/preverenie/vysledok?…` | teaser zadarmo po zadaní e-mailu, pod ním výber balíka s cenou podľa `core.kind` |
| `/preverenie/objednavka` | súhrn, doplnky, fakturačné údaje (FO alebo firma s IČO), súhlasy (časť 7), platba |
| `/objednavka/<kod>` | stav objednávky (zaplatená, generuje sa, čaká na geodeta, hotovo), odkaz na list, PDF, upgrade |
| `/siete` | landing pre Siete komplet so samostatnou objednávkou |
| `/pre-maklerov` | B2B balíky, ukážka listu s logom RK, formulár na demo |
| `/partneri` | program pre notárov, advokátov a hypo maklérov |
| `/obchodne-podmienky`, `/reklamacny-poriadok`, `/ochrana-osobnych-udajov` | texty dodá advokát. Do vtedy zobraziť placeholder a **nepúšťať platby** (feature flag). |
| `/metodika` | existuje, len prelinkovať |

### FAQ (minimum)

- Je to úradný výpis alebo znalecký posudok? **Nie.** (časť 7)
- Odkiaľ sú údaje? (kataster, registre, dátum stavu pri každej kapitole)
- Čo keď údaj chýba? „Neoverené“ nikdy neznamená „v poriadku“.
- Prečo nevidím ceny konkrétnych predajov? Údaj o cene poskytuje kataster len vlastníkovi a vymedzeným osobám. Ukazujeme len anonymnú štatistiku.
- Ako funguje započítanie?
- Pokrytie: list funguje len pre naimportované k.ú. **Pri nepokrytej nehnuteľnosti sa platba nesmie dať spustiť**, iba „Dajte mi vedieť, keď bude dostupné“ (zber e-mailov).

---

## 6. Objednávka a technika

### 6.1 Tok

```
zadanie nehnuteľnosti → kontrola pokrytia → teaser (e-mail) → výber balíka + doplnky
  → fakturačné údaje + súhlasy → platba → webhook „zaplatené“
  → automatické balíky: vytvoriť share (existujúce createPropertyShare / buildClientShare s hide podľa balíka) → e-mail s odkazom + PDF
  → balík geodet / siete / obhliadka: úloha v internej appke („Zadania“), stav „čaká na geodeta“ → po schválení e-mail
```

### 6.2 Dáta (nová migrácia `0114_orders.sql`)

- `orders`: `id`, `code` (krátky verejný kód), `email`, `billing_json`, `package`, `addons_json`, `price_eur`, `discount_code`,
  `dataset_id`, `kind`, `ref`, `share_token`, `status` (`new`/`paid`/`generating`/`waiting_geodet`/`done`/`refunded`/`cancelled`),
  `payment_provider`, `payment_ref`, `invoice_no`, `consent_json` (čo odsúhlasil a kedy), `credited_at` (započítanie), `created_at`, `paid_at`, `done_at`
- `b2b_accounts`: `id`, `firma`, `ico`, `plan`, `quota_month`, `used_month`, `period_start`, `logo_url`, `users_json`, `status`
- `leads` (teaser bez nákupu, čakanie na pokrytie): `email`, `ref`, `source`, `consent_marketing`, `created_at`

Osobné údaje kupujúceho (e-mail, fakturácia) sú len pre objednávku. Marketing iba so samostatným, nepredvyplneným súhlasom.

### 6.3 Platby

Rozhodne zadávateľ: **TatraPay+ alebo GoPay alebo Stripe** (overiť poplatky a podporu Apple/Google Pay).
Parcelník používa TatraPay+. Implementovať za rozhraním `PaymentProvider` (create, webhook, refund), aby sa dal vymeniť.
Faktúry: číselný rad TRI LIPY. Napojenie na účtovníctvo (Andrea Biriczová) dohodnúť, minimálne export CSV.

### 6.4 Bezpečnosť a výkon

- Verejné endpointy (vyhľadávanie, teaser) obmedziť rate limitom na IP a e-mail, aby sa cez ne nedal hromadne sťahovať kataster.
  Toto je aj právna požiadavka (časť 7).
- Teaser na rovnakú nehnuteľnosť cachovať 24 h.
- Žiadny verejný endpoint nesmie vrátiť mená vlastníkov, `prices`, presné `comparables` ani interné vrstvy.
  Pridať test, ktorý to kontroluje na odpovedi teaseru aj platenej snímky.
- `authz-guard` a `phrase-guard` musia prejsť. Nové texty webu nesmú obsahovať sľuby („garantujeme“, „bez rizika“ a pod.).

---

## 7. Právne mantinely (záväzné)

1. **Nie je to úradný výpis ani znalecký posudok.** Na webe, na titulke PDF aj vo VOP. Nepoužívať slová
   „posudok“, „ocenenie“ ani „všeobecná hodnota“. Správne je „orientačný odhad z predajov, nie znalecký posudok“.
2. **Ceny zo zmlúv len anonymne** (PR #1, `lib/price-anon.ts`): medián, rozpätie a počet až od 5 predajov.
   Nikdy cena, dátum, parcela ani k.ú. konkrétnej zmluvy.
3. **Žiadne osobné údaje vlastníkov** (mená, roky narodenia, adresy, „pravdepodobne zosnulý“, pravdepodobnosť predaja, kupci).
   Platí aj pre B2B. Tieto vrstvy ostávajú len interne pre TRI LIPY.
4. **Súhlasy pri objednávke** (`consent_json`): VOP, ochrana osobných údajov a pri digitálnom obsahu výslovný súhlas so začatím
   dodania pred uplynutím lehoty na odstúpenie a vzatie na vedomie straty práva odstúpiť. Marketing ako samostatný, nepredvyplnený súhlas.
5. **Atribúcia zdrojov** (CC BY 4.0 ÚGKK, OSM ODbL a ďalšie) ostáva v kapitole `zdroje`.
6. **Platby zapnúť až po** VOP a ochrane osobných údajov od advokáta a po overení právneho základu tabuľky `lv_prices` (feature flag `PAYMENTS_ENABLED`).
7. **Zodpovednosť:** v PDF dátum stavu a odtlačok (hash) už sú. Vo VOP obmedziť zodpovednosť na cenu objednávky.

---

## 8. Etapy

| Etapa | Rozsah | Hotovo, keď |
| --- | --- | --- |
| E1 | `pricing.ts`, `/preverenie`, `/preverenie/ukazka`, teaser za e-mail, kontrola pokrytia, `leads` | teaser funguje verejne, test „žiadne mená a ceny zmlúv“ prechádza |
| E2 | objednávka, `orders`, platobná brána za flagom, e-maily, `/objednavka/<kod>`, faktúra | testovacia platba vytvorí share s `hide` podľa balíka a pošle e-mail |
| E3 | balík geodet (úloha v internej appke, komentár geodeta v liste), Siete komplet so splnomocnením, obhliadka ako dopyt | geodet vie schváliť list a klient dostane e-mail |
| E4 | B2B účty, kvóty, logo, partnerské kódy, `/pre-maklerov`, `/partneri` | maklér si vygeneruje list so svojím logom a kvóta sa odpočíta |
| E5 | analytika (návšteva → teaser → platba), A/B test ceny základného balíka, SEO články | dashboard konverzií |

---

## 9. Otvorené otázky pre zadávateľa

- [ ] Je TRI LIPY platiteľ DPH? Ovplyvní ceny a faktúry.
- [ ] Platobná brána: TatraPay+ / GoPay / Stripe?
- [ ] Doména: `preverenie.3lipy.sk`, `list.3lipy.sk`, alebo samostatná značka?
- [ ] Ktoré k.ú. budú pokryté pri spustení (minimálne okresy Čadca a KNM)?
- [ ] Kto okrem Ing. Krištiaka bude robiť kontrolu geodetom (Ing. Matej Byrtus)? Aká je kapacita listov týždenne?
- [ ] Právny základ tabuľky `lv_prices` (SPI CEN/CAS) a texty VOP a GDPR od advokáta.
