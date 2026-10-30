"""Export the funding-executive business case (per plant + fleet) as text evidence.

Every value comes from the governed gold tables: exposure from gold_open_atrisk (the same
definition as mv_line_risk), and each line's net value under three policies, all priced by
the same failure_recommender model so they compare like-for-like:
  - ML pick (the model's recommended action)
  - old hand-coded rule (gold_recommendations_heuristic's pick)
  - status quo (run to shift end: the nightly report finds the risk after the shift)
Writes fe_bar/evidence/business_case.md.

Usage: python scripts/export_business_case.py --profile fevm-casaman-aws-stable --warehouse <id>
"""

import argparse
import datetime as dt
import pathlib

import pandas as pd
from databricks.sdk import WorkspaceClient

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--warehouse", required=True)
ap.add_argument("--catalog", default="casaman_aws_stable_catalog")
ap.add_argument("--schema", default="dev_manffred_calvosanchez_volta_industrial")
ap.add_argument("--out", default="fe_bar/evidence/business_case.md")
args = ap.parse_args()

w = WorkspaceClient(profile=args.profile)
FQ = f"{args.catalog}.{args.schema}"
RANK = "array<struct<action:string,predicted_downtime_cost_avoided_usd:double,action_cost_usd:double,net:double>>"


def net_of(pick: str) -> str:
    return f"aggregate(rk, 0D, (acc, x) -> acc + IF(x.action = {pick}, x.net, 0D))"


SQL = f"""
WITH r AS (
  SELECT a.plant_id, a.downtime_exposure_usd, m.recommended_action AS ml_pick,
         h.recommended_action AS rule_pick, from_json(m.action_ranking, '{RANK}') AS rk
  FROM {FQ}.gold_maintenance_recommendations m
  JOIN {FQ}.gold_open_atrisk a USING (line_id)
  JOIN {FQ}.gold_recommendations_heuristic h USING (line_id)),
v AS (
  SELECT plant_id, downtime_exposure_usd, ml_pick,
         {net_of('ml_pick')} AS ml_net, {net_of('rule_pick')} AS rule_net,
         {net_of("'run_to_shift_end'")} AS run_net
  FROM r)
SELECT coalesce(plant_id, 'FLEET (8 plants)') AS scope,
       COUNT(*) AS lines_ranked,
       SUM(IF(ml_pick = 'pull_now', 1, 0)) AS pull_now,
       CAST(SUM(downtime_exposure_usd) AS BIGINT) AS exposure_usd,
       CAST(SUM(ml_net - rule_net) AS BIGINT) AS ml_vs_old_rule_usd,
       CAST(SUM(ml_net - run_net) AS BIGINT) AS ml_vs_status_quo_usd
FROM v GROUP BY ROLLUP (plant_id) ORDER BY scope
"""
r = w.statement_execution.execute_statement(statement=SQL, warehouse_id=args.warehouse, wait_timeout="50s")
df = pd.DataFrame(r.result.data_array, columns=[c.name for c in r.manifest.schema.columns])

out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join([
    "# Business case evidence: value per plant and fleet (for the funding executive)",
    "",
    f"Exported {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M UTC} by `scripts/export_business_case.py` "
    "from the governed gold tables (one wear cycle: the current open at-risk cohort).",
    "",
    "- `exposure_usd`: downtime-at-risk, the governed KPI (risk × ~2 expected unplanned hours × $22K/hr).",
    "- `ml_vs_old_rule_usd`: the model's pick vs the old hand-coded rule's pick, both priced by the model. "
    "This is the value of the ML itself.",
    "- `ml_vs_status_quo_usd`: the model's pick vs running every line to shift end. It uses the outcome "
    "history's ~4h stop length, so it is an upper bound and is not used for payback.",
    "",
    df.to_markdown(index=False),
    "",
    "SQL:",
    "",
    "```sql", SQL.strip(), "```",
    "",
]))
print(f"wrote {out} ({out.stat().st_size:,} chars)")
print(df.to_string(index=False))
