-- 0093: záujemcovia z OS TRI LIPY (kvalifikačný systém leadov) → evidencia dopytu Kataster Core.
-- OS pošle kvalifikovaného záujemcu (5 oblastí: potreba, rozpočet, financovanie, čas kúpy, ďalší krok)
-- cez /api/ingest-buyer-leads; opakované poslanie toho istého leadu záznam AKTUALIZUJE (external_id).
ALTER TABLE buyer_requests ADD COLUMN external_id TEXT;
ALTER TABLE buyer_requests ADD COLUMN financing TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_buyer_requests_ext ON buyer_requests(source, external_id) WHERE external_id IS NOT NULL;
