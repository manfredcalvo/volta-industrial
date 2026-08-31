# Build 1 — Lakebase evidence (submission1)

Volta Industrial (Downtime & Maintenance Rescue). Lakebase project (instance): **volta-plant-floor**
(Autoscaling, PG 17). All resources are bundle-managed in `databricks.yml` (`postgres_projects`,
`postgres_synced_tables`).

| # | Requirement | Files |
|---|---|---|
| 1 | Instance name + connectivity check (`SELECT version()`) | `connectivity_check.txt` |
| 2 | Query against synced UC table + non-empty rows | `synced_table.sql`, `synced_table_result.json` |
| 3 | Reverse-synced UC Delta sample (SCD2 + system metadata) | `reverse_sync_README.md` (UI step pending), `reverse_sync_sample.json` |
| 4 | Dev branch off root + changes/forecasting | `branch.txt` |
| 5 | Coding-agent schema/data change + authorship + validation + promotion | `agent_change/` (`.sql`, `.diff`, `promotion_evidence.txt`, `validation_result.json`) |
| — | **Execution evidence** (schema+keys ran; writable table distinct from read-only synced) | `build1_execution.ipynb` (executed, with outputs) + `execution_evidence/` (`schema_and_keys.json`, `relational_join_result.json`, `writable_vs_synced.json`) |
| 6 | Lakebase Search NL query + records | `search_query.txt`, `search_result.json` |
| 7 | Representative business question + query + result | `core_question.txt`, `core_query.sql`, `core_query_result.json` |
| 8 | Git history (`git log --graph --oneline --decorate --all`) w/ branch + merge | `git_history.txt` |

## How the pieces connect
`raw_*` parquet → SDP pipeline (silver + gold, `ai_classify`) → governed gold tables →
`postgres_synced_tables` (SNAPSHOT) mirror into Lakebase → `parts_search` + Lakebase Search
(`lakebase_bm25` + `lakebase_ann`, RRF hybrid). A Lakebase `dev` branch (copy-on-write off
`production`) was used to develop the `next_shift_forecast` migration in isolation, validated,
then promoted to `production`; the same change is tracked on a git `dev` branch merged into `main`.
