"""Deploy the non-bundle workspace assets into a target catalog/schema/warehouse.

Creates (or replaces) the metric view `mv_line_risk`, then creates the Genie space and the
AI/BI dashboard from the committed definitions. The repo files are authored against the
original build catalog; this script rewrites that FQN to the target so one definition serves
every workspace.

Usage:
  python scripts/deploy_semantic_layer.py --profile fevm-casaman-aws-stable \
      --catalog casaman_aws_stable_catalog --warehouse d9ce200bcd25d8a2 [--only mv|genie|dashboard]
Prints the created ids as JSON (paste them into app/app.yaml + resources.json).
"""

import argparse
import json
import pathlib

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.dashboards import Dashboard
from databricks.sdk.service.sql import StatementState

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE_FQ = "serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial"

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--catalog", required=True)
ap.add_argument("--schema", default="dev_manffred_calvosanchez_volta_industrial")
ap.add_argument("--warehouse", required=True)
ap.add_argument("--only", choices=["mv", "genie", "dashboard"])
args = ap.parse_args()

w = WorkspaceClient(profile=args.profile)
fq = f"{args.catalog}.{args.schema}"
out: dict = {}


def sql(stmt: str) -> None:
    r = w.statement_execution.execute_statement(statement=stmt, warehouse_id=args.warehouse, wait_timeout="50s")
    if r.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"{r.status.state}: {r.status.error.message if r.status.error else ''}")


if args.only in (None, "mv"):
    # Drop the optional materialization block (needs serverless MV refresh; not required here).
    yaml_body = (ROOT / "metric_view.yaml").read_text().replace(SOURCE_FQ, fq)
    yaml_body = yaml_body.split("\nmaterialization:")[0]
    yaml_body = "\n".join(l for l in yaml_body.splitlines() if not l.startswith("#"))
    sql(f"CREATE OR REPLACE VIEW {fq}.mv_line_risk WITH METRICS LANGUAGE YAML AS $$\n{yaml_body}\n$$")
    out["metric_view"] = f"{fq}.mv_line_risk"

if args.only in (None, "genie"):
    spec = json.loads((ROOT / "genie_space.json").read_text())
    space = spec["serialized_space"].replace(SOURCE_FQ, fq)
    created = w.genie.create_space(
        warehouse_id=args.warehouse,
        serialized_space=space,
        title=spec["title"],
        description=spec["description"],
    )
    out["genie_space_id"] = created.space_id

if args.only in (None, "dashboard"):
    body = (ROOT / "dashboard.lvdash.json").read_text().replace(SOURCE_FQ, fq)
    me = w.current_user.me().user_name
    d = w.lakeview.create(Dashboard(
        display_name="Volta Plant Floor — Downtime & Maintenance",
        serialized_dashboard=body,
        warehouse_id=args.warehouse,
        parent_path=f"/Users/{me}",
    ))
    w.lakeview.publish(d.dashboard_id, warehouse_id=args.warehouse, embed_credentials=True)
    out["dashboard_id"] = d.dashboard_id

print(json.dumps(out, indent=2))
