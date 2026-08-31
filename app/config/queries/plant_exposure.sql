-- Downtime exposure by plant, with plant coordinates for the map
-- (Volta Industrial). plant_lat/plant_lng live on gold_line_status; the
-- Lakebase app.line_status mirror does not carry them, so the geographic
-- plant map is warehouse-backed via this query.
-- @param catalog STRING = serverless_stable_casaman_catalog
-- @param schema STRING = dev_manffred_calvosanchez_volta_industrial
SELECT
  plant_id,
  CAST(AVG(plant_lat) AS DOUBLE) AS plant_lat,
  CAST(AVG(plant_lng) AS DOUBLE) AS plant_lng,
  CAST(COUNT(*) AS BIGINT) AS line_count,
  CAST(SUM(CASE WHEN risk_band IN ('critical', 'elevated') THEN 1 ELSE 0 END) AS BIGINT) AS atrisk_count,
  CAST(ROUND(SUM(downtime_exposure_usd), 2) AS DOUBLE) AS total_exposure_usd
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_line_status')
GROUP BY plant_id
ORDER BY total_exposure_usd DESC
