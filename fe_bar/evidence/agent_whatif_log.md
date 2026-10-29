# App agent → live ML what-if (predict_action_value → failure_recommender endpoint)

Captured 2026-10-29 23:06 UTC from the deployed app `https://volta-plant-floor-7474646266725179.aws.databricksapps.com` via `scripts/drive_whatif.py` (real agent turn; model calls routed through the Unity AI Gateway model service `volta_ai_gateway`).

**User:** For LINE-04: what does the model recommend today, and what if the replacement part were stocked locally? Compare both scenarios with the dollars.

## Tool calls (in order)

1. `rank_maintenance_actions` — `{"line_id":"LINE-04"}`
2. `predict_action_value` — `{"line_id":"LINE-04","part_local_override":true,"risk_override":null}`
3. `find_atrisk_line` — `{"line_id":"LINE-04","plant_id":null}`

## Tool outputs

### `rank_maintenance_actions`

```json
{
  "type": "text",
  "text": "{\"line_id\":\"LINE-0004\",\"recommended_action\":\"pull_now\",\"predicted_downtime_cost_usd\":65541.5390625,\"action_ranking\":[{\"action\":\"pull_now\",\"predicted_downtime_cost_avoided_usd\":65541.5390625,\"estimated_net_value_usd\":50538.04,\"action_cost_usd\":15003.51},{\"action\":\"expedite_parts_and_run\",\"predicted_downtime_cost_avoided_usd\":19382.720703125,\"estimated_net_value_usd\":12294.97,\"action_cost_usd\":7087.75},{\"action\":\"run_to_shift_end\",\"predicted_downtime_cost_avoided_usd\":940.2999877929688,\"estimated_net_value_usd\":-79075.24,\"action_cost_usd\":80015.54}]}"
}
```

### `predict_action_value`

```json
{
  "type": "text",
  "text": "{\"line_id\":\"LINE-0004\",\"scenario\":{\"risk_at_action\":0.87,\"part_local\":true,\"criticality\":\"medium\",\"machine_type\":\"Hydraulic_Press\",\"part_lead_time_days\":2},\"is_what_if\":true,\"actual\":{\"risk_at_action\":0.87,\"part_local\":false},\"recommended_action\":\"pull_now\",\"ranking\":[{\"action_type\":\"pull_now\",\"predicted_downtime_cost_avoided_usd\":65566.2890625,\"predicted_action_cost_usd\":14853.67,\"predicted_net_value_usd\":50712.62},{\"action_type\":\"expedite_parts_and_run\",\"predicted_downtime_cost_avoided_usd\":38800.3515625,\"predicted_action_cost_usd\":4027.45,\"predicted_net_value_usd\":34772.9},{\"action_type\":\"run_to_shift_end\",\"predicted_downtime_cost_avoided_usd\":966.6199951171875,\"predicted_action_cost_usd\":77058.91,\"predicted_net_value_usd\":-76092.28}],\"model_endpoint\":\"volta-failure-recommender\"}"
}
```

### `find_atrisk_line`

```json
{
  "type": "text",
  "text": "{\"line_id\":\"LINE-0004\",\"plant_id\":\"PLANT-03\",\"line_name\":\"Line 04\",\"failure_risk_score\":0.87,\"downtime_exposure_usd\":38280,\"current_status\":\"critical\",\"part_local\":false,\"candidate_part_id\":\"PART-00001\",\"part_lead_time_days\":2}"
}
```

## Agent answer

**$50.5K net today  and $50.7K net if the part were local. Recommendation stays: pull now.**

For **LINE-04 (PLANT-03)**, the current batch model recommends **pull_now**.  
Today the candidate part is marked **non-local**; in the live what-if scenario I forced it to **local stock**.

### Current recommendation vs. local-stock scenario

| Scenario | Recommended action | Cost avoided | Action cost | Net value |
|---|---:|---:|---:|---:|
| **Today (actual, part non-local)** | **pull_now** | **$65,541.54** | $15,003.51 | **$50,538.04** |
| **What-if: part stocked locally** | **pull_now** | **$65,566.29** | $14,853.67 | **$50,712.62** |

### Full ranking  today
| Action | Cost avoided | Action cost | Net value |
|---|---:|---:|---:|
| **pull_now** | **$65,541.54** | $15,003.51 | **$50,538.04** |
| expedite_parts_and_run | $19,382.72 | $7,087.75 | $12,294.97 |
| run_to_shift_end | $940.30 | $80,015.54 | -$79,075.24 |

### Full ranking  if the part were stocked locally
| Action | Cost avoided | Action cost | Net value |
|---|---:|---:|---:|
| **pull_now** | **$65,566.29** | $14,853.67 | **$50,712.62** |
| expedite_parts_and_run | $38,800.35 | $4,027.45 | $34,772.90 |
| run_to_shift_end | $966.62 | $77,058.91 | -$76,092.28 |

### Bottom line
- **No change in recommendation:** the model still prefers **pull_now** in both cases.
- **What changes if the part is local:** **expedite_parts_and_run** becomes much more viable:
  - Net value rises from **$12.3K** to **$34.8K**
  - But it still trails **pull_now** by about **$15.9K** in net value.
- **Risk context:** LINE-04 is currently **critical**, with **0.87 failure risk** and **$38,280 immediate downtime exposure**.

If you want, I can turn the current recommendation into an approval-ready work order draft.
