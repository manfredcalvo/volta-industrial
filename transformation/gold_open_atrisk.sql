-- gold_open_atrisk — the current at-risk lines (critical/elevated/watch) with parts context.
-- Model/heuristic scoring input AND (joined with recommendations) the app's floor queue.
CREATE OR REFRESH MATERIALIZED VIEW gold_open_atrisk AS
SELECT
  line_id,
  plant_id,
  line_name,
  machine_type,
  criticality,
  plant_lat,
  plant_lng,
  failure_risk_score,
  downtime_exposure_usd,
  open_wo_count,
  has_open_corrective,
  vibration_rms,
  temperature_c,
  part_local,
  candidate_part_id,
  part_lead_time_days,
  part_unit_cost_usd
FROM gold_line_status
WHERE risk_band IN ('critical', 'elevated', 'watch');
