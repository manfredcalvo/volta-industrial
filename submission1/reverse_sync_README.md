# Item 3 — Reverse Lakehouse Sync as CODE (Lakebase Change Data Feed → UC Delta) ✅ DONE

**Mechanism:** Lakebase **Change Data Feed (CDF)** — captures every insert/update/delete on writable
Postgres tables from the WAL and writes them to a Unity Catalog Delta table `lb_<table>_history`
(~15s flush) with system-metadata columns `_pg_change_type` (insert / delete / update_preimage /
update_postimage), `_pg_lsn`, `_pg_xid`, `_timestamp`, `_sort_by`.
Ref: https://docs.databricks.com/aws/en/oltp/projects/lakebase-cdf · API: https://docs.databricks.com/api/postgres/v1/cdf-config

**Defined and executed as CODE (not UI)** — see `../reverse_sync_cdf.sh`:
```
databricks postgres create-cdf-config \
  projects/volta-plant-floor/branches/production/databases/databricks-postgres \
  serverless_stable_casaman_catalog dev_manffred_calvosanchez_volta_industrial ops \
  --cdf-config-id volta_ops_cdf
```
(The parent must be the **database** resource path `.../databases/databricks-postgres`; the CDF
management API is `POST /api/2.0/postgres/{parent}/cdf-configs`. DABs/Terraform have no native CDF
resource yet, so the Postgres CDF CLI/API is the code path.)

## Result
- CDF config `volta_ops_cdf` created (source Postgres schema `ops` → `serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial`).
- Applied changes to `ops.work_orders`: 3 inserts (seed) + 2 updates + 1 insert + 1 delete.
- Destination Delta table **`lb_work_orders_history`** captured the change history — see `reverse_sync_sample.json`.
- Columns: `_pg_change_type, _pg_lsn, _pg_xid, _timestamp, _sort_by, wo_id, line_id, action_type, status, approved_by, created_at, decided_at`.

## Prerequisites (all satisfied)
- Postgres 17 · `ops.work_orders` with `REPLICA IDENTITY FULL` · destination catalog on external S3
  storage (not default storage) · Lakebase CDF preview enabled on the workspace.
