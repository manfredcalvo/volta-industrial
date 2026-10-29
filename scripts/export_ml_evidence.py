"""Export the failure_recommender's real run output as compact, text-readable evidence.

Pulls everything from the workspace (nothing hand-written): the latest MLflow training run
(metrics, tuned params, the calibration + ML-vs-heuristic artifacts), the UC model version
behind @prod, the serving endpoint + its AI Gateway config, the endpoint smoke test, the scored
gold_maintenance_recommendations mix, and the endpoint's inference-table rows.
Writes fe_bar/evidence/ml_model_evidence.md.

Usage: python scripts/export_ml_evidence.py --profile fevm-casaman-aws-stable --warehouse <id>
"""

import argparse
import datetime as dt
import io
import json
import pathlib

import mlflow
import pandas as pd
from databricks.sdk import WorkspaceClient

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--warehouse", required=True)
ap.add_argument("--catalog", default="casaman_aws_stable_catalog")
ap.add_argument("--schema", default="dev_manffred_calvosanchez_volta_industrial")
ap.add_argument("--endpoint", default="volta-failure-recommender")
ap.add_argument("--out", default="fe_bar/evidence/ml_model_evidence.md")
args = ap.parse_args()

w = WorkspaceClient(profile=args.profile)
FQ = f"{args.catalog}.{args.schema}"
MODEL = f"{FQ}.failure_recommender"


def query(stmt: str) -> pd.DataFrame:
    r = w.statement_execution.execute_statement(statement=stmt, warehouse_id=args.warehouse, wait_timeout="50s")
    cols = [c.name for c in r.manifest.schema.columns]
    return pd.DataFrame(r.result.data_array or [], columns=cols)


mlflow.set_tracking_uri(f"databricks://{args.profile}")


def artifact(run_id: str, path: str) -> str:
    return mlflow.artifacts.load_text(f"runs:/{run_id}/{path}")


md = lambda df: df.to_markdown(index=False)  # noqa: E731

# Model version behind @prod → its training run.
mv = w.api_client.do("GET", f"/api/2.1/unity-catalog/models/{MODEL}/aliases/prod")
run_id = mv["run_id"]
run = w.api_client.do("GET", "/api/2.0/mlflow/runs/get", query={"run_id": run_id})["run"]
metrics = {m["key"]: round(m["value"], 3) for m in run["data"].get("metrics", [])}
params = {p["key"]: p["value"] for p in run["data"].get("params", [])}
result = json.loads(artifact(run_id, "evidence/result.json"))
calib = pd.read_csv(io.StringIO(artifact(run_id, "evidence/calibration.csv")))
# % gap is meaningless where the actual mean is $0 (run_to_shift_end never avoids a stop): show $.
calib["abs_gap_usd"] = (calib.predicted_mean - calib.actual_mean).abs().astype(int)
calib = calib.drop(columns="abs_gap_pct").astype({"actual_mean": int, "predicted_mean": int})
xtab = artifact(run_id, "evidence/ml_vs_heuristic.csv")
smoke = json.loads(artifact(run_id, "evidence/endpoint_smoke_test.json"))

ep = w.serving_endpoints.get(args.endpoint)
served = ep.config.served_entities[0]
gw = ep.ai_gateway

mix = query(f"""SELECT recommended_action, COUNT(*) AS lines,
  CAST(SUM(predicted_downtime_cost_avoided_usd) AS BIGINT) AS predicted_avoided_usd,
  CAST(SUM(predicted_net_value_usd) AS BIGINT) AS predicted_net_usd, MAX(model_version) AS model_version
  FROM {FQ}.gold_maintenance_recommendations GROUP BY 1 ORDER BY 2 DESC""")
hero = query(f"""SELECT r.line_id, a.failure_risk_score, a.part_local, r.recommended_action, r.action_ranking
  FROM {FQ}.gold_maintenance_recommendations r JOIN {FQ}.gold_open_atrisk a USING (line_id)
  WHERE r.line_id = '{result['hero_line']}'""")
try:
    inf = query(f"""SELECT date_format(request_time, 'yyyy-MM-dd HH:mm') AS request_time, status_code,
      requester, execution_duration_ms
      FROM {FQ}.volta_recommender_payload ORDER BY request_time DESC LIMIT 8""")
    inf_md = md(inf) if len(inf) else "_(table created; rows land on the gateway's batch schedule)_"
except Exception as e:  # noqa: BLE001 — table may not have materialized yet
    inf_md = f"_(not yet queryable: {str(e)[:120]})_"

lines = [
    "# failure_recommender — training, registration, serving, and scoring evidence",
    "",
    f"Exported {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M UTC} from the workspace by "
    "`scripts/export_ml_evidence.py` (MLflow run + artifacts, UC registry, serving endpoint, gold tables). "
    "Produced by the job `volta_ml_refresh` → `ml/train_register.py` + `ml/score_serve.py`.",
    "",
    "## Run result (notebook exit value)",
    "",
    "```json", json.dumps(result, indent=2), "```",
    "",
    f"## MLflow run `{run_id}`",
    "",
    "| metric | value |", "|---|---|",
    *[f"| {k} | {v} |" for k, v in sorted(metrics.items()) if not k.startswith("val_")],
    "",
    "Tuned (Optuna, TPE) avoided-head params: " + ", ".join(
        f"`{k[5:]}={v}`" for k, v in sorted(params.items()) if k.startswith("best_")),
    "",
    f"Features: `{params.get('features')}` · business constraint: non-local expedite feasibility "
    f"`{params.get('nonlocal_expedite_feasibility')}`, freight `${params.get('expedite_freight_usd_per_lead_day')}`/lead-day",
    "",
    "### Calibration on the 20% holdout (mean predicted vs actual avoided $)",
    "",
    md(calib),
    "",
    "### ML pick (columns) vs. old heuristic pick (rows), open at-risk lines",
    "",
    "```", xtab.strip(), "```",
    "",
    "## Unity Catalog registry",
    "",
    f"`{MODEL}` version **{mv['version']}** carries alias **@prod** (run `{run_id}`).",
    "",
    "## Serving endpoint + AI Gateway",
    "",
    f"- Endpoint `{ep.name}` — state ready=`{ep.state.ready.value}`, serves "
    f"`{served.entity_name}` v`{served.entity_version}` (workload `{served.workload_size}`, "
    f"scale_to_zero=`{served.scale_to_zero_enabled}`)",
    f"- AI Gateway usage tracking: `{gw.usage_tracking_config.enabled if gw and gw.usage_tracking_config else None}`",
    f"- AI Gateway inference table: `{FQ}.{gw.inference_table_config.table_name_prefix}_payload` "
    f"enabled=`{gw.inference_table_config.enabled}`" if gw and gw.inference_table_config else "- inference table: none",
    "- AI Gateway rate limits: " + (", ".join(
        f"{r.calls} calls/{r.renewal_period.value} per {r.key.value}" for r in (gw.rate_limits or [])) if gw else "none"),
    "",
    "### Endpoint smoke test (live invocation from the notebook, hero line)",
    "",
    "```json", json.dumps(smoke["predictions"], indent=2), "```",
    "",
    "## Batch output — `gold_maintenance_recommendations`",
    "",
    md(mix),
    "",
    md(hero),
    "",
    "## Endpoint inference table (AI Gateway payload logging)",
    "",
    inf_md,
    "",
]
out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(lines))
print(f"wrote {out} ({out.stat().st_size:,} chars)")
