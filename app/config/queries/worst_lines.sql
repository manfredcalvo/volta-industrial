-- Worst production lines by downtime exposure (Volta Industrial).
-- Tables are referenced via IDENTIFIER(:catalog || '.' || :schema || '.t')
-- so the query resolves on any workspace; :catalog/:schema are bound at
-- runtime by routes/charts.ts and sampled at typegen via the @param lines.
-- @param catalog STRING = serverless_stable_casaman_catalog
-- @param schema STRING = dev_manffred_calvosanchez_volta_industrial
SELECT
  line_id,
  line_name,
  plant_id,
  machine_type,
  CAST(ROUND(failure_risk_score, 3) AS DOUBLE) AS failure_risk_score,
  risk_band,
  CAST(ROUND(downtime_exposure_usd, 2) AS DOUBLE) AS downtime_exposure_usd
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_line_status')
ORDER BY downtime_exposure_usd DESC
LIMIT 15
