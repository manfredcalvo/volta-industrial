-- silver_telemetry — per line×day telemetry denormalized with the line master.
-- Powers the app analytics drill-downs and the latest-position join in gold_line_status.
CREATE OR REFRESH MATERIALIZED VIEW silver_telemetry
  (CONSTRAINT valid_vibration    EXPECT (vibration_rms >= 0),
   CONSTRAINT valid_temperature  EXPECT (temperature_c >= 0),
   CONSTRAINT valid_utilization  EXPECT (utilization_pct BETWEEN 0 AND 100))
CLUSTER BY (telemetry_date)
AS
SELECT
  t.line_id,
  t.telemetry_date,
  t.vibration_rms,
  t.temperature_c,
  t.utilization_pct,
  t.error_count,
  l.plant_id,
  l.line_name,
  l.machine_type,
  l.criticality,
  l.plant_lat,
  l.plant_lng
FROM read_files('/Volumes/${catalog}/${schema}/raw_data/telemetry', format => 'parquet') t
JOIN read_files('/Volumes/${catalog}/${schema}/raw_data/lines', format => 'parquet') l
  ON t.line_id = l.line_id;
