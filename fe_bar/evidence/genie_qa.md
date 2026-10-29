# Genie Agent — natural-language questions over the governed gold tables

Space `01f1d3ebd22919d3ab58c599e15a50d9` ("Volta Plant Floor") over `gold_line_status`, `gold_open_atrisk`, `gold_maintenance_recommendations` (ML-scored) and the `mv_line_risk` metric view. Captured 2026-10-29 22:55 UTC via the Genie Conversation API (`scripts/export_genie_evidence.py`).

## Q1. What's our downtime exposure right now, and how many open work orders?

**Genie:** **Downtime exposure is $3,520,660.0**, and there are **160 open work orders** right now. Based on the single result returned, the current exposure tied to the lines in `mv_line_risk` is **$3.52M**.

```sql
SELECT MEASURE(`downtime_exposure`) AS `downtime_exposure_usd`, MEASURE(`open_work_orders`) AS `open_work_orders`
FROM `casaman_aws_stable_catalog`.`dev_manffred_calvosanchez_volta_industrial`.`mv_line_risk`
GROUP BY ALL
```

| downtime_exposure_usd | open_work_orders |
|---|---|
| 3520660.0 | 160 |

## Q2. Which plants is the failure risk concentrated in?

**Genie:** Failure risk is most concentrated in **PLANT-06** and **PLANT-01**, which each have **14 at-risk lines**; **PLANT-06** has the most critical lines at **14**, followed by **PLANT-03** with **13** and **PLANT-01** with **12**. Examples include:
- **PLANT-06** — **14 at-risk**, **14 critical**
- **PLANT-01** — **14 at-risk**, **12 critical**
- **PLANT-03** — **13 at-risk**, **13 critical**
- **PLANT-05** — **13 at-risk**, **11 critical**
- **PLANT-07** — **12 at-risk**, **12 critical**

Across all **8 plants**, the concentration is heaviest in **PLANT-06, PLANT-01, and PLANT-03**, while **PLANT-08** is the lowest at **8 at-risk** and **8 critical**.

```sql
SELECT
  `plant_id`,
  MEASURE(`critical_count`) AS `critical_lines`,
  MEASURE(`atrisk_count`) AS `atrisk_lines`
FROM `casaman_aws_stable_catalog`.`dev_manffred_calvosanchez_volta_industrial`.`mv_line_risk`
WHERE `plant_id` IS NOT NULL
GROUP BY ALL
ORDER BY `atrisk_lines` DESC, `critical_lines` DESC
```

| plant_id | critical_lines | atrisk_lines |
|---|---|---|
| PLANT-06 | 14 | 14 |
| PLANT-01 | 12 | 14 |
| PLANT-03 | 13 | 13 |
| PLANT-05 | 11 | 13 |
| PLANT-07 | 12 | 12 |
| PLANT-04 | 11 | 11 |
| PLANT-02 | 9 | 9 |
| PLANT-08 | 8 | 8 |

## Q3. Should we pull LINE-04 now or run it to the end of the shift?

**Genie:** **Pull LINE-04 now.** For line_id **LINE-0004**, the recommended action is **pull_now**, with **$65,541.54** in predicted downtime cost avoided and **$50,538.04** in predicted net value. By comparison, **run_to_shift_end** for line_id **LINE-0004** avoids only **$940.30** and has a predicted net value of **-$79,075.24**, so pulling now is the clearly stronger business choice.

```sql
SELECT
  `line_id`,
  `recommended_action`,
  `predicted_downtime_cost_avoided_usd`,
  `predicted_net_value_usd`,
  `action_ranking`
FROM `casaman_aws_stable_catalog`.`dev_manffred_calvosanchez_volta_industrial`.`gold_maintenance_recommendations`
WHERE `line_id` = 'LINE-0004'
```

| line_id | recommended_action | predicted_downtime_cost_avoided_usd | predicted_net_value_usd | action_ranking |
|---|---|---|---|---|
| LINE-0004 | pull_now | 65541.5390625 | 50538.04 | [{"action": "pull_now", "predicted_downtime_cost_avoided_usd": 65541.5390625, "action_cost_usd": 15003.51, "net": 50538.04}, {"action": "expedite_parts_and_run", "predicted_downtime_cost_avoided_usd": 19382.720703125, "action_cost_usd": 7087.75, "net": 12294.97}, {"action": "run_to_shift_end", "predicted_downtime_cost_avoided_usd": 940.2999877929688, "action_cost_usd": 80015.54, "net": -79075.24}] |

## Q4. How many lines should we pull now vs expedite, and how much downtime cost does each avoid?

**Genie:** **Pull now** is the clear priority: **126 lines** are in this group, with about **$6.68M** in predicted downtime cost avoided, versus **29 lines** for **expedite parts and run**, which avoids about **$387K**. That means pull-now opportunities cover over **4x** as many lines and roughly **17x** more avoidable downtime cost than expediting.

```sql
SELECT `recommended_action`, COUNT(*) AS `lines`, SUM(`predicted_downtime_cost_avoided_usd`) AS `total_downtime_cost_avoided_usd`
FROM `casaman_aws_stable_catalog`.`dev_manffred_calvosanchez_volta_industrial`.`gold_maintenance_recommendations`
WHERE `recommended_action` IS NOT NULL
  AND `recommended_action` IN ('pull_now', 'expedite_parts_and_run')
GROUP BY `recommended_action`
ORDER BY `total_downtime_cost_avoided_usd` DESC
```

| recommended_action | lines | total_downtime_cost_avoided_usd |
|---|---|---|
| pull_now | 126 | 6683338.759765625 |
| expedite_parts_and_run | 29 | 387235.9892578125 |

## Q5. Which model version scored the maintenance recommendations?

**Genie:** The maintenance recommendations were scored with **model_version 1**. In the visible result set, **model_version 1** is the only non-null model version returned.

```sql
SELECT DISTINCT `model_version`
FROM `casaman_aws_stable_catalog`.`dev_manffred_calvosanchez_volta_industrial`.`gold_maintenance_recommendations`
WHERE `model_version` IS NOT NULL
ORDER BY `model_version` ASC
```

| model_version |
|---|
| 1 |
