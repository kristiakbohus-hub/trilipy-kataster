// Popisy predpočítaných údajov listu nehnuteľnosti (property_facts). GENEROVANÉ zo schém Mac modulov
// (13_INFOKAT_CLAUDE/49_LIST_NEHNUTELNOSTI/schemas/*.json) skriptom gen_facts_schema.py — ručne neupravovať.
// Keď kľúč v schéme chýba, list ho zobrazí s ľudsky upraveným názvom kľúča (nič sa nestratí).
export type FactField = { label: string; unit?: string | null; kind?: string; note?: string };
export const FACT_SCHEMA: Record<string, Record<string, FactField>> = {};

export const FACT_GROUP_LABEL: Record<string, string> = {
  teren: "Terén", slnko: "Slnko a svetlo", stavby: "Stavby", byty: "Byty a nebytové priestory", pristup: "Prístup z cesty",
  susedia: "Susedné parcely", mapa: "Z katastrálnej mapy", bpej: "Pôda (BPEJ)", vlastnici: "Vlastníci — súhrn",
  osm: "Siete, doprava a vybavenosť (OSM)", obec: "Obec a ľudia", klima: "Klíma", normy: "Stavebné normy lokality",
};
