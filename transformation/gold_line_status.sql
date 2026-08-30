-- gold_line_status — THE HEART. One row per line at the CURRENT snapshot (latest snapshot_date),
-- joining current risk + latest telemetry + WO backlog + parts context, with the derived
-- risk_band and downtime_exposure_usd. Dashboard, metric view, Genie, and the app all read this.
CREATE OR REFRESH MATERIALIZED VIEW gold_line_status
CLUSTER BY (plant_id)
AS
WITH current_risk AS (
  -- One row per line at the current snapshot. A few lines land in both the affected and
  -- moderate cohorts in the generator; keep the worst (highest risk) so line_id stays unique.
  SELECT * EXCEPT (rn)
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY line_id ORDER BY failure_risk_score DESC) AS rn
    FROM silver_risk
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM silver_risk)
  )
  WHERE rn = 1
),
latest_tel AS (
  SELECT line_id, vibration_rms, temperature_c, utilization_pct, error_count
  FROM (
    SELECT
      line_id, vibration_rms, temperature_c, utilization_pct, error_count,
      ROW_NUMBER() OVER (PARTITION BY line_id ORDER BY telemetry_date DESC) AS rn
    FROM silver_telemetry
  )
  WHERE rn = 1
),
parts AS (
  SELECT part_id, local_stock_qty, lead_time_days, unit_cost_usd
  FROM read_files('/Volumes/${catalog}/${schema}/raw_data/parts', format => 'parquet')
),
joined AS (
  SELECT
    r.line_id,
    r.plant_id,
    r.line_name,
    r.machine_type,
    r.criticality,
    r.plant_lat,
    r.plant_lng,
    t.vibration_rms,
    t.temperature_c,
    t.utilization_pct,
    t.error_count,
    r.failure_risk_score,
    r.risk_signal_score,
    COALESCE(w.open_wo_count, 0)              AS open_wo_count,
    COALESCE(w.has_open_corrective, false)    AS has_open_corrective,
    w.latest_part_id                          AS candidate_part_id,
    -- part_local: no needed part → no expedite concern (true); else local stock decides.
    CASE WHEN w.latest_part_id IS NULL THEN true
         ELSE COALESCE(p.local_stock_qty > 0, true) END AS part_local,
    p.lead_time_days                          AS part_lead_time_days,
    p.unit_cost_usd                           AS part_unit_cost_usd
  FROM current_risk r
  LEFT JOIN latest_tel t USING (line_id)
  LEFT JOIN silver_work_orders w USING (line_id)
  LEFT JOIN parts p ON w.latest_part_id = p.part_id
)
SELECT
  *,
  CASE
    WHEN failure_risk_score >= 0.75 AND has_open_corrective THEN 'critical'
    WHEN failure_risk_score >= 0.6                          THEN 'elevated'
    WHEN failure_risk_score >= 0.4                          THEN 'watch'
    ELSE 'healthy'
  END AS risk_band,
  -- downtime-at-risk exposure: risk × ~2 expected unplanned hours × ~$22K/hr, at-risk only.
  CASE WHEN failure_risk_score >= 0.6
       THEN ROUND(failure_risk_score * 2 * 22000, 2)
       ELSE 0 END AS downtime_exposure_usd
FROM joined;
