# Build-as-code constructs (with execution evidence)

Infrastructure defined as code (not UI). Live execution evidence is in `../execution_evidence/`.

| Requirement | Code construct (here) | Execution evidence |
|---|---|---|
| **Sync defined as code (DAB), not UI** | `databricks.yml` → `resources.postgres_synced_tables` (line_status, open_atrisk, maintenance_recommendations, parts — SNAPSHOT, PK) | `../execution_evidence/synced_tables_status.json` (all `SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE`) |
| **Reverse sync as code, not UI** | `reverse_sync_cdf.sh` (`databricks postgres create-cdf-config …`) | `../execution_evidence/cdf_config.json` + `../reverse_sync_sample.json` (lb_work_orders_history) |
| **Scale-to-zero configured** | `databricks.yml` → `resources.postgres_projects.volta_lakebase.default_endpoint_settings` (`autoscaling_limit_min_cu: 0.5`, `suspend_timeout_duration: 300s`) | `../execution_evidence/scale_to_zero_config.json` (live project shows min 0.5 CU, 300s auto-suspend) |
| **Lakebase Search (hybrid vector + full-text) over a text column** | `lakebase_search_setup.sql` (`CREATE EXTENSION lakebase_vector/lakebase_text`; `lakebase_ann` on `embedding`; `lakebase_bm25` on `body_tsv` from `search_text`) | `../execution_evidence/lakebase_search_indexes.json` (indexes + text cols) + `../search_result.json` (RRF hybrid results) |

Deploy the DAB with:
`databricks bundle deploy -t dev --var="catalog=serverless_stable_casaman_catalog" --profile <profile>`
