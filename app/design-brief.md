# TRI LIPY KATASTER CORE — design brief

**Design read** — Interný operátor (analytik / geodet / manažér) pracujúci s katastrálnymi dátami; register musí pôsobiť ako presný pracovný prístroj, nie ako marketingový web. Emočný register: pokojná istota, dôkazná disciplína, žiadny hype.

**Concept spine** — „Kalibrovaný prístroj": každá obrazovka pomenúva zdroj, kvalitu vstupu, čo systém odviedol sám a odporúčaný ďalší krok. Rozhranie ukazuje istotu aj neistotu bez toho, aby neistota vyzerala ako porucha.

**Delivery tier** — `editorial` — funkčný interný nástroj (dashboard + GIS + tabuľky + reporty). Bez cinematic scroll-filmu; motion je len jemný, motivovaný (stavové prechody, hover na mapových prvkoch). `Animation mode: non-animated — interný dátový/GIS nástroj, používateľ zvolil „Čisté nové jadro" pre funkčný dashboard.`

**Locked palette** — kartografická, tmavá:
- ink `#0b0f16` (podklad), surface `#121a24`, surface-2 `#18222f`, line `#253243`
- fg `#e7edf4`, muted `#93a1b4`
- brand (s>surveyor green) `#4fa77b` / soft `#6fc79a`
- stavy: ready `#4fa77b`, warning `#e0a83e`, blocked `#d76a60`, review `#5b8def`, derived `#93a1b4`
Obrana: tlmená lesná zeleň (nie neón) na modro-bridlicovom podklade — geodetický/mapový register; nie je to žiadna zo zakázaných palettových rodín (žiadny near-black+neón, žiadny AI-fialový glow, žiadny amber-ember akcent — amber je len stavová farba).

**Locked type** — systémový sans stack (ui-sans-serif / Inter-like) pre text; tabuľkové čísla a katastrálne kódy v ui-monospace s letter-spacing. Bez servisu — funkčný register.

**Section plan (Mission Control)** — release readiness pás → KPI riadok → dataset readiness karty → aktívne warnings → rýchle akcie → audit stopa. Žiadne dva susedné bloky rovnakej layout rodiny.

**Asset plan** — generovaný monogram „△" (tri lipy / three lindens) ako logo + favicon; launch cover 3:2 v kartografickom štýle. Mapové dlaždice sú reálne ZBGIS ortofoto WMS (CC BY 4.0), nie generované.

**CTA inventory** — „Otvoriť dataset" (primárny, plná brand výplň), „Spustiť readiness re-check" (outline), „Generovať report" (brand-soft), „Prepnúť rolu" (ghost v top bare). Každé CTA má vlastnú identitu, žiadna zdieľaná tlačidlová utilita.

**Hranice (produktové)** — žiadne právne/geodetické/územnoplánovacie závery, žiadny automatický outreach, owner-sensitive dáta rolovo chránené, raw dáta read-only. Dáta v deme sú SYNTETICKÉ/sanitizované.
