# Volta Industrial — Downtime & Maintenance Rescue (FE Bar submission)

**Industry:** discrete manufacturing (heavy industrial equipment, 8 plants, ~1,200 connected lines).
**Customer problem:** a high-utilization run wore ~90 production lines toward failure. The nightly
report flags the risk *after* the shift, when an unplanned stop already costs **~$22K/hour**. The VP of
Manufacturing Ops (Sam Ortiz) has to decide, line by line, whether to **pull it now** for planned
maintenance, **run to shift end**, or **expedite the part and keep running**. Today that's a gut call.
**Exposure:** $3.52M downtime-at-risk, 90 critical lines, 160 open work orders (`mv_line_risk`).
**Two people have to say yes:** Sam runs the floor and asks *which play, for which line, now?* The
**Plant GM / CFO** funds the change and asks *what does it cost, and when does it pay back?* The build
answers both; the business case for the funder is below.

## The data journey (one integrated path, all on synthetic data)

```
raw parquet (Volume) ─▶ Lakeflow SDP: silver_* → gold_*  (read_files, MVs, ai_classify, ai_query embeddings)
                          │  Unity Catalog: one schema, metric view mv_line_risk, SP grants, lineage
                          ├─▶ gold_maintenance_outcomes (35K decisions) ─▶ MLflow failure_recommender
                          │      train_register → UC @prod → score_serve ─▶ gold_maintenance_recommendations
                          │                                └─▶ serving endpoint (+AI Gateway) ◀─ app what-if tool
                          ├─▶ Genie Agent "Volta Plant Floor" over gold + metric view (NL → SQL)
                          └─▶ Lakebase (synced tables, scale-to-zero) ─▶ Databricks App (AppKit + agent)
                                                       app agent LLM ─▶ Unity AI Gateway model service
                                                       approved work order ─▶ Lakebase write-back
```

Orchestration: job `volta_ml_refresh` = `refresh_pipeline` → `train_register` → `score_serve`.
Bundle-managed (`databricks.yml`); Genie, dashboard and gateway are scripted (`scripts/`).

## What I built on top of the AI Customer Challenge template

The template shipped a data generator, specs, a minimal bundle, and an app shell with stubbed tools.
It said "use the heuristic, ML optional". On top of that:

1. **Lakeflow pipeline (mine):** 10 SDP materialized views, raw → silver → gold, including an
   `ai_classify` note-risk signal and `ai_query` part embeddings. `gold_line_status` is the
   one-row-per-line spine.
2. **ML model replacing the heuristic (new for FE Bar):** `failure_recommender`, two XGBoost heads
   (cost avoided, action cost) tuned with Optuna. MLflow tracks the runs, and both heads plus a
   business rule are packaged as one pyfunc registered in UC as `@prod`. It batch-scores
   `gold_maintenance_recommendations` (the same contract the heuristic had, plus `model_version`)
   and is served on `volta-failure-recommender`, with AI Gateway usage tracking, an inference
   table and a per-user rate limit. The heuristic is kept as `gold_recommendations_heuristic`, as
   an auditable baseline.
3. **Genie Agent (mine):** a real Genie space over the governed gold tables and metric view, with
   instructions that map "LINE-04" to `LINE-0004` and explain that recommendations are ML-scored.
4. **New agent tool through governed serving (new for FE Bar):** `predict_action_value` lets the app's
   agent run live what-ifs against the served model ("what if the part were local?"). The agent's
   own LLM calls go through the Unity AI Gateway model service `volta_ai_gateway` (rate limits as
   the spend cap, plus an inference table).
5. **Lakebase + app action layer (mine):** synced tables, the app's investigate → rank → draft →
   approve → write-back arc, and approvals written to `app.work_orders_app`.

## Key decisions and trade-offs

Leakage-free features, calibration over R², an explicit lead-time rule, one model version for batch
and live, SP auth. Full table and the AI-assistant workflow (what it got wrong, how it was caught):
**`BUILD_NOTES.md`**.

## Results (from `evidence/ml_model_evidence.md`)

- Avoided-cost head: holdout RMSE **$22.0K**, **18.6% better** than the per-action historical mean.
  R² is 0.50, the expected ceiling for a 0-or-full-stop label. Calibration is what matters: the
  mean predicted vs actual avoided $ is within **1.5–12%** in every pull/expedite risk bucket
  (UC version 3, `@prod`). The cost head reaches **R² 0.991**.
- 155 at-risk lines scored: **126 pull_now / 29 expedite_parts_and_run / 0 run_to_shift_end**.
  Running to shift end never wins at these risk levels.
- **Hero LINE-0004** (risk 0.87, non-local part): **pull_now, net +$50.5K**, vs expedite +$12.3K and
  run −$79.1K. Live what-if: with a local part, expedite climbs to **+$34.8K** but still loses to
  pull_now. The model reproduces the `part_local` lever instead of having it hardcoded.
- **65.8% agreement** with the old heuristic. All 53 disagreements are high-risk lines (avg 0.80)
  with a *local* part, where the heuristic said expedite and the model says pull_now. The cause is the
  cost of a planned pull: the heuristic hardcoded **$40K**, but the history shows **~$15K**: the model
  corrected a hand-picked assumption with data.

## Business case for the funding executive (Plant GM / CFO)

From `evidence/business_case.md` (governed gold tables, one wear cycle = the current at-risk cohort):

| Per wear cycle | PLANT-03 pilot | Fleet (8 plants) |
|---|---|---|
| Downtime exposure at stake | $493K | $3.52M |
| Lines with a model-ranked play | 22 | 155 |
| Value of the model over today's rule | $38K | $587K (~$73K per plant) |
| Pilot investment (my estimate) | ~$25K | sized from pilot billing |

- **Payback:** at $22K/hour, the ~$25K pilot breaks even after **~1.1 hours of avoided unplanned
  downtime**. One avoided 4-hour stop ($88K) returns **3.5×** the pilot. The model's improvement over
  today's rule alone ($38K at PLANT-03) covers it within the first wear cycle.
- **Conservative by design:** the model-vs-status-quo number ($2.1M at PLANT-03) uses the history's
  4-hour stop length, so it is shown as an upper bound and not used for payback.
- **The ask:** a capped 30-day PLANT-03 pilot (Budgets + AI Gateway limits), go/no-go at
  downtime $ avoided ≥ 3× spend, then fund the rollout per plant from the measured payback.
- The $25K is an estimate (serverless compute, model serving, Lakebase, LLM tokens, integration
  effort). Confirm it with Databricks sizing, then from `system.billing.usage` after week 1.

## Why it matters beyond the plant floor

- **Volta's customers:** heavy-equipment buyers plan around delivery dates. An unplanned stop on a
  constrained line slips ship dates, which means late-delivery penalties and re-orders going to a
  competitor. Delivery reliability and uptime commitments are what win the next contract.
- **OEE and margin:** unplanned downtime hits OEE availability directly. A planned pull turns it into
  scheduled time, and avoids the overtime, expedite freight and "just in case" spares that erode
  plant margin.
- **Capital:** steadier lines defer buying spare capacity to cover for unreliable ones.
- The pilot therefore also tracks **OEE availability** at PLANT-03 and the **on-time ship rate** of
  orders sourced from its lines.

## Known limitations (and what I'd do next)

- **Exposure vs avoided units:** the exposure KPI assumes ~2 expected unplanned hours and counts only
  lines with risk ≥ 0.6. The outcome history values an avoided stop at ~4 hours across all 155
  at-risk lines. That's why total predicted avoided ($7.07M) exceeds the $3.52M exposure. The old
  heuristic had the same gap ($7.73M). Next step: reconcile both to the plant's real MTTR.
- The lead-time rule is an assumption (see above). Data is synthetic, so real accuracy is unproven.
- Scale-to-zero makes the first what-if after idle slow; app trace spans are blocked by egress.

## Evidence (text-readable, exported from the live workspace)

| File | Shows |
|---|---|
| `evidence/platform_run_evidence.md` | Pipeline COMPLETED + table row counts, metric view KPIs, SP grants, synced tables ONLINE, gateway, app RUNNING |
| `evidence/ml_model_evidence.md` | MLflow metrics + params, calibration, ML vs heuristic, UC `@prod`, endpoint + AI Gateway, smoke test, scored mix |
| `evidence/genie_qa.md` | 5 natural-language questions → Genie's SQL → result rows |
| `evidence/agent_whatif_log.md` | A real app agent turn calling `predict_action_value` → endpoint, with tool I/O |
| `evidence/authorship.md` | Template import vs my commits per component (pipeline, ML, Genie, agent tool), with GitHub logins |
| `evidence/business_case.md` | Per-plant and fleet value (ML vs old rule vs status quo) + the SQL behind it |

Code: `transformation/` (pipeline), `ml/` (model), `app/` (app + agent tools), `scripts/`, `databricks.yml`.
