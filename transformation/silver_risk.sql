-- silver_risk — current + recent risk position per line, with the ai_classify signal
-- inherited from note_risk_flags (dedup join, no second LLM call).
CREATE OR REFRESH MATERIALIZED VIEW silver_risk
  (CONSTRAINT valid_risk_score EXPECT (failure_risk_score BETWEEN 0 AND 1))
CLUSTER BY (snapshot_date)
AS
SELECT
  r.line_id,
  r.snapshot_date,
  r.failure_risk_score,
  r.open_wo_count,
  r.technician_note_text,
  COALESCE(n.risk_signal_score, 0.1) AS risk_signal_score,
  l.plant_id,
  l.line_name,
  l.machine_type,
  l.criticality,
  l.plant_lat,
  l.plant_lng
FROM read_files('/Volumes/${catalog}/${schema}/raw_data/risk_snapshots', format => 'parquet') r
JOIN read_files('/Volumes/${catalog}/${schema}/raw_data/lines', format => 'parquet') l
  ON r.line_id = l.line_id
LEFT JOIN note_risk_flags n
  ON r.technician_note_text = n.technician_note_text;
