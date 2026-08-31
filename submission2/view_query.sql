-- Live view backing the app's Operations "line queue" (GET /api/lines →
-- server/db/queries/operations.ts listLines). Runs against the low-latency
-- Lakebase mirror (app.*), worst downtime exposure first. The UI (LinesTable)
-- renders these rows; clicking one opens the LineDrawer (GET /api/lines/:id).
--
-- One row per production line: current health + failure-risk signals, the
-- at-risk part context (open_atrisk), and the model/heuristic-recommended
-- action (maintenance_recommendations). view_result.json holds the returned
-- rows (top 50 by exposure shown as the representative sample; the live view
-- returns all 1,200 lines).
SELECT
  ls.id,
  ls.line_id,
  ls.plant_id,
  ls.line_name,
  ls.plant_name,
  ls.region,
  ls.failure_risk_score,
  ls.downtime_exposure_usd,
  ls.current_status,
  oa.part_local,
  oa.candidate_part_id,
  oa.part_lead_time_days,
  mr.recommended_action,
  ls.last_check_at
FROM app.line_status ls
LEFT JOIN app.open_atrisk oa
  ON oa.line_id = ls.line_id
LEFT JOIN app.maintenance_recommendations mr
  ON mr.line_id = ls.line_id
ORDER BY ls.downtime_exposure_usd DESC;
