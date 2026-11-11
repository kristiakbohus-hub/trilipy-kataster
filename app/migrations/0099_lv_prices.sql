-- 0099 — CENY ZO ZMLÚV z katastra (SPI: CEN + CAS pri parcelách C/E, stavbách a bytoch), rozhodnutie
-- vlastníka 2026-11-11: „súhrnne + pri LV". Jedna zmluva = jeden riadok: SPI opakuje cenu CELEJ zmluvy pri
-- každej položke, preto Mac (41_IMPORT/kataster_prices_push.py) zoskupí (LV, dátum, cena). Väzba „kto
-- koľko zaplatil" vzniká až s menami vlastníkov na výpise LV — tie vidí len plný prístup.
CREATE TABLE IF NOT EXISTS lv_prices (
  dataset_id TEXT NOT NULL,
  lv_no      INTEGER NOT NULL,
  cas        TEXT NOT NULL,        -- dátum ceny zo zmluvy (YYYY-MM-DD)
  cen        REAL NOT NULL,        -- cena celej zmluvy (€)
  kind       TEXT NOT NULL,        -- pozemok | byt | dom | stavba | zmiesane
  n_items    INTEGER NOT NULL DEFAULT 1,
  land_m2    REAL,                 -- súčet výmer parciel v zmluve
  flat_m2    REAL,                 -- výmera bytu (ak je v SPI)
  ppm2       REAL,                 -- €/m² len pri čistej zmluve (len pozemky / byt s výmerou)
  flag       TEXT,                 -- odchýlka (extrém €/m², symbolická cena) — do mediánov sa nepočíta
  items      TEXT                  -- „C 1500/2, C 1500/3" / „byt 12 (vchod 2)"
);
CREATE INDEX IF NOT EXISTS ix_lv_prices_lv ON lv_prices(dataset_id, lv_no);
CREATE INDEX IF NOT EXISTS ix_lv_prices_kind ON lv_prices(dataset_id, kind, cas);
