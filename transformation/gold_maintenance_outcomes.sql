-- gold_maintenance_outcomes — one row per historical maintenance decision + features + outcome.
-- The heuristic's coefficient source and the OPTIONAL ML training table (03-ml-maintenance.md).
CREATE OR REFRESH MATERIALIZED VIEW gold_maintenance_outcomes AS
SELECT
  event_id,
  line_id,
  plant_id,
  machine_type,
  criticality,
  action_type,
  risk_at_action,
  part_local,
  action_cost_usd,
  downtime_hours,
  avoided_unplanned_stop,
  downtime_cost_avoided_usd
FROM silver_maintenance;
