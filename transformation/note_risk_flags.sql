-- note_risk_flags — the ai_classify showcase, deduped.
-- Classify each DISTINCT technician note ONCE (≈7 strings) into failing/degrading/healthy,
-- map to a risk_signal_score, and let silver_risk join back so every snapshot inherits the
-- score without a second LLM call. See specifications/01-lakeflow.md → Raw→Silver.
CREATE OR REFRESH MATERIALIZED VIEW note_risk_flags AS
SELECT
  technician_note_text,
  risk_label,
  CASE risk_label
    WHEN 'failing'   THEN 1.0
    WHEN 'degrading' THEN 0.6
    ELSE 0.1
  END AS risk_signal_score
FROM (
  SELECT
    technician_note_text,
    ai_classify(technician_note_text, ARRAY('failing', 'degrading', 'healthy')) AS risk_label
  FROM (
    SELECT DISTINCT technician_note_text
    FROM read_files('/Volumes/${catalog}/${schema}/raw_data/risk_snapshots', format => 'parquet')
    WHERE technician_note_text IS NOT NULL
  )
);
