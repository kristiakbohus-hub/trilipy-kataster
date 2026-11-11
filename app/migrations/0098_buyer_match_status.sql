-- 0098 — KUPCI: plné hľadanie k dopytu (rozhodnutie vlastníka 2026-11-11).
-- Stav každej zhody dopytu (nová → vybraná → poslaná klientovi → záujem / obhliadka → odmietnutá
-- s dôvodom). snapshot = JSON zhody v čase výberu, aby ponuka pre klienta ostala rovnaká, aj keď sa
-- inzerát medzičasom zmení alebo zmizne. Kľúč mkey: M:<url inzerátu> | P:<dataset>:<C|E>:<parcela>
-- | B:<dataset>:<LV> (dom mimo trhu) | Z:<kod_ku>:<flat_id> (zdedený byt) | L:/U: naše príležitosti.
CREATE TABLE IF NOT EXISTS buyer_match_status (
  request_id  INTEGER NOT NULL,
  mkey        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'nova',   -- nova | vybrana | poslana | zaujem | obhliadka | odmietnuta
  reason      TEXT,                            -- dôvod odmietnutia (cena, lokalita, výmera, stav, iné)
  note        TEXT,
  snapshot    TEXT,
  author      TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (request_id, mkey)
);
CREATE INDEX IF NOT EXISTS ix_buyer_match_status_st ON buyer_match_status(request_id, status);
-- Podmienky dopytu (JSON): {"intravilan":true,"maxOwners":3,"cleanTitle":true}
ALTER TABLE buyer_requests ADD COLUMN must TEXT;
-- Hľadanie „pozemok bez stavby" (NOT EXISTS stavba na parcele) a dom podľa parcely
CREATE INDEX IF NOT EXISTS ix_lv_buildings_parcel ON lv_buildings(dataset_id, on_parcel);
CREATE INDEX IF NOT EXISTS ix_lv_parcels_area ON lv_parcels(dataset_id, register, area_m2);
-- Dopytové inzeráty („hľadám/kúpim") už nie sú ponuka: ingest im nastaví deal='dopyt' / 'dopyt_najom'.
CREATE INDEX IF NOT EXISTS ix_market_listings_deal ON market_listings(deal, ptype, okres);
-- výmera zdedeného bytu (za_cases.flat_id = „F:<asset_id>") pri párovaní dopytu na byt
CREATE INDEX IF NOT EXISTS ix_aacq_asset ON asset_acquisitions(kod_ku, asset_id);
