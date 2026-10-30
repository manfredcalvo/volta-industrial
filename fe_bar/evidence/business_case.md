# Business case evidence: value per plant and fleet (for the funding executive)

Exported 2026-10-30 01:18 UTC by `scripts/export_business_case.py` from the governed gold tables (one wear cycle: the current open at-risk cohort).

- `exposure_usd`: downtime-at-risk, the governed KPI (risk × ~2 expected unplanned hours × $22K/hr).
- `ml_vs_old_rule_usd`: the model's pick vs the old hand-coded rule's pick, both priced by the model. This is the value of the ML itself.
- `ml_vs_status_quo_usd`: the model's pick vs running every line to shift end. It uses the outcome history's ~4h stop length, so it is an upper bound and is not used for payback.

| scope            |   lines_ranked |   pull_now |   exposure_usd |   ml_vs_old_rule_usd |   ml_vs_status_quo_usd |
|:-----------------|---------------:|-----------:|---------------:|---------------------:|-----------------------:|
| FLEET (8 plants) |            155 |        126 |        3520660 |               586982 |               14873259 |
| PLANT-01         |             21 |         18 |         517968 |                43725 |                2086835 |
| PLANT-02         |             16 |         11 |         355036 |                38569 |                1602202 |
| PLANT-03         |             22 |         18 |         493284 |                37700 |                2132728 |
| PLANT-04         |             19 |         16 |         421432 |                76400 |                1842827 |
| PLANT-05         |             20 |         16 |         476080 |               115471 |                1883257 |
| PLANT-06         |             20 |         16 |         514580 |               120087 |                2000644 |
| PLANT-07         |             19 |         16 |         445104 |                91161 |                1834699 |
| PLANT-08         |             18 |         15 |         297176 |                63866 |                1490062 |

SQL:

```sql
WITH r AS (
  SELECT a.plant_id, a.downtime_exposure_usd, m.recommended_action AS ml_pick,
         h.recommended_action AS rule_pick, from_json(m.action_ranking, 'array<struct<action:string,predicted_downtime_cost_avoided_usd:double,action_cost_usd:double,net:double>>') AS rk
  FROM casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.gold_maintenance_recommendations m
  JOIN casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.gold_open_atrisk a USING (line_id)
  JOIN casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.gold_recommendations_heuristic h USING (line_id)),
v AS (
  SELECT plant_id, downtime_exposure_usd, ml_pick,
         aggregate(rk, 0D, (acc, x) -> acc + IF(x.action = ml_pick, x.net, 0D)) AS ml_net, aggregate(rk, 0D, (acc, x) -> acc + IF(x.action = rule_pick, x.net, 0D)) AS rule_net,
         aggregate(rk, 0D, (acc, x) -> acc + IF(x.action = 'run_to_shift_end', x.net, 0D)) AS run_net
  FROM r)
SELECT coalesce(plant_id, 'FLEET (8 plants)') AS scope,
       COUNT(*) AS lines_ranked,
       SUM(IF(ml_pick = 'pull_now', 1, 0)) AS pull_now,
       CAST(SUM(downtime_exposure_usd) AS BIGINT) AS exposure_usd,
       CAST(SUM(ml_net - rule_net) AS BIGINT) AS ml_vs_old_rule_usd,
       CAST(SUM(ml_net - run_net) AS BIGINT) AS ml_vs_status_quo_usd
FROM v GROUP BY ROLLUP (plant_id) ORDER BY scope
```
