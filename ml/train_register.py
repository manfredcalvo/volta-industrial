# Databricks notebook source
# MAGIC %md
# MAGIC # failure_recommender (1/2) — train → calibrate → register `@prod`
# MAGIC
# MAGIC Replaces the template's heuristic. Two XGBoost heads predict **avoided** $ and **cost** $ for a
# MAGIC (line situation, action); **net = avoided − cost** ranks the plays. `score_serve.py` serves it.
# MAGIC Decisions (rationale in `fe_bar/SUBMISSION.md`): **no leakage** (pre-decision features only);
# MAGIC **judged by calibration** (the label is a stochastic 0-or-full-stop outcome); an explicit, versioned
# MAGIC **lead-time rule** for non-local expedites, which the history can't teach.

# COMMAND ----------

# MAGIC %pip install -q xgboost==2.1.4 optuna==4.2.1 scikit-learn==1.5.2 "mlflow>=3.1" "databricks-sdk>=0.60"
# MAGIC %restart_python

# COMMAND ----------

import json

import mlflow
import numpy as np
import optuna
import pandas as pd
from databricks.sdk import WorkspaceClient
from mlflow.models import infer_signature
from sklearn.compose import ColumnTransformer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBRegressor

dbutils.widgets.text("catalog", "")
dbutils.widgets.text("schema", "")
dbutils.widgets.text("optuna_trials", "10")
FQ = f"{dbutils.widgets.get('catalog')}.{dbutils.widgets.get('schema')}"
N_TRIALS = int(dbutils.widgets.get("optuna_trials"))
MODEL_NAME = f"{FQ}.failure_recommender"
USER = spark.sql("SELECT current_user()").first()[0]
EXPERIMENT = f"/Users/{USER}/volta/failure_recommender"

ACTIONS = ["pull_now", "run_to_shift_end", "expedite_parts_and_run"]
CAT = ["action_type", "criticality", "machine_type"]
FEATURES = CAT + ["risk_at_action", "part_local"]
# Lead-time rule: a non-local part lands after the likely failure (partial avoidance) + air freight/day.
NONLOCAL_EXPEDITE_FEASIBILITY = 0.5
EXPEDITE_FREIGHT_USD_PER_LEAD_DAY = 1500.0

# COMMAND ----------

# MAGIC %md ## 1. Training data — `gold_maintenance_outcomes` (18 months, from the SDP pipeline)

# COMMAND ----------

hist = spark.table(f"{FQ}.gold_maintenance_outcomes").toPandas()
hist["part_local"] = hist["part_local"].astype(int)
X = hist[FEATURES]
X_tr, X_te, ya_tr, ya_te, yc_tr, yc_te = train_test_split(
    X, hist["downtime_cost_avoided_usd"].astype(float), hist["action_cost_usd"].astype(float),
    test_size=0.2, random_state=42, stratify=X["action_type"],
)
print(f"rows={len(hist):,} train={len(X_tr):,} test={len(X_te):,}")
display(hist.groupby("action_type")[["downtime_cost_avoided_usd", "action_cost_usd"]].mean().round(0))


def make_pipeline(**xgb) -> Pipeline:
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CAT)], remainder="passthrough")
    return Pipeline([("pre", pre), ("xgb", XGBRegressor(random_state=42, n_jobs=4, **xgb))])


def rmse(y, p) -> float:
    return float(np.sqrt(mean_squared_error(y, p)))

# COMMAND ----------

# MAGIC %md ## 2. Tune the avoided head (Optuna) + fit the cost head

# COMMAND ----------

mlflow.set_registry_uri("databricks-uc")
WorkspaceClient().workspace.mkdirs(f"/Users/{USER}/volta")
mlflow.set_experiment(EXPERIMENT)
X_fit, X_val, ya_fit, ya_val = train_test_split(X_tr, ya_tr, test_size=0.2, random_state=7)


def objective(trial: optuna.Trial) -> float:
    p = {
        "n_estimators": trial.suggest_int("n_estimators", 100, 500),
        "max_depth": trial.suggest_int("max_depth", 2, 6),
        "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.3, log=True),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 20),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
    }
    with mlflow.start_run(nested=True, run_name=f"trial-{trial.number}"):
        score = rmse(ya_val, make_pipeline(**p).fit(X_fit, ya_fit).predict(X_val))
        mlflow.log_params(p)
        mlflow.log_metric("val_rmse", score)
    return score


optuna.logging.set_verbosity(optuna.logging.WARNING)
with mlflow.start_run(run_name="failure_recommender") as parent:
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=N_TRIALS)
    avoided_model = make_pipeline(**study.best_params).fit(X_tr, ya_tr)
    cost_model = make_pipeline(n_estimators=300, max_depth=4, learning_rate=0.1).fit(X_tr, yc_tr)

    pa, pc = avoided_model.predict(X_te), cost_model.predict(X_te)
    pb = X_te["action_type"].map(X_tr.assign(y=ya_tr.values).groupby("action_type")["y"].mean())
    m = {
        "avoided_test_rmse": rmse(ya_te, pa),
        "avoided_test_mae": float(mean_absolute_error(ya_te, pa)),
        "avoided_test_r2": float(r2_score(ya_te, pa)),
        "avoided_baseline_rmse": rmse(ya_te, pb),  # per-action mean
        "cost_test_rmse": rmse(yc_te, pc),
        "cost_test_r2": float(r2_score(yc_te, pc)),
    }
    m["avoided_rmse_lift_vs_baseline_pct"] = round(100 * (1 - m["avoided_test_rmse"] / m["avoided_baseline_rmse"]), 1)
    mlflow.log_metrics(m)
    mlflow.log_params({f"best_{k}": v for k, v in study.best_params.items()})
    mlflow.log_params({"features": ",".join(FEATURES),
                       "nonlocal_expedite_feasibility": NONLOCAL_EXPEDITE_FEASIBILITY,
                       "expedite_freight_usd_per_lead_day": EXPEDITE_FREIGHT_USD_PER_LEAD_DAY})
    run_id = parent.info.run_id
print(json.dumps({"best_params": study.best_params, **{k: round(v, 3) for k, v in m.items()}}, indent=2))

# COMMAND ----------

# MAGIC %md ### Holdout calibration — predicted vs actual mean avoided $ per action × risk bucket

# COMMAND ----------

cal = X_te.assign(actual=ya_te.values, predicted=pa)
cal["risk_bucket"] = pd.cut(cal["risk_at_action"], [0.3, 0.5, 0.65, 0.8, 0.95], include_lowest=True).astype(str)
calib = (cal.groupby(["action_type", "risk_bucket"])
         .agg(n=("actual", "size"), actual_mean=("actual", "mean"), predicted_mean=("predicted", "mean"))
         .round(0).reset_index())
calib["abs_gap_pct"] = (100 * (calib.predicted_mean - calib.actual_mean).abs() / calib.actual_mean.clip(lower=1)).round(1)
display(calib)
with mlflow.start_run(run_id=run_id):
    mlflow.log_text(calib.to_csv(index=False), "evidence/calibration.csv")

# COMMAND ----------

# MAGIC %md ## 3. One pyfunc (both heads + lead-time rule) → UC → `@prod`

# COMMAND ----------

class FailureRecommender(mlflow.pyfunc.PythonModel):
    """(line situation, action) rows → avoided $, cost $, net $."""

    def __init__(self, avoided, cost, features, feasibility, freight_per_day):
        self.avoided, self.cost, self.features = avoided, cost, features
        self.feasibility, self.freight_per_day = feasibility, freight_per_day

    def predict(self, context, model_input: pd.DataFrame, params=None) -> pd.DataFrame:
        df = model_input.copy()
        df["part_local"] = df["part_local"].astype(int)
        lead = df["part_lead_time_days"].fillna(7).astype(float)
        avoided = np.clip(self.avoided.predict(df[self.features]), 0, None)
        cost = np.clip(self.cost.predict(df[self.features]), 0, None)
        nonlocal_exp = (df["action_type"] == "expedite_parts_and_run") & (df["part_local"] == 0)
        avoided = np.where(nonlocal_exp, avoided * self.feasibility, avoided)
        cost = np.where(nonlocal_exp, cost + lead * self.freight_per_day, cost)
        return pd.DataFrame({
            "action_type": df["action_type"].values,
            "predicted_downtime_cost_avoided_usd": np.round(avoided.astype(float), 2),
            "predicted_action_cost_usd": np.round(cost.astype(float), 2),
            "predicted_net_value_usd": np.round((avoided - cost).astype(float), 2),
        })


model = FailureRecommender(avoided_model, cost_model, FEATURES,
                           NONLOCAL_EXPEDITE_FEASIBILITY, EXPEDITE_FREIGHT_USD_PER_LEAD_DAY)
example = pd.DataFrame([{"action_type": a, "risk_at_action": 0.87, "part_local": False, "criticality": "high",
                         "machine_type": "Hydraulic_Press", "part_lead_time_days": 9.0} for a in ACTIONS])
with mlflow.start_run(run_id=run_id):
    info = mlflow.pyfunc.log_model(
        name="failure_recommender", python_model=model, input_example=example,
        signature=infer_signature(example, model.predict(None, example)),
        registered_model_name=MODEL_NAME,
        pip_requirements=["xgboost==2.1.4", "scikit-learn==1.5.2", "pandas", "numpy"],
    )
version = int(info.registered_model_version)
mlflow.MlflowClient().set_registered_model_alias(MODEL_NAME, "prod", version)
print(f"registered {MODEL_NAME} v{version} → @prod (run {run_id})")

# COMMAND ----------

dbutils.jobs.taskValues.set("model_version", version)
dbutils.notebook.exit(json.dumps({"model": MODEL_NAME, "model_version": version, "run_id": run_id,
                                  **{k: round(v, 3) for k, v in m.items()}}))
