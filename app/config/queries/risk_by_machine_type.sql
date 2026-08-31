-- Risk + downtime exposure aggregated by machine type (Volta Industrial).
-- @param catalog STRING = serverless_stable_casaman_catalog
-- @param schema STRING = dev_manffred_calvosanchez_volta_industrial
SELECT
  machine_type,
  CAST(COUNT(*) AS BIGINT) AS line_count,
  CAST(ROUND(AVG(failure_risk_score), 3) AS DOUBLE) AS avg_failure_risk,
  CAST(ROUND(SUM(downtime_exposure_usd), 2) AS DOUBLE) AS total_exposure_usd
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_line_status')
GROUP BY machine_type
ORDER BY total_exposure_usd DESC
