# Databricks notebook source
# MAGIC %md
# MAGIC # failure_recommender (2/2) — batch-score → validate → serve behind AI Gateway
# MAGIC
# MAGIC Uses whatever version holds **`@prod`** (set by `train_register.py`), so scoring/serving can be
# MAGIC rerun without retraining. One artifact, two consumers:
# MAGIC - **batch** → overwrites `gold_maintenance_recommendations` (the table the app, Genie and the
# MAGIC   dashboard already read — same contract the heuristic had, plus `model_version`);
# MAGIC - **online** → serving endpoint `volta-failure-recommender` with AI Gateway (usage tracking,
# MAGIC   inference table, per-user rate limit), called live by the app agent's `predict_action_value` tool.

# COMMAND ----------

# MAGIC %pip install -q xgboost==2.1.4 scikit-learn==1.5.2 "mlflow>=3.1" "databricks-sdk>=0.60"
# MAGIC %restart_python

# COMMAND ----------

import json
import time

import mlflow
import pandas as pd
from databricks.sdk import WorkspaceClient
from databricks.sdk.errors import NotFound
from databricks.sdk.service.serving import (
    AiGatewayInferenceTableConfig, AiGatewayRateLimit, AiGatewayRateLimitKey,
    AiGatewayRateLimitRenewalPeriod, AiGatewayUsageTrackingConfig, EndpointCoreConfigInput,
    ServedEntityInput,
)

dbutils.widgets.text("catalog", "")
dbutils.widgets.text("schema", "")
dbutils.widgets.text("endpoint_name", "volta-failure-recommender")
dbutils.widgets.text("hero_line", "LINE-0004")
dbutils.widgets.dropdown("scale_to_zero", "true", ["true", "false"])
CATALOG, SCHEMA = dbutils.widgets.get("catalog"), dbutils.widgets.get("schema")
FQ = f"{CATALOG}.{SCHEMA}"
MODEL_NAME = f"{FQ}.failure_recommender"
ENDPOINT = dbutils.widgets.get("endpoint_name")
HERO = dbutils.widgets.get("hero_line")
SCALE_TO_ZERO = dbutils.widgets.get("scale_to_zero") == "true"
ACTIONS = ["pull_now", "run_to_shift_end", "expedite_parts_and_run"]
INPUTS = ["action_type", "criticality", "machine_type", "risk_at_action", "part_local", "part_lead_time_days"]

mlflow.set_registry_uri("databricks-uc")
mv = mlflow.MlflowClient().get_model_version_by_alias(MODEL_NAME, "prod")
version, run_id = int(mv.version), mv.run_id
w = WorkspaceClient()
print(f"{MODEL_NAME}@prod = v{version} (run {run_id})")

# COMMAND ----------

# MAGIC %md ## 1. Batch-score the three candidate actions for every open at-risk line

# COMMAND ----------

prod = mlflow.pyfunc.load_model(f"models:/{MODEL_NAME}@prod")
lines = spark.table(f"{FQ}.gold_open_atrisk").toPandas()
cand = (lines.merge(pd.DataFrame({"action_type": ACTIONS}), how="cross")
        .rename(columns={"failure_risk_score": "risk_at_action"}).reset_index(drop=True))
scored = pd.concat([cand[["line_id"]], prod.predict(cand[INPUTS]).reset_index(drop=True)], axis=1)


def usd(x) -> float:
    return round(float(x), 2)


def rank(g: pd.DataFrame) -> pd.Series:
    g = g.sort_values("predicted_net_value_usd", ascending=False)
    top = g.iloc[0]
    return pd.Series({
        "recommended_action": top.action_type,
        "predicted_downtime_cost_avoided_usd": usd(top.predicted_downtime_cost_avoided_usd),
        "predicted_net_value_usd": usd(top.predicted_net_value_usd),
        "action_ranking": json.dumps([
            {"action": r.action_type, "predicted_downtime_cost_avoided_usd": usd(r.predicted_downtime_cost_avoided_usd),
             "action_cost_usd": usd(r.predicted_action_cost_usd), "net": usd(r.predicted_net_value_usd)}
            for r in g.itertuples()]),
    })


recs = scored.groupby("line_id").apply(rank).reset_index()
recs["model_version"] = version
recs["scored_at"] = pd.Timestamp.utcnow()
(spark.createDataFrame(recs).write.mode("overwrite").option("overwriteSchema", "true")
 .saveAsTable(f"{FQ}.gold_maintenance_recommendations"))
spark.sql(f"COMMENT ON TABLE {FQ}.gold_maintenance_recommendations IS "
          f"'Ranked maintenance action per open at-risk line, scored by {MODEL_NAME} v{version} (@prod).'")
display(recs.groupby("recommended_action").agg(lines=("line_id", "size"),
                                               avoided_usd=("predicted_downtime_cost_avoided_usd", "sum")))

# COMMAND ----------

# MAGIC %md ## 2. Validate — hero line, action mix, and the model vs the old heuristic baseline

# COMMAND ----------

hero = recs.set_index("line_id").loc[HERO]
heur = spark.table(f"{FQ}.gold_recommendations_heuristic").select("line_id", "recommended_action").toPandas()
cmp = recs.merge(heur, on="line_id", suffixes=("_ml", "_heuristic"))
agreement = float((cmp.recommended_action_ml == cmp.recommended_action_heuristic).mean())
crosstab = pd.crosstab(cmp.recommended_action_heuristic, cmp.recommended_action_ml)
display(crosstab)
print(f"hero {HERO}: {hero.recommended_action}  ranking={hero.action_ranking}")
print(f"ML vs heuristic agreement: {agreement:.1%}")
assert hero.recommended_action == "pull_now", "hero must rank pull_now (high risk, non-local part)"
assert recs.recommended_action.nunique() > 1, "action mix collapsed to one type"

# COMMAND ----------

# MAGIC %md ## 3. Serve `@prod` — create/roll the endpoint, then apply AI Gateway governance

# COMMAND ----------

served = [ServedEntityInput(name="failure_recommender", entity_name=MODEL_NAME, entity_version=str(version),
                            workload_size="Small", scale_to_zero_enabled=SCALE_TO_ZERO)]
t0 = time.time()
try:
    current = w.serving_endpoints.get(ENDPOINT).config.served_entities[0].entity_version
    if current != str(version):
        w.serving_endpoints.update_config_and_wait(name=ENDPOINT, served_entities=served)
    action = f"rolled v{current} → v{version}" if current != str(version) else f"already on v{version}"
except NotFound:
    w.serving_endpoints.create_and_wait(name=ENDPOINT, config=EndpointCoreConfigInput(name=ENDPOINT, served_entities=served))
    action = f"created on v{version}"

gw = w.serving_endpoints.put_ai_gateway(
    name=ENDPOINT,
    usage_tracking_config=AiGatewayUsageTrackingConfig(enabled=True),
    inference_table_config=AiGatewayInferenceTableConfig(
        enabled=True, catalog_name=CATALOG, schema_name=SCHEMA, table_name_prefix="volta_recommender"),
    rate_limits=[AiGatewayRateLimit(calls=120, key=AiGatewayRateLimitKey.USER,
                                    renewal_period=AiGatewayRateLimitRenewalPeriod.MINUTE)],
)
print(f"endpoint {ENDPOINT}: {action} ({time.time() - t0:.0f}s)")
print(json.dumps(gw.as_dict(), indent=2))

# COMMAND ----------

# MAGIC %md ### Smoke test — the live endpoint must rank the hero exactly like the batch table

# COMMAND ----------

h = lines.set_index("line_id").loc[HERO]
records = [{"action_type": a, "risk_at_action": float(h.failure_risk_score), "part_local": bool(h.part_local),
            "criticality": h.criticality, "machine_type": h.machine_type,
            "part_lead_time_days": float(h.part_lead_time_days)} for a in ACTIONS]
live = w.api_client.do("POST", f"/serving-endpoints/{ENDPOINT}/invocations",
                       body={"dataframe_records": records})["predictions"]
print(json.dumps(live, indent=2))
assert max(live, key=lambda r: r["predicted_net_value_usd"])["action_type"] == hero.recommended_action

# COMMAND ----------

client = mlflow.MlflowClient()
metrics = client.get_run(run_id).data.metrics
result = {
    "model": MODEL_NAME, "model_version": version, "endpoint": ENDPOINT, "run_id": run_id,
    "avoided_test_rmse": round(metrics["avoided_test_rmse"], 1),
    "avoided_rmse_lift_vs_baseline_pct": metrics["avoided_rmse_lift_vs_baseline_pct"],
    "cost_test_r2": round(metrics["cost_test_r2"], 3), "lines_scored": int(len(recs)),
    **{f"{a}_recommended": int((recs.recommended_action == a).sum()) for a in ACTIONS},
    "hero_line": HERO, "hero_action": hero.recommended_action, "ml_vs_heuristic_agreement": round(agreement, 3),
}
client.log_text(run_id, crosstab.to_csv(), "evidence/ml_vs_heuristic.csv")
client.log_dict(run_id, {"request": records, "predictions": live}, "evidence/endpoint_smoke_test.json")
client.log_dict(run_id, result, "evidence/result.json")
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
