-- Index pre rýchly bodový lookup našej parcely (esknIdentify → lookupOurParcel bbox na centroid).
CREATE INDEX IF NOT EXISTS idx_parcels_centroid ON parcels(centroid_lat, centroid_lng);
