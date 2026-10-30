# Volta Industrial: Downtime & Maintenance Rescue

A governed AI decision for discrete manufacturing, built end to end on Databricks. A high-utilization
run wore ~90 production lines across 8 plants toward failure: **$3.52M** of downtime exposure, with
unplanned stops costing **~$22K/hour**. For every at-risk line, the solution ranks the three plays
(**pull now**, **run to shift end**, **expedite the part and run**) by predicted net dollars. The VP of
Manufacturing Ops approves in one click, and the work order writes back.

Built on top of the Tech Summit AI Customer Challenge template; the original workshop instructions
are in [`specifications/WORKSHOP_README.md`](specifications/WORKSHOP_README.md).

## Start here

| | |
|---|---|
| [`fe_bar/SUBMISSION.md`](fe_bar/SUBMISSION.md) | Problem, both audiences (VP Mfg Ops and the funding Plant GM/CFO), the data journey, what I built on top, results, business case, limitations |
| [`fe_bar/BUILD_NOTES.md`](fe_bar/BUILD_NOTES.md) | Design decisions and trade-offs; how the AI coding assistant was steered and checked |
| [`fe_bar/evidence/`](fe_bar/evidence/) | Run evidence exported from the live workspace: platform run, ML model, Genie Q&A, agent what-if, business case |
| [`deck/volta_fe_bar_deck.pdf`](deck/volta_fe_bar_deck.pdf) | The customer presentation |

## The build

| Stage | Where |
|---|---|
| Lakeflow Declarative Pipeline: raw → silver → gold (`read_files`, MVs, `ai_classify`, `ai_query`) | [`transformation/`](transformation/) |
| ML: `failure_recommender` (two XGBoost heads, Optuna, MLflow, UC `@prod`) → batch scores + serving endpoint with AI Gateway | [`ml/train_register.py`](ml/train_register.py), [`ml/score_serve.py`](ml/score_serve.py) |
| Unity Catalog metric view `mv_line_risk` (one KPI definition) | [`metric_view.yaml`](metric_view.yaml) |
| Genie space over the governed gold tables | [`genie_space.json`](genie_space.json) |
| Lakebase: synced tables, Lakebase Search, reverse sync | [`databricks.yml`](databricks.yml), [`lakebase_search_setup.sql`](lakebase_search_setup.sql), [`reverse_sync_cdf.sh`](reverse_sync_cdf.sh) |
| App agent tools, incl. the live ML what-if `predict_action_value` | [`app/server/agent/plantfloor.ts`](app/server/agent/plantfloor.ts), [`app/server/agent/tools/recommender.ts`](app/server/agent/tools/recommender.ts) |
| Unity AI Gateway model service (rate limits, inference table) | [`scripts/create_ai_gateway_model_service.sh`](scripts/create_ai_gateway_model_service.sh) |
| Everything as code (bundle + jobs) | [`databricks.yml`](databricks.yml) |

## Run it

```bash
databricks bundle deploy -t casaman --profile <profile>
databricks bundle run volta_setup -t casaman --profile <profile>        # synthetic raw data
databricks bundle run volta_ml_refresh -t casaman --profile <profile>   # pipeline → train → score → serve
python scripts/deploy_semantic_layer.py --profile <profile> --catalog <catalog> --warehouse <id>
bash scripts/create_ai_gateway_model_service.sh --profile <profile>
databricks bundle deploy -t casaman --profile <profile>                 # synced tables + app
databricks bundle run volta_app -t casaman --profile <profile>
```

All data is synthetic (`data_generation/generate_data.py`). The `submission1-3/` folders are the
earlier challenge-stage evidence.
