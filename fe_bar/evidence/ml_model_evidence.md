# failure_recommender — training, registration, serving, and scoring evidence

Exported 2026-10-29 23:43 UTC from the workspace by `scripts/export_ml_evidence.py` (MLflow run + artifacts, UC registry, serving endpoint, gold tables). Produced by the job `volta_ml_refresh` → `ml/train_register.py` + `ml/score_serve.py`.

## Run result (notebook exit value)

```json
{
  "model": "casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.failure_recommender",
  "model_version": 3,
  "endpoint": "volta-failure-recommender",
  "run_id": "438ca583082e48369200b3d9b4bd27c2",
  "avoided_test_rmse": 22049.5,
  "avoided_rmse_lift_vs_baseline_pct": 18.6,
  "cost_test_r2": 0.991,
  "lines_scored": 155,
  "pull_now_recommended": 126,
  "run_to_shift_end_recommended": 0,
  "expedite_parts_and_run_recommended": 29,
  "hero_line": "LINE-0004",
  "hero_action": "pull_now",
  "ml_vs_heuristic_agreement": 0.658
}
```

## MLflow run `438ca583082e48369200b3d9b4bd27c2`

| metric | value |
|---|---|
| avoided_baseline_rmse | 27089.643 |
| avoided_rmse_lift_vs_baseline_pct | 18.6 |
| avoided_test_mae | 17078.286 |
| avoided_test_r2 | 0.496 |
| avoided_test_rmse | 22049.532 |
| cost_test_r2 | 0.991 |
| cost_test_rmse | 2082.981 |

Tuned (Optuna, TPE) avoided-head params: `learning_rate=0.02195199700425886`, `max_depth=4`, `min_child_weight=19`, `n_estimators=148`, `subsample=0.7035119926400067`

Features: `action_type,criticality,machine_type,risk_at_action,part_local` · business constraint: non-local expedite feasibility `0.5`, freight `$1500.0`/lead-day

### Calibration on the 20% holdout (mean predicted vs actual avoided $)

| action_type            | risk_bucket   |    n |   actual_mean |   predicted_mean |   abs_gap_usd |
|:-----------------------|:--------------|-----:|--------------:|-----------------:|--------------:|
| expedite_parts_and_run | (0.299, 0.5]  |  539 |          8808 |             9843 |          1035 |
| expedite_parts_and_run | (0.5, 0.65]   |  395 |         15911 |            17739 |          1828 |
| expedite_parts_and_run | (0.65, 0.8]   |  381 |         29116 |            29516 |           400 |
| expedite_parts_and_run | (0.8, 0.95]   |  419 |         38029 |            40181 |          2152 |
| pull_now               | (0.299, 0.5]  | 1115 |         14398 |            15008 |           610 |
| pull_now               | (0.5, 0.65]   |  774 |         30058 |            29136 |           922 |
| pull_now               | (0.65, 0.8]   |  801 |         44771 |            46505 |          1734 |
| pull_now               | (0.8, 0.95]   |  827 |         66810 |            65808 |          1002 |
| run_to_shift_end       | (0.299, 0.5]  |  575 |             0 |              942 |           942 |
| run_to_shift_end       | (0.5, 0.65]   |  413 |             0 |              955 |           955 |
| run_to_shift_end       | (0.65, 0.8]   |  388 |             0 |              966 |           966 |
| run_to_shift_end       | (0.8, 0.95]   |  373 |             0 |              977 |           977 |

### ML pick (columns) vs. old heuristic pick (rows), open at-risk lines

```
recommended_action_heuristic,expedite_parts_and_run,pull_now
expedite_parts_and_run,29,53
pull_now,0,73
```

## Unity Catalog registry

`casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.failure_recommender` version **3** carries alias **@prod** (run `438ca583082e48369200b3d9b4bd27c2`).

## Serving endpoint + AI Gateway

- Endpoint `volta-failure-recommender` — state ready=`READY`, serves `casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.failure_recommender` v`3` (workload `Small`, scale_to_zero=`True`)
- AI Gateway usage tracking: `True`
- AI Gateway inference table: `casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.volta_recommender_payload` enabled=`True`
- AI Gateway rate limits: 120 calls/minute per user

### Endpoint smoke test (live invocation from the notebook, hero line)

```json
[
  {
    "action_type": "pull_now",
    "predicted_downtime_cost_avoided_usd": 65541.55,
    "predicted_action_cost_usd": 15003.51,
    "predicted_net_value_usd": 50538.04
  },
  {
    "action_type": "run_to_shift_end",
    "predicted_downtime_cost_avoided_usd": 940.3,
    "predicted_action_cost_usd": 80015.54,
    "predicted_net_value_usd": -79075.24
  },
  {
    "action_type": "expedite_parts_and_run",
    "predicted_downtime_cost_avoided_usd": 19382.72,
    "predicted_action_cost_usd": 7087.75,
    "predicted_net_value_usd": 12294.97
  }
]
```

## Batch output — `gold_maintenance_recommendations`

| recommended_action     |   lines |   predicted_avoided_usd |   predicted_net_usd |   model_version |
|:-----------------------|--------:|------------------------:|--------------------:|----------------:|
| pull_now               |     126 |                 6683338 |             4814872 |               3 |
| expedite_parts_and_run |      29 |                  387235 |              272166 |               3 |

| line_id   |   failure_risk_score | part_local   | recommended_action   | action_ranking                                                                                                                                                                                                                                                                                                                                                                           |
|:----------|---------------------:|:-------------|:---------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| LINE-0004 |                 0.87 | false        | pull_now             | [{"action": "pull_now", "predicted_downtime_cost_avoided_usd": 65541.55, "action_cost_usd": 15003.51, "net": 50538.04}, {"action": "expedite_parts_and_run", "predicted_downtime_cost_avoided_usd": 19382.72, "action_cost_usd": 7087.75, "net": 12294.97}, {"action": "run_to_shift_end", "predicted_downtime_cost_avoided_usd": 940.3, "action_cost_usd": 80015.54, "net": -79075.24}] |

## Endpoint inference table (AI Gateway payload logging)

_(table created; rows land on the gateway's batch schedule)_
