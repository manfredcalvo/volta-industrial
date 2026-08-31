# Build 2 — Volta Plant Floor agent app (submission2)

The AI agent's **investigate → rank (what-if) → draft → approve → write-back** arc,
running on Databricks Apps over governed Lakebase data. All exports are from real
app activity in the deployed app (`volta-plant-floor`), backed by the Lakebase
`app.*` schema and the SQL-warehouse-backed live view.

## Evidence → file map

| # | Evidence | File |
|---|----------|------|
| 1 | Writable Postgres action table (proposed action, approval status + approver, created + committed timestamps) | `writeback_table.json` — `app.work_orders_app`, 1 approved `pull_now` work order for LINE-0928 |
| 2 | Lakebase workflow-state / observability (trigger events + recorded decisions + timestamps) | `state_table.json` — `app.conversations` + `app.messages` interaction events (user triggers, assistant decisions, tool calls) + the committed work-order audit entry |
| 3 | Query backing the live view + returned rows | `view_query.sql` + `view_result.json` — the Operations line-queue view (`GET /api/lines`), top 50 of 1,200 lines by downtime exposure |
| 4 | Assistant interaction log (request + model response) — ≥1 explanation and ≥1 what-if | `assist_log.jsonl` — a what-if run (LINE-0928: ranked net values via `rank_maintenance_actions`), an explanation run (LINE-04 drivers), and the approval/action turn |
| 5 | Auto-drafted memo/note/summary | `drafted_sample.md` — the agent's preventive-maintenance work-order memo (committed `app.work_orders_app.drafted_wo`) |
| 6 | Hero question + linked record IDs (decision chain across exports) | `hero_question.txt` — LINE-0928 → PLANT-08 → PART-00079 → `pull_now` → work order `4952bea5-…` |
| 7 | Git history (`git log --graph --oneline --decorate --all`) | `git_history.txt` — the `build2-app` development branch off `main`, layer-by-layer |
| + | Search retrieves from the **Build-1 Lakebase Search index** (not a separate store) | `search_construct.md` (tie-together); `build_as_code/lakebase_search_setup.sql` (index construct) + `build_as_code/app_search_parts.sql` (the app's retrieval query + SP grant); `execution_evidence/lakebase_search_indexes.json` (the `parts_search_bm25`/`parts_search_ann` indexes) + `execution_evidence/search_execution.json` (live `search_parts` run); `search_query.txt` + `search_result.json` |

## Build-as-code + execution evidence (Build-1 layout)

| Requirement | Build construct | Execution evidence |
|---|---|---|
| App **retrieves from the Build-1 Lakebase Search index**, not a separate store | `build_as_code/lakebase_search_setup.sql` (the `parts_search` + `lakebase_bm25`/`lakebase_ann` index) + `build_as_code/app_search_parts.sql` (the app's BM25 retrieval query against `parts_search`) | `execution_evidence/lakebase_search_indexes.json` (indexes present, 800 rows) + `execution_evidence/search_execution.json` (live `search_parts` run) + `search_query.txt`/`search_result.json` |

## Decision chain (one coherent thread across the exports)

Operator asks the hero question → the agent finds the worst at-risk line **LINE-0928**
(top of `view_result.json`), explains the drivers and ranks the maintenance actions with
net values (`assist_log.jsonl` what-if), drafts a work order (`drafted_sample.md`), and on
approval writes it to the app-owned action table (`writeback_table.json`, work order
`4952bea5-a0ba-4337-83d2-0030e8b87283`, status `approved`), with the trigger events and
recorded/committed decisions captured in `state_table.json`.

## Notes
- All agent → Databricks calls run as the app **service principal** (model serving, Genie,
  Lakebase), with the endpoint / Genie space / experiment bound as app resources.
- MLflow trace **metadata** records to the bound experiment; trace **span data** upload is
  blocked by this workspace's Apps egress to the managed storage host (`ECONNREFUSED`) — a
  workspace networking setting, independent of the app.
