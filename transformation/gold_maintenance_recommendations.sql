-- gold_maintenance_recommendations — the ranked action per open at-risk line, built by the
-- pipeline HEURISTIC (ML optional, 03-ml-maintenance.md overwrites this same table).
-- For each line, construct three candidate actions and rank by net = avoided − action_cost.
-- part_local is the key lever: expediting a non-local part is slow AND costly, which is what
-- makes pull_now the right call for the hero (LINE-0004, high risk, non-local part), while
-- expedite_parts_and_run wins on moderate-risk lines whose part IS local.
CREATE OR REFRESH MATERIALIZED VIEW gold_maintenance_recommendations AS
WITH base AS (
  SELECT
    line_id,
    failure_risk_score              AS risk,
    part_local,
    COALESCE(part_unit_cost_usd, 1500.0) AS unit_cost,
    COALESCE(part_lead_time_days, 7)     AS lead_days,
    4 * 22000.0                     AS stop      -- expected unplanned-stop cost (~4h × $22K/hr)
  FROM gold_open_atrisk
),
scored AS (
  SELECT
    line_id,
    -- pull_now: avoids the unplanned stop; fixed planned-pull opportunity cost.
    risk * stop                                             AS pull_avoided,
    40000.0                                                 AS pull_cost,
    -- run_to_shift_end: keeps producing (small value); expected cost of the gamble.
    8000.0                                                  AS run_avoided,
    risk * stop * (CASE WHEN part_local THEN 0.6 ELSE 1.0 END) AS run_cost,
    -- expedite_parts_and_run: local part largely averts the stop; non-local can't arrive fast.
    risk * stop * (CASE WHEN part_local THEN 0.6 ELSE 0.3 END) AS exp_avoided,
    CASE WHEN part_local THEN unit_cost * 2 + 400
         ELSE unit_cost * 3 + lead_days * 8000.0 END        AS exp_cost
  FROM base
),
nets AS (
  SELECT
    *,
    pull_avoided - pull_cost AS pull_net,
    run_avoided  - run_cost  AS run_net,
    exp_avoided  - exp_cost  AS exp_net
  FROM scored
)
SELECT
  line_id,
  CASE
    WHEN pull_net >= run_net AND pull_net >= exp_net THEN 'pull_now'
    WHEN exp_net  >= pull_net AND exp_net >= run_net THEN 'expedite_parts_and_run'
    ELSE 'run_to_shift_end'
  END AS recommended_action,
  ROUND(
    CASE
      WHEN pull_net >= run_net AND pull_net >= exp_net THEN pull_avoided
      WHEN exp_net  >= pull_net AND exp_net >= run_net THEN exp_avoided
      ELSE run_avoided
    END, 2) AS predicted_downtime_cost_avoided_usd,
  ROUND(GREATEST(pull_net, run_net, exp_net), 2) AS predicted_net_value_usd,
  to_json(array(
    named_struct('action', 'pull_now',
      'predicted_downtime_cost_avoided_usd', ROUND(pull_avoided, 2),
      'action_cost_usd', ROUND(pull_cost, 2), 'net', ROUND(pull_net, 2)),
    named_struct('action', 'run_to_shift_end',
      'predicted_downtime_cost_avoided_usd', ROUND(run_avoided, 2),
      'action_cost_usd', ROUND(run_cost, 2), 'net', ROUND(run_net, 2)),
    named_struct('action', 'expedite_parts_and_run',
      'predicted_downtime_cost_avoided_usd', ROUND(exp_avoided, 2),
      'action_cost_usd', ROUND(exp_cost, 2), 'net', ROUND(exp_net, 2))
  )) AS action_ranking,
  current_timestamp() AS scored_at
FROM nets;
