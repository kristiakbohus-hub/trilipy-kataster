// Úradné registre pre list nehnuteľnosti — GENEROVANÉ z 49_LIST_NEHNUTELNOSTI/zdroje/registry.json skriptom
// gen_ext_sources.py (overené živými testami 2026-11-12). Ručne neupravovať. Šablóny: {lat} {lon} a bbox
// {lon_min} {lat_min} {lon_max} {lat_max} = bod ± 50 m. Len bezplatné zdroje bez účtu; uvádzať poskytovateľa.
export type ExtDef = {
  key: string; label: string; category: string; provider: string;
  method: "arcgis_query" | "arcgis_identify" | "wms_getfeatureinfo" | "wfs" | "json_api";
  url: string; params: Record<string, string>; fields: Record<string, string>; valueMap: Record<string, string>;
  risk: boolean; special: string | null;
};
export const EXT_DEFS: ExtDef[] = [
 {
  "key": "geo_gm50",
  "label": "Geologická mapa SR 1:50 000 – horninový podklad",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/GM50/MapServer/2/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "popis,utv,vek1,vek2,vek3,it,it1,idsrf",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "popis": "Popis horniny/sedimentu",
   "utv": "Útvar (kvartér, paleogén…)",
   "vek1": "Vek (oddelenie)",
   "vek2": "Vek (podrobne)",
   "it1": "Index v legende"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_kvarter_typ",
  "label": "Kvartérny pokryv – typ sedimentov (1:1 000 000)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Atlas krajiny SR)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/wgs_atlasy/kvarternyPokryvSR_1000_wgs/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "s,ts",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "s": "Genetický typ kvartérnych sedimentov",
   "ts": "Popis sedimentov"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_kvarter_hrubka",
  "label": "Hrúbka kvartérneho pokryvu (1:500 000)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/wgs_geologickeMapy/mapaHrubkyKvarternehoPokryvuSR_500_wgs/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "hrubka",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "hrubka": "Hrúbka kvartérneho pokryvu (m, interval)"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_ig_rajony",
  "label": "Inžinierskogeologická rajonizácia 1:50 000",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/IGR50/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "rajon_symb,rajon_nazo,formacia_n",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "rajon_symb": "Symbol rajónu",
   "rajon_nazo": "Inžinierskogeologický rajón",
   "formacia_n": "Formácia"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_hydrogeologia_200",
  "label": "Hydrogeologická mapa 1:200 000 – zvodnenec a produktivita",
  "category": "Vrty a podzemná voda",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/HG200/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "aqtyc,typ_zvodnen2,sk_litogeoch,sed_prostredie,sk_popis",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "aqtyc": "Trieda produktivity zvodnenca (Ia–IIIb)",
   "typ_zvodnen2": "Produktivita zvodnenca (text)",
   "sk_litogeoch": "Hornina kolektora",
   "sk_popis": "Popis (priepustnosť, hladina, spojitosť s tokom)"
  },
  "valueMap": {
   "Ib": "lokálne vysoko alebo rozsiahle stredne produktívne zvodnence (medzizrnové)",
   "IIIa": "menšie zvodnence s obmedzenými množstvami miestneho významu",
   "_pozn": "ostatné triedy čítať z typ_zvodnen2 (text je v odpovedi)"
  },
  "risk": false,
  "special": null
 },
 {
  "key": "geo_hydrogeologia_50",
  "label": "Základná hydrogeologická mapa 1:50 000 – vrchný kolektor",
  "category": "Vrty a podzemná voda",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/HG50/MapServer/3/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "hg_index,nazov,vek,typ_priepustnosti,hg_funkcia,t_kat,t_var_id",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "nazov": "Kolektor",
   "typ_priepustnosti": "Typ priepustnosti",
   "hg_funkcia": "Funkcia (kolektor/izolátor)",
   "t_kat": "Transmisivita T (m²/s)",
   "t_var_id": "Variabilita / storativita"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_hladina_podzemnej_vody",
  "label": "Hĺbka hladiny podzemnej vody pod terénom (GIB-GES grid)",
  "category": "Vrty a podzemná voda",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_identify",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/UHPV/MapServer/identify",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "sr": "4326",
   "layers": "all:0",
   "tolerance": "1",
   "mapExtent": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "imageDisplay": "400,400,96",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "Pixel Value": "Hĺbka hladiny podzemnej vody pod terénom (m)"
  },
  "valueMap": {},
  "risk": false,
  "special": "pixel_m"
 },
 {
  "key": "geo_kvalita_podzemnej_vody",
  "label": "Kvalita podzemných vôd (hydrogeochemická mapa 1:50 000)",
  "category": "Vrty a podzemná voda",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/HGCH50/MapServer/4/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "kvalita_trieda,kvalita_popis",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "kvalita_trieda": "Trieda kvality (A–…)",
   "kvalita_popis": "Prekročené ukazovatele"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_radon",
  "label": "Radónové riziko z podložia (prognózna mapa)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/RADON/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "layer",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "layer": "Kategória radónového rizika"
  },
  "valueMap": {
   "nízke": "nízke riziko",
   "stredné": "stredné riziko – odporúča sa protiradónová izolácia",
   "vysoké": "vysoké riziko – nutné opatrenia + meranie"
  },
  "risk": true,
  "special": null
 },
 {
  "key": "geo_prirodna_radioaktivita",
  "label": "Prírodná rádioaktivita hornín (letecká gama spektrometria)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_identify",
  "url": "https://ags.geology.sk/arcgis/rest/services/GeofyzikalneMapy/PrirodnaRadioaktivita/MapServer/identify",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "sr": "4326",
   "layers": "all:7,8,9,10,11",
   "tolerance": "1",
   "mapExtent": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "imageDisplay": "400,400,96",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "7": "Draslík K (%)",
   "8": "Ekvivalentný urán eU (ppm)",
   "9": "Ekvivalentné tórium eTh (ppm)",
   "10": "Celková prírodná rádioaktivita (Ur, ppm eU)",
   "11": "Dávkový príkon gama vo vzduchu (nGy/h)"
  },
  "valueMap": {},
  "risk": false,
  "special": "layers"
 },
 {
  "key": "geo_vrty_hydrogeologicke",
  "label": "Register hydrogeologických vrtov (Geofond) – okolie 500 m",
  "category": "Vrty a podzemná voda",
  "provider": "ŠGÚDŠ Geofond",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/VRTY/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "evidencnecislovrtupomocne,lokalita,hlbkavrtu,suradnicazteren,typvrtupopis,hydrorajon,archivnecislospravy,pdf",
   "returnGeometry": "false",
   "f": "json",
   "distance": "500",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "hlbkavrtu": "Hĺbka vrtu (m)",
   "suradnicazteren": "Kóta terénu (m n. m.)",
   "typvrtupopis": "Typ vrtu",
   "hydrorajon": "Hydrogeologický rajón",
   "pdf": "Záznamový list (PDF)",
   "archivnecislospravy": "Archívne číslo správy"
  },
  "valueMap": {},
  "risk": false,
  "special": "vrty"
 },
 {
  "key": "geo_vrty_ostatne",
  "label": "Register ostatných vrtov (IG prieskum) – hladina vody, hĺbka – okolie 500 m",
  "category": "Vrty a podzemná voda",
  "provider": "ŠGÚDŠ Geofond",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/VRTY/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "oznacenievrtuvsprave,druhdiela,ucelvrtuskupina,ucelvrtu,hlbkadiela,surad_z,vodanarazena,vodaustalena,archivnecislo",
   "returnGeometry": "false",
   "f": "json",
   "distance": "500",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "hlbkadiela": "Hĺbka diela (m)",
   "vodanarazena": "Hladina narazená (m p. t.)",
   "vodaustalena": "Hladina ustálená (m p. t.)",
   "ucelvrtuskupina": "Účel (inžinierskogeologický, ŽP…)",
   "archivnecislo": "Archívne číslo správy"
  },
  "valueMap": {},
  "risk": false,
  "special": "vrty"
 },
 {
  "key": "geo_chlu",
  "label": "Chránené ložiskové územie (CHLÚ) – do 1 km",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Register ložísk)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/LOZISKA/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "loz_naz,sur_id_,org_naz,loz_naz_ch",
   "returnGeometry": "false",
   "f": "json",
   "distance": "1000",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "loz_naz": "Názov ložiska",
   "sur_id_": "Druh suroviny",
   "org_naz": "Organizácia (ťažiar)"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "geo_dobyvaci_priestor",
  "label": "Dobývací priestor (DP) – do 1 km",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Register ložísk)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/LOZISKA/MapServer/2/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "loz_naz,sur_id_,org_naz,loz_naz_dp",
   "returnGeometry": "false",
   "f": "json",
   "distance": "1000",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "loz_naz": "Názov ložiska",
   "sur_id_": "Druh suroviny",
   "org_naz": "Organizácia (ťažiar)"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "geo_lozisko_nevyhradene",
  "label": "Ložisko nevyhradeného nerastu – do 1 km",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Register ložísk)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/LOZISKA/MapServer/3/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "loz_naz,sur_id_,org_naz",
   "returnGeometry": "false",
   "f": "json",
   "distance": "1000",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "loz_naz": "Názov ložiska",
   "sur_id_": "Druh suroviny",
   "org_naz": "Organizácia (ťažiar)"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "geo_nachylnost_svahove_pohyby",
  "label": "Náchylnosť územia na svahové pohyby (1:50 000)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/MNSP50/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "rajon,podrajon,stupen,charakteristika",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "stupen": "Stupeň náchylnosti (rajón)",
   "charakteristika": "Charakteristika"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "geo_kontaminacia_pod",
  "label": "Kontaminácia pôd (mapa 1:500 000)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/MKP/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "popis",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "popis": "Stupeň kontaminácie pôdy"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "geo_geochem_pody",
  "label": "Geochemický atlas – As, Cd, Pb, Hg v pôde (A-horizont)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Geochemický atlas SR, časť V)",
  "method": "arcgis_identify",
  "url": "https://ags.geology.sk/arcgis/rest/services/Atlasy/Atlas_Pody_A/MapServer/identify",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "sr": "4326",
   "layers": "all:12,87,127,132",
   "tolerance": "1",
   "mapExtent": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "imageDisplay": "400,400,96",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "12": "Arzén As (mg/kg)",
   "87": "Kadmium Cd (mg/kg)",
   "127": "Olovo Pb (mg/kg)",
   "132": "Ortuť Hg (mg/kg)"
  },
  "valueMap": {},
  "risk": false,
  "special": "layers"
 },
 {
  "key": "geo_mineralne_vody",
  "label": "Zdroje minerálnych vôd – do 5 km",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Atlas krajiny)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/ZGMV/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "kod,v,tvnp",
   "returnGeometry": "false",
   "f": "json",
   "distance": "5000",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "v": "Výdatnosť (l/s)",
   "tvnp": "Teplota vody (°C)",
   "kod": "Kód typu vody"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "geo_geotermalny_potencial",
  "label": "Geotermálna štruktúra – teplota a kolektor geotermálnych vôd",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Atlas krajiny)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/ZGMV/MapServer/5/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "gs,tvgv,hkgv,posgv",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "posgv": "Perspektívna oblasť geotermálnych vôd",
   "hkgv": "Hlavný kolektor",
   "tvgv": "Teplota vody (°C)"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "voda_zaplava_q5_q1000",
  "label": "Záplavové územie pri prietoku Q5 / Q10 / Q50 / Q100 / Q1000 (mapy povodňového ohrozenia)",
  "category": "Voda a povodne",
  "provider": "SVP š.p. (INSPIRE)",
  "method": "arcgis_identify",
  "url": "https://mpt.svp.sk/server/rest/services/inspire/INSPIRE_MPO/MapServer/identify",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "sr": "4326",
   "layers": "all:0,1,2,3,4",
   "tolerance": "0",
   "mapExtent": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "imageDisplay": "200,200,96",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "layerId": "0=Q1000, 1=Q100, 2=Q50, 3=Q10, 4=Q5",
   "inundationReturnPeriod": "Doba opakovania (roky)",
   "id_versionId": "Verzia dát"
  },
  "valueMap": {
   "0": "Q1000",
   "1": "Q100",
   "2": "Q50",
   "3": "Q10",
   "4": "Q5"
  },
  "risk": true,
  "special": "flood"
 },
 {
  "key": "voda_ochranna_hradza",
  "label": "Ochranná hrádza – do 500 m",
  "category": "Voda a povodne",
  "provider": "SVP š.p.",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/objekty_vh/ochranna_hradza/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NAZOV_TOKU,STRANA,RKM_OD,RKM_DO,DLZKA,TYP_HRADZE",
   "returnGeometry": "false",
   "f": "json",
   "distance": "500",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "NAZOV_TOKU": "Tok",
   "STRANA": "Breh",
   "RKM_OD": "Riečny km od",
   "DLZKA": "Dĺžka (m)"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "voda_chvo",
  "label": "Chránená vodohospodárska oblasť (CHVO)",
  "category": "Voda a povodne",
  "provider": "VÚVH (cez SVP)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/VUVH_CHVU/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "Názov",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "Názov": "Názov CHVO"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "voda_ochranne_pasmo_vodneho_zdroja",
  "label": "Ochranné pásmo vodárenského zdroja (OPVZ / PHO)",
  "category": "Voda a povodne",
  "provider": "VÚVH (cez NPPC-VÚPOP)",
  "method": "arcgis_query",
  "url": "https://portal.vupop.sk/arcgis/rest/services/NDIR/OVPZ/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NM1,NAM,SVZ,TVZ",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NAM": "Názov vodného zdroja",
   "NM1": "Útvar / kód",
   "SVZ": "kód (pravdepodobne stupeň OP)",
   "TVZ": "kód (pravdepodobne typ zdroja)"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "voda_zranitelna_oblast_dusicnany",
  "label": "Zraniteľná oblasť (nitrátová smernica)",
  "category": "Voda a povodne",
  "provider": "NPPC-VÚPOP",
  "method": "arcgis_query",
  "url": "https://portal.vupop.sk/arcgis/rest/services/NDIR/Zranitelne_oblasti/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "Kod_ZO,Nazov_ZO,Typ_ZO,ZO_2022,Platnosť",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "Nazov_ZO": "Zraniteľná oblasť (obec)",
   "Typ_ZO": "Typ (podzemné/povrchové vody)",
   "ZO_2022": "Vymedzenie 2022"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "voda_hydromelioracie_odvodnenie",
  "label": "Hydromelioračný odvodňovací kanál – do 100 m",
  "category": "Voda a povodne",
  "provider": "Hydromeliorácie š.p. / VÚVH (cez SVP)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/HM_Kanalizacna_siet/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "evcislo,kryty,dlzka_geom,kataster,poznamka,vyradene",
   "returnGeometry": "false",
   "f": "json",
   "distance": "100",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "evcislo": "Evidenčné číslo kanála",
   "kryty": "Krytý (1) / otvorený (0)",
   "dlzka_geom": "Dĺžka úseku (km)",
   "poznamka": "Poznámka správcu (profil, stav, zásahy stavieb)",
   "vyradene": "Vyradené z evidencie"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "voda_hydromelioracie_zavlaha",
  "label": "Hydromelioračný závlahový kanál – do 100 m",
  "category": "Voda a povodne",
  "provider": "Hydromeliorácie š.p. / VÚVH (cez SVP)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/HM_Kanalizacna_siet/MapServer/2/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "evcislo,kryty,dlzka_geom,kataster,poznamka,vyradene",
   "returnGeometry": "false",
   "f": "json",
   "distance": "100",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "evcislo": "Evidenčné číslo kanála",
   "kryty": "Krytý (1) / otvorený (0)",
   "dlzka_geom": "Dĺžka úseku (km)",
   "poznamka": "Poznámka správcu (profil, stav, zásahy stavieb)",
   "vyradene": "Vyradené z evidencie"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "prir_vchu_zona_stupen",
  "label": "Veľkoplošné chránené územie (NP/CHKO) a zóna = stupeň ochrany",
  "category": "Príroda a pôda",
  "provider": "ŠOP SR (kópia na SVP, popis „Chránené územia 2020“)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/SOPSR_CHUZ/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NAM,TYP_VCHU,ZONA",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NAM": "Názov",
   "TYP_VCHU": "Typ",
   "ZONA": "Zóna – stupeň ochrany"
  },
  "valueMap": {
   "Zóna D - II. stupeň ochrany": "2",
   "Zóna C - III. stupeň ochrany": "3",
   "Zóna B - IV. stupeň ochrany": "4",
   "Zóna A - V. stupeň ochrany": "5",
   "(mimo)": "1"
  },
  "risk": false,
  "special": "stupen"
 },
 {
  "key": "prir_mchu",
  "label": "Maloplošné chránené územie (PR, NPR, PP, CHA) a jeho ochranné pásmo",
  "category": "Príroda a pôda",
  "provider": "ŠOP SR (kópia na SVP, popis „Chránené územia 2020“)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/SOPSR_CHUZ/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NAM,TYP_MCHU,ZONA,CSZ",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NAM": "Názov",
   "TYP_MCHU": "Kategória",
   "ZONA": "Stupeň ochrany"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "prir_natura_uev",
  "label": "Natura 2000 – územie európskeho významu (ÚEV)",
  "category": "Príroda a pôda",
  "provider": "ŠOP SR (kópia na SVP, popis „Chránené územia 2020“)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/SOPSR_CHUZ/MapServer/2/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NAZOV_UZEM,SITECODE",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NAZOV_UZEM": "Názov",
   "SITECODE": "Kód"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "prir_natura_chvu",
  "label": "Natura 2000 – chránené vtáčie územie (CHVÚ)",
  "category": "Príroda a pôda",
  "provider": "ŠOP SR (kópia na SVP, popis „Chránené územia 2020“)",
  "method": "arcgis_query",
  "url": "https://mpt.svp.sk/server/rest/services/ext_data/SOPSR_CHUZ/MapServer/3/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "STAND_NAZ,SITECODE",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "STAND_NAZ": "Názov",
   "SITECODE": "Kód"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "prir_ekosystemy_biotopy",
  "label": "Biotop / ekosystém (+ drevinové zloženie a vek porastu 2017)",
  "category": "Les",
  "provider": "ŠOP SR – Mapa ekosystémov a ekosystémových služieb 2017",
  "method": "wms_getfeatureinfo",
  "url": "https://maps.sopsr.sk/wms-ekosystemy/service",
  "params": {
   "SERVICE": "WMS",
   "VERSION": "1.1.1",
   "REQUEST": "GetFeatureInfo",
   "LAYERS": "Ekosystemy",
   "QUERY_LAYERS": "Ekosystemy",
   "SRS": "EPSG:4326",
   "BBOX": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "WIDTH": "101",
   "HEIGHT": "101",
   "X": "50",
   "Y": "50",
   "INFO_FORMAT": "text/plain",
   "STYLES": ""
  },
  "fields": {
   "legenda_sk": "Biotop (národný kód + názov)",
   "b1_kod": "Kód biotopu Natura 2000",
   "habitat_name": "EUNIS biotop",
   "d_skupina": "Skupina biotopov",
   "vek_porastu_2017": "Vek lesného porastu (2017, roky)",
   "zk": "Zakmenenie",
   "stupen_svahu": "Sklon (°)",
   "conservation_status": "Stav ochrany biotopu"
  },
  "valueMap": {},
  "risk": false,
  "special": "eko"
 },
 {
  "key": "prir_les_porast",
  "label": "Lesný porast (JPRL) – kategória lesa, LHC, platnosť PSL",
  "category": "Les",
  "provider": "NLC Zvolen",
  "method": "arcgis_query",
  "url": "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/JPRL/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "IDPS,DC,CP,PS,KL,TXDP_SKR,LHC,RZP,RUP,Plocha",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "KL": "Kategória lesa (H hospodársky, O ochranný, U osobitného určenia)",
   "TXDP_SKR": "Druh pozemku (lesný porast / OLP)",
   "LHC": "Lesný hospodársky celok",
   "RZP": "PSL platný od (rok)",
   "RUP": "PSL platný do (rok)",
   "Plocha": "Výmera JPRL (m²)"
  },
  "valueMap": {
   "H": "hospodársky les",
   "O": "ochranný les",
   "U": "les osobitného určenia"
  },
  "risk": false,
  "special": null
 },
 {
  "key": "prir_les_zmiesanie",
  "label": "Typ lesa podľa zmiešania drevín",
  "category": "Les",
  "provider": "NLC Zvolen",
  "method": "arcgis_query",
  "url": "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/DrevinoveZlozenie/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "zmiesanie,IDPS",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "zmiesanie": "Typ lesa podľa zmiešania"
  },
  "valueMap": {
   "0": "ostatné lesné pozemky",
   "1": "ihličnaté",
   "2": "prevažne ihličnaté",
   "3": "zmiešané",
   "4": "listnaté",
   "5": "prevažne listnaté",
   "6": "holiny"
  },
  "risk": false,
  "special": null
 },
 {
  "key": "prir_lesne_typy",
  "label": "Lesný typ, vegetačný stupeň, kategória lesa",
  "category": "Les",
  "provider": "NLC Zvolen",
  "method": "arcgis_query",
  "url": "https://gis.nlcsk.org/ArcGIS/rest/services/Inspire/LesneTypy/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NHSLT,hlLT,LVS,KAT,NLT1",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NHSLT": "Hospodársky súbor lesných typov",
   "hlLT": "Hlavný lesný typ",
   "LVS": "Lesný vegetačný stupeň (1–9)",
   "KAT": "Kategória lesa"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "prir_lpis_diel",
  "label": "LPIS – diel pôdneho bloku a kultúra (do 50 m)",
  "category": "Príroda a pôda",
  "provider": "NPPC-VÚPOP (pre PPA)",
  "method": "arcgis_query",
  "url": "https://portal.vupop.sk/arcgis/rest/services/LPIS/LPIS_aktualny_a_lokality/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "KULTURA_NA,KULTURA_SK,ZKOD_DPB,LOKALITA_D,VYMERA_DPB",
   "returnGeometry": "false",
   "f": "json",
   "distance": "50",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "KULTURA_NA": "Kultúra (orná pôda, TTP…)",
   "ZKOD_DPB": "Kód dielu",
   "LOKALITA_D": "Lokalita",
   "VYMERA_DPB": "Výmera dielu (ha)"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "prir_hranice_uzivania",
  "label": "Hranice užívania (deklarácia plodín, stav 19.11.2024)",
  "category": "Príroda a pôda",
  "provider": "NPPC-VÚPOP",
  "method": "arcgis_query",
  "url": "https://portal.vupop.sk/arcgis/rest/services/HU/Hranice_uzivania/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "PLODINA_NA,KULTURA_NA,VYMERA,LOKALITA_N,ZKODKD",
   "returnGeometry": "false",
   "f": "json",
   "distance": "50",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "PLODINA_NA": "Deklarovaná plodina",
   "KULTURA_NA": "Kultúra",
   "VYMERA": "Výmera (ha)"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "prir_erozia_vodna",
  "label": "Vodná erózia pôdy (aktuálna, kategória 1–4)",
  "category": "Príroda a pôda",
  "provider": "NPPC-VÚPOP",
  "method": "arcgis_identify",
  "url": "https://portal.vupop.sk/arcgis/rest/services/Degradacia/Degradacia/MapServer/identify",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "sr": "4326",
   "layers": "all:5",
   "tolerance": "1",
   "mapExtent": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "imageDisplay": "400,400,96",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "UniqueValue.Pixel Value": "Kategória vodnej erózie"
  },
  "valueMap": {
   "1": "žiadna alebo nízka",
   "2": "stredná",
   "3": "vysoká",
   "4": "extrémna"
  },
  "risk": false,
  "special": "pixel"
 },
 {
  "key": "prir_erozia_veterna",
  "label": "Veterná erózia pôdy (podľa BPEJ)",
  "category": "Príroda a pôda",
  "provider": "NPPC-VÚPOP",
  "method": "arcgis_query",
  "url": "https://portal.vupop.sk/arcgis/rest/services/Degradacia/Degradacia/MapServer/8/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "BPEJ,Erozia,hodnotenie",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "hodnotenie": "Veterná erózia",
   "BPEJ": "Kód BPEJ"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "prir_degradacia_dielu",
  "label": "Index degradácie pôdy dielu LPIS (erózia, zhutnenie, kontaminácia, acidifikácia)",
  "category": "Príroda a pôda",
  "provider": "NPPC-VÚPOP",
  "method": "arcgis_query",
  "url": "https://portal.vupop.sk/arcgis/rest/services/Degradacia/Degradacia/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "LOK_ZKODKD,LPIS_degradacia_index_index_degradacia,LPIS_degradacia_index_index_zhutnenie,LPIS_degradacia_index_index_erozia",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "LPIS_degradacia_index_index_degradacia": "Celkový index degradácie"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "env_seveso",
  "label": "Seveso podniky (závažné priemyselné havárie) – do 3 km",
  "category": "Životné prostredie",
  "provider": "SAŽP / MŽP SR (IS PZPH)",
  "method": "arcgis_query",
  "url": "https://arc.sazp.sk/arcgis/rest/services/seveso/podnik_pzph/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NAZOV,KATEGORIA,OBECNAZOV,ZEM_SIRKA_ETRS89,ZEM_DLZKA_ETRS89",
   "returnGeometry": "false",
   "f": "json",
   "distance": "3000",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "NAZOV": "Podnik",
   "KATEGORIA": "Kategória (A nižší / B vyšší stupeň)",
   "OBECNAZOV": "Obec"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "env_ipkz",
  "label": "IPKZ prevádzky (integrované povoľovanie – priemysel, veľkochovy) – do 2 km",
  "category": "Životné prostredie",
  "provider": "SAŽP / SIŽP",
  "method": "arcgis_query",
  "url": "https://arc.sazp.sk/arcgis/rest/services/ipkz/ipkz_prevadzky/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "SIZP_PKA__NAZOV,SIZP_PKA__OBEC,SIZP_PKA__DATUMVYRAD",
   "returnGeometry": "false",
   "f": "json",
   "distance": "2000",
   "units": "esriSRUnit_Meter"
  },
  "fields": {
   "SIZP_PKA__NAZOV": "Prevádzka",
   "SIZP_PKA__OBEC": "Obec",
   "SIZP_PKA__DATUMVYRAD": "Vyradená (dátum)"
  },
  "valueMap": {},
  "risk": true,
  "special": null
 },
 {
  "key": "env_uses_biocentra",
  "label": "ÚSES – nadregionálne biocentrum (GNÚSES, orientačne)",
  "category": "Príroda a pôda",
  "provider": "SAŽP",
  "method": "arcgis_query",
  "url": "https://arc.sazp.sk/arcgis/rest/services/uses/gnuses/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "*",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NAZOV": "Názov biocentra",
   "KATEG": "Kategória"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "env_uses_bk_terestricky",
  "label": "ÚSES – nadregionálny terestrický biokoridor (orientačne)",
  "category": "Príroda a pôda",
  "provider": "SAŽP",
  "method": "arcgis_query",
  "url": "https://arc.sazp.sk/arcgis/rest/services/uses/gnuses/MapServer/1/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "*",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {},
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "env_uses_bk_hydricky",
  "label": "ÚSES – nadregionálny hydrický biokoridor (orientačne)",
  "category": "Príroda a pôda",
  "provider": "SAŽP",
  "method": "arcgis_query",
  "url": "https://arc.sazp.sk/arcgis/rest/services/uses/gnuses/MapServer/2/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "*",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {},
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "env_ovzdusie_pm25",
  "label": "Kvalita ovzdušia – PM2,5 ročný priemer (µg/m³, model EEA 1 km)",
  "category": "Životné prostredie",
  "provider": "EEA (ML model kvality ovzdušia, AQModelViewer)",
  "method": "arcgis_identify",
  "url": "https://air.discomap.eea.europa.eu/arcgis/rest/services/AQModelViewer_EEA/AQ_6001_P1Y/ImageServer/identify",
  "params": {
   "geometry": "{\"x\":{lon},\"y\":{lat},\"spatialReference\":{\"wkid\":4326}}",
   "geometryType": "esriGeometryPoint",
   "returnGeometry": "false",
   "returnCatalogItems": "false",
   "time": "1640995200000",
   "f": "json"
  },
  "fields": {
   "value": "Ročný priemer koncentrácie (µg/m³)"
  },
  "valueMap": {},
  "risk": false,
  "special": "air"
 },
 {
  "key": "env_ovzdusie_pm10",
  "label": "Kvalita ovzdušia – PM10 ročný priemer (µg/m³, model EEA 1 km)",
  "category": "Životné prostredie",
  "provider": "EEA (ML model kvality ovzdušia, AQModelViewer)",
  "method": "arcgis_identify",
  "url": "https://air.discomap.eea.europa.eu/arcgis/rest/services/AQModelViewer_EEA/AQ_5_P1Y/ImageServer/identify",
  "params": {
   "geometry": "{\"x\":{lon},\"y\":{lat},\"spatialReference\":{\"wkid\":4326}}",
   "geometryType": "esriGeometryPoint",
   "returnGeometry": "false",
   "returnCatalogItems": "false",
   "time": "1640995200000",
   "f": "json"
  },
  "fields": {
   "value": "Ročný priemer koncentrácie (µg/m³)"
  },
  "valueMap": {},
  "risk": false,
  "special": "air"
 },
 {
  "key": "env_ovzdusie_no2",
  "label": "Kvalita ovzdušia – NO2 ročný priemer (µg/m³, model EEA 1 km)",
  "category": "Životné prostredie",
  "provider": "EEA (ML model kvality ovzdušia, AQModelViewer)",
  "method": "arcgis_identify",
  "url": "https://air.discomap.eea.europa.eu/arcgis/rest/services/AQModelViewer_EEA/AQ_8_P1Y/ImageServer/identify",
  "params": {
   "geometry": "{\"x\":{lon},\"y\":{lat},\"spatialReference\":{\"wkid\":4326}}",
   "geometryType": "esriGeometryPoint",
   "returnGeometry": "false",
   "returnCatalogItems": "false",
   "time": "1640995200000",
   "f": "json"
  },
  "fields": {
   "value": "Ročný priemer koncentrácie (µg/m³)"
  },
  "valueMap": {},
  "risk": false,
  "special": "air"
 },
 {
  "key": "geo_klimatickogeograficky_typ",
  "label": "Klimatickogeografický typ (teploty jan/júl, zrážky)",
  "category": "Geológia a podložie",
  "provider": "ŠGÚDŠ (Atlas krajiny)",
  "method": "arcgis_query",
  "url": "https://ags.geology.sk/arcgis/rest/services/WebServices/KGT/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "typ,subtyp,t_jan_min,t_jan_max,t_jul_min,t_jul_max,prec_min,prec_max,t_sum",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "typ": "Klimatický typ",
   "subtyp": "Podtyp",
   "t_jan_min": "Priem. teplota január od (°C)",
   "t_jul_max": "Priem. teplota júl do (°C)",
   "prec_min": "Ročné zrážky od (mm)",
   "t_sum": "Teplotná suma"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "klima_pvgis_pv",
  "label": "Fotovoltický potenciál (PVGIS) – ročná výroba FVE na 1 kWp",
  "category": "Klíma a slnko",
  "provider": "EC JRC – PVGIS 5.3",
  "method": "json_api",
  "url": "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc",
  "params": {
   "lat": "{lat}",
   "lon": "{lon}",
   "peakpower": "1",
   "loss": "14",
   "optimalangles": "1",
   "usehorizon": "1",
   "outputformat": "json"
  },
  "fields": {
   "outputs.totals.fixed.E_y": "Ročná výroba FVE (kWh/rok na 1 kWp, straty 14 %)",
   "outputs.totals.fixed.H(i)_y": "Ročné ožiarenie optimálne sklonenej plochy (kWh/m²)",
   "outputs.totals.fixed.SD_y": "Medziročná smerodajná odchýlka výroby (kWh)",
   "outputs.totals.fixed.l_total": "Celkové straty (%)",
   "inputs.mounting_system.fixed.slope.value": "Optimálny sklon panelov (°)",
   "inputs.mounting_system.fixed.azimuth.value": "Optimálny azimut (° od juhu, - = východ)",
   "inputs.location.elevation": "Výška bodu v modeli PVGIS (m)"
  },
  "valueMap": {},
  "risk": false,
  "special": "pvgis"
 },
 {
  "key": "mapa_dmp_povrch",
  "label": "Digitálny model povrchu DMP 1.0 – výška povrchu (strechy, koruny stromov)",
  "category": "Výšky a vzdušný priestor",
  "provider": "ÚGKK SR / GKÚ Bratislava – INSPIRE Elevation (DSM)",
  "method": "wms_getfeatureinfo",
  "url": "https://inspirews.skgeodesy.sk/geoserver/el_dsm/ows",
  "params": {
   "SERVICE": "WMS",
   "VERSION": "1.3.0",
   "REQUEST": "GetFeatureInfo",
   "LAYERS": "EL.GridCoverage",
   "QUERY_LAYERS": "EL.GridCoverage",
   "STYLES": "",
   "CRS": "CRS:84",
   "BBOX": "{lon_min},{lat_min},{lon_max},{lat_max}",
   "WIDTH": "21",
   "HEIGHT": "21",
   "I": "10",
   "J": "10",
   "INFO_FORMAT": "application/json",
   "FEATURE_COUNT": "1"
  },
  "fields": {
   "features[0].properties.GRAY_INDEX": "Výška povrchu DMP 1.0 (m n. m., Bpv)"
  },
  "valueMap": {},
  "risk": false,
  "special": "dmp"
 },
 {
  "key": "mapa_lps_vzdusny_priestor_uas",
  "label": "Obmedzenia pre drony – vzdušné priestory pri zemi (CTR, ATZ, P/R/D, TRA, ochrana fauny)",
  "category": "Výšky a vzdušný priestor",
  "provider": "Letové prevádzkové služby SR, š.p. (LPS SR) – gis.lps.sk",
  "method": "arcgis_query",
  "url": "https://gis.lps.sk/server/rest/services/Airspaces/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "where": "TYPE_CODE NOT IN ('FIR','FIR-P','SECTOR','CTA','CTA-P','TMA','TMA-P','AMA','PART') AND (DISTVERTLOWER_VAL IS NULL OR (DISTVERTLOWER_UOM = 'FT' AND DISTVERTLOWER_VAL <= 400))",
   "outFields": "IDENT_TXT,NAME_TXT,TYPE_CODE,LOCALTYPE_TXT,CLASS_CODE,DISTVERTLOWER_VAL,DISTVERTLOWER_UOM,DISTVERTLOWER_CODE,DISTVERTUPPER_VAL,DISTVERTUPPER_UOM,WORKHR_CODE",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "IDENT_TXT": "Označenie priestoru",
   "NAME_TXT": "Názov priestoru",
   "TYPE_CODE": "Typ priestoru",
   "LOCALTYPE_TXT": "Podtyp (ATZ/RMZ/…)",
   "CLASS_CODE": "Trieda vzdušného priestoru",
   "DISTVERTLOWER_VAL": "Spodná hranica",
   "DISTVERTUPPER_VAL": "Horná hranica",
   "DISTVERTUPPER_UOM": "Jednotka (FT/FL)",
   "WORKHR_CODE": "Čas činnosti (H24, TIMSH…)"
  },
  "valueMap": {
   "CTR": "Riadený okrsok letiska (CTR) – let dronu len po koordinácii/povolení",
   "P": "Zakázaný priestor",
   "R": "Obmedzený priestor",
   "D": "Nebezpečný priestor",
   "TRA": "Dočasne vyhradený priestor",
   "RAS": "Priestor s osobitnými pravidlami (ATZ/RMZ… podľa LOCALTYPE_TXT)",
   "PROTECT": "Ochrana fauny – obmedzenie preletov",
   "D-OTHER": "Iný nebezpečný priestor",
   "R-AMC": "Obmedzený priestor (AMC)"
  },
  "risk": true,
  "special": null
 },
 {
  "key": "siete_internet_grid_ru",
  "label": "Širokopásmové pokrytie v štvorci 100 m (fix + mobil, RÚ geoprieskum 2024)",
  "category": "Internet a mobilný signál",
  "provider": "Úrad pre reguláciu elektronických komunikácií a poštových služieb (RÚ) – BCO portál",
  "method": "wfs",
  "url": "https://bco-portal.teleoff.gov.sk/services/mapserver/local/statis-admhran/gservice",
  "params": {
   "service": "WFS",
   "version": "1.1.0",
   "request": "GetFeature",
   "bbox": "{lat},{lon},{lat},{lon},urn:ogc:def:crs:EPSG::4326",
   "outputFormat": "application/json; charset=utf-8",
   "maxFeatures": "1",
   "typeName": "adm_grid_i_2024"
  },
  "fields": {
   "fix_stahovanie_max": "Pevný internet – max. sťahovanie (Mbit/s)",
   "fix_odosilanie_max": "Pevný internet – max. odosielanie (Mbit/s)",
   "fix_stahiovanie_bezne": "Pevný – sťahovanie v špičke (Mbit/s)",
   "fix_odosilanie_bezne": "Pevný – odosielanie v špičke (Mbit/s)",
   "fix_technologia": "Dostupné pevné technológie",
   "mob_stahiovanie_max": "Mobilný – max. sťahovanie (Mbit/s)",
   "mob_odosilanie_max": "Mobilný – max. odosielanie (Mbit/s)",
   "fix_stahiovanie_max_y4": "Plánované pevné sťahovanie – 4. rok (Mbit/s)"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "siete_mobil_obec_ru",
  "label": "Mobilné technológie v obci (3G/4G/5G, RÚ 2024)",
  "category": "Internet a mobilný signál",
  "provider": "RÚ – BCO portál",
  "method": "wfs",
  "url": "https://bco-portal.teleoff.gov.sk/services/mapserver/local/statis-admhran/gservice",
  "params": {
   "service": "WFS",
   "version": "1.1.0",
   "request": "GetFeature",
   "bbox": "{lat},{lon},{lat},{lon},urn:ogc:def:crs:EPSG::4326",
   "outputFormat": "application/json; charset=utf-8",
   "maxFeatures": "1",
   "typeName": "ru_mob_obec"
  },
  "fields": {
   "t3g": "3G (0/1)",
   "t4g": "4G (0/1)",
   "non_standalone_5g": "5G nesamostatné (0/1)",
   "standalone_5g": "5G samostatné (0/1)",
   "stahiovanie_max": "Mobilný – max. sťahovanie (Mbit/s)",
   "odosilanie_max": "Mobilný – max. odosielanie (Mbit/s)"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "prir_les_polovny_revir",
  "label": "Poľovný revír (právo poľovníctva na pozemku)",
  "category": "Les",
  "provider": "NLC Zvolen",
  "method": "arcgis_query",
  "url": "https://gis.nlcsk.org/arcgis/rest/services/Inspire/PolovneReviry/MapServer/0/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "outFields": "NazovReviru",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "NazovReviru": "Názov poľovného revíru"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 },
 {
  "key": "prir_les_cesty",
  "label": "Lesná cesta do 100 m",
  "category": "Les",
  "provider": "NLC Zvolen",
  "method": "arcgis_query",
  "url": "https://gis.nlcsk.org/arcgis/rest/services/Inspire/LesneCesty/MapServer/2/query",
  "params": {
   "geometry": "{lon},{lat}",
   "geometryType": "esriGeometryPoint",
   "inSR": "4326",
   "spatialRel": "esriSpatialRelIntersects",
   "distance": "100",
   "units": "esriSRUnit_Meter",
   "outFields": "druh",
   "returnGeometry": "false",
   "f": "json"
  },
  "fields": {
   "druh": "Druh lesnej cesty"
  },
  "valueMap": {},
  "risk": false,
  "special": null
 }
] as ExtDef[];
