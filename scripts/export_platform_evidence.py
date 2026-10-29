"""Export end-to-end platform run evidence (everything except the ML detail) as readable text.

Lakeflow pipeline last update + per-table row counts, UC governance (metric view headline, the
app service principal's grants), Lakebase synced tables + the app's write-back table, the AI
Gateway model service that fronts the agent LLM, and the deployed app. Writes
fe_bar/evidence/platform_run_evidence.md.

Usage: python scripts/export_platform_evidence.py --profile fevm-casaman-aws-stable --warehouse <id>
"""

import argparse
import datetime as dt
import json
import pathlib
import subprocess

import pandas as pd
from databricks.sdk import WorkspaceClient

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--warehouse", required=True)
ap.add_argument("--catalog", default="casaman_aws_stable_catalog")
ap.add_argument("--schema", default="dev_manffred_calvosanchez_volta_industrial")
ap.add_argument("--app", default="volta-plant-floor")
ap.add_argument("--out", default="fe_bar/evidence/platform_run_evidence.md")
args = ap.parse_args()

w = WorkspaceClient(profile=args.profile)
FQ = f"{args.catalog}.{args.schema}"


def query(stmt: str) -> pd.DataFrame:
    r = w.statement_execution.execute_statement(statement=stmt, warehouse_id=args.warehouse, wait_timeout="50s")
    if r.status.error:
        raise RuntimeError(r.status.error.message)
    return pd.DataFrame(r.result.data_array or [], columns=[c.name for c in r.manifest.schema.columns])


def cli(*a) -> dict:
    return json.loads(subprocess.check_output(["databricks", *a, "--profile", args.profile, "-o", "json"]))


md = lambda df: df.to_markdown(index=False)  # noqa: E731

pipe = next(p for p in w.pipelines.list_pipelines(filter="name LIKE '%Volta Plant Floor%'"))
upd = w.pipelines.list_updates(pipe.pipeline_id, max_results=1).updates[0]
tables = ["silver_telemetry", "silver_work_orders", "silver_risk", "silver_maintenance", "note_risk_flags",
          "gold_line_status", "gold_open_atrisk", "gold_maintenance_outcomes", "gold_parts",
          "gold_recommendations_heuristic", "gold_maintenance_recommendations"]
counts = query(" UNION ALL ".join(f"SELECT '{t}' AS table_name, COUNT(*) AS rows FROM {FQ}.{t}" for t in tables))
kpi = query(f"""SELECT CAST(MEASURE(downtime_exposure) AS BIGINT) AS downtime_exposure_usd, MEASURE(critical_count) AS critical_lines,
  MEASURE(atrisk_count) AS atrisk_lines, MEASURE(open_work_orders) AS open_work_orders FROM {FQ}.mv_line_risk""")

app = w.apps.get(args.app)
sp = app.service_principal_client_id
grants = query(f"""SELECT privilege_type, 'SCHEMA {args.schema}' AS securable FROM {args.catalog}.information_schema.schema_privileges
  WHERE grantee = '{sp}' AND schema_name = '{args.schema}'""")

synced = []
for name in ["line_status", "open_atrisk", "maintenance_recommendations", "parts"]:
    st = cli("postgres", "get-synced-table", f"synced_tables/{FQ}.{name}")
    status = st.get("status", {})
    synced.append({"synced_table": name, "state": status.get("detailed_state"),
                   "last_sync_end": status.get("last_sync", {}).get("sync_end_time", "")[:19],
                   "uc_state": status.get("unity_catalog_provisioning_state")})

gw = cli("ai-gateway", "get-model-service", f"model-services/{FQ}.volta_ai_gateway")
cfg = gw.get("config", {})

lines = [
    "# Platform run evidence — Lakeflow → Unity Catalog → Lakebase → AI Gateway → App",
    "",
    f"Exported {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M UTC} from workspace `{w.config.host}` "
    "by `scripts/export_platform_evidence.py` (live API + SQL reads, nothing hand-written).",
    "",
    "## Lakeflow Spark Declarative Pipeline",
    "",
    f"`{pipe.name}` (`{pipe.pipeline_id}`) — serverless, all materialized views over `read_files()` of the raw "
    f"parquet Volume. Last update `{upd.update_id}`: **{upd.state.value}** "
    f"(created {dt.datetime.fromtimestamp(upd.creation_time / 1000, dt.timezone.utc):%Y-%m-%d %H:%M UTC}).",
    "",
    md(counts),
    "",
    "## Unity Catalog — governed metric view `mv_line_risk` (one KPI definition for dashboard, Genie, app)",
    "",
    md(kpi),
    "",
    f"App service principal `{sp}` read access on the schema:",
    "",
    md(grants) if len(grants) else "_(grants not visible via information_schema)_",
    "",
    "## Lakebase (Autoscaling Postgres `volta-plant-floor`, scale-to-zero) — synced tables from gold",
    "",
    md(pd.DataFrame(synced)),
    "",
    "## Unity AI Gateway model service — fronts the app agent's LLM",
    "",
    f"`{gw['name'].split('/')[-1]}` → `{cfg['routing']['destinations'][0]['pay_per_token_config']['model']}`; "
    f"inference table `{cfg.get('inference_table', {}).get('table', '').split('/')[-1]}`; rate limits:",
    "",
    *[f"- {r['key']}: " + ", ".join(f"{k}={r[k]}" for k in ("requests", "tokens") if k in r) + f" / {r['renewal_period']}"
      for r in cfg.get("rate_limits", [])],
    "",
    "## Databricks App",
    "",
    f"`{app.name}` — app `{app.app_status.state.value}`, compute `{app.compute_status.state.value}`, "
    f"deployment `{app.active_deployment.status.state.value}` at {app.url}. Bound resources: "
    + ", ".join(f"`{r.name}`" for r in app.resources or []),
    "",
]
out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(lines))
print(f"wrote {out} ({out.stat().st_size:,} chars)")
