-- 0119: výkresy ÚP z Macu v podkladoch mapy + spätná väzba úprav (2026-11-13, ÚP „ručné body a legenda v appke").
-- Mac (49_LIST_NEHNUTELNOSTI/up/up_drawings_app.py) publikuje georeferencované výkresy do up_rasters (kind 'up_mac');
-- keď ich niekto v appke prevlícuje alebo doplní legendu (edited_at), Mac to prevezme, prepočíta georeferenciu a zóny.
ALTER TABLE up_rasters ADD COLUMN legend_json TEXT;
ALTER TABLE up_rasters ADD COLUMN edited_at TEXT;
ALTER TABLE up_rasters ADD COLUMN mac_drawing TEXT;
