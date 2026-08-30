-- silver_maintenance — 18-month maintenance-decision history denormalized with the line master.
-- Feeds gold_maintenance_outcomes (heuristic coefficients + the OPTIONAL ML training table).
CREATE OR REFRESH MATERIALIZED VIEW silver_maintenance AS
SELECT
  m.event_id,
  m.line_id,
  m.action_type,
  m.risk_at_action,
  m.part_local,
  m.initiated_date,
  m.action_cost_usd,
  m.downtime_hours,
  m.avoided_unplanned_stop,
  m.downtime_cost_avoided_usd,
  l.plant_id,
  l.machine_type,
  l.criticality
FROM read_files('/Volumes/${catalog}/${schema}/raw_data/maintenance_events', format => 'parquet') m
JOIN read_files('/Volumes/${catalog}/${schema}/raw_data/lines', format => 'parquet') l
  ON m.line_id = l.line_id;
