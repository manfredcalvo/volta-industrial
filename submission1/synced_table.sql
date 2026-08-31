SELECT line_id, plant_id, machine_type, failure_risk_score, risk_band,
       downtime_exposure_usd, part_local
FROM dev_manffred_calvosanchez_volta_industrial.line_status
WHERE risk_band IN ('critical','elevated')
ORDER BY downtime_exposure_usd DESC
LIMIT 10;
