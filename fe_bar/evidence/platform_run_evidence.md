# Platform run evidence — Lakeflow → Unity Catalog → Lakebase → AI Gateway → App

Exported 2026-10-29 23:41 UTC from workspace `https://fevm-casaman-aws-stable.cloud.databricks.com` by `scripts/export_platform_evidence.py` (live API + SQL reads, nothing hand-written).

## Lakeflow Spark Declarative Pipeline

`[dev manffred_calvosanchez] [Workshop] Volta Plant Floor — SDP` (`c0613336-1b7a-4f70-96b4-e79f13c39e6b`) — serverless, all materialized views over `read_files()` of the raw parquet Volume. Last update `9d4dcba4-7033-4e95-9eea-c29d5db3440e`: **COMPLETED** (created 2026-10-29 23:23 UTC).

| table_name                       |    rows |
|:---------------------------------|--------:|
| silver_telemetry                 | 3405400 |
| silver_work_orders               |    1200 |
| silver_risk                      |    2375 |
| silver_maintenance               |   35000 |
| note_risk_flags                  |       7 |
| gold_line_status                 |    1200 |
| gold_open_atrisk                 |     155 |
| gold_maintenance_outcomes        |   35000 |
| gold_parts                       |     800 |
| gold_recommendations_heuristic   |     155 |
| gold_maintenance_recommendations |     155 |

## Unity Catalog — governed metric view `mv_line_risk` (one KPI definition for dashboard, Genie, app)

|   downtime_exposure_usd |   critical_lines |   atrisk_lines |   open_work_orders |
|------------------------:|-----------------:|---------------:|-------------------:|
|                 3520660 |               90 |             94 |                160 |

App service principal `ff340671-a03b-43b6-a384-72948fd1ab12` read access on the schema:

| privilege_type   | securable                                         |
|:-----------------|:--------------------------------------------------|
| SELECT           | SCHEMA dev_manffred_calvosanchez_volta_industrial |
| USE_SCHEMA       | SCHEMA dev_manffred_calvosanchez_volta_industrial |

## Lakebase (Autoscaling Postgres `volta-plant-floor`, scale-to-zero) — synced tables from gold

| synced_table                | state                                 | last_sync_end       | uc_state   |
|:----------------------------|:--------------------------------------|:--------------------|:-----------|
| line_status                 | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 2026-10-29T22:58:53 | ACTIVE     |
| open_atrisk                 | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 2026-10-29T22:58:47 | ACTIVE     |
| maintenance_recommendations | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 2026-10-29T22:58:56 | ACTIVE     |
| parts                       | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 2026-10-29T22:58:51 | ACTIVE     |

## Unity AI Gateway model service — fronts the app agent's LLM

`casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.volta_ai_gateway` → `models/system.ai.databricks-gpt-5-4`; inference table `casaman_aws_stable_catalog.dev_manffred_calvosanchez_volta_industrial.volta_gw_inference_payload`; rate limits:

- RATE_LIMIT_KEY_SERVICE: requests=200 / RATE_LIMIT_RENEWAL_PERIOD_MINUTE
- RATE_LIMIT_KEY_SERVICE: tokens=500000 / RATE_LIMIT_RENEWAL_PERIOD_MINUTE
- RATE_LIMIT_KEY_USER_DEFAULT: requests=60 / RATE_LIMIT_RENEWAL_PERIOD_MINUTE
- RATE_LIMIT_KEY_USER_DEFAULT: tokens=100000 / RATE_LIMIT_RENEWAL_PERIOD_MINUTE

## Databricks App

`volta-plant-floor` — app `RUNNING`, compute `ACTIVE`, deployment `SUCCEEDED` at https://volta-plant-floor-7474646266725179.aws.databricksapps.com. Bound resources: `sql-warehouse`, `serving-endpoint`, `recommender-endpoint`, `genie-space`, `postgres`
