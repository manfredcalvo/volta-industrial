SELECT a.line_id, l.plant_id, l.machine_type,
       round(a.failure_risk_score::numeric,2) AS failure_risk,
       round(a.downtime_exposure_usd::numeric,0) AS downtime_exposure_usd,
       a.candidate_part_id, a.part_lead_time_days
FROM dev_manffred_calvosanchez_volta_industrial.open_atrisk a
JOIN dev_manffred_calvosanchez_volta_industrial.line_status l ON l.line_id = a.line_id
WHERE a.part_local = false
ORDER BY a.downtime_exposure_usd DESC
LIMIT 10;
