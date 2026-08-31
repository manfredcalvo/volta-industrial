#!/usr/bin/env bash
# Reverse Lakehouse Sync as CODE (not UI) — Lakebase Change Data Feed (CDF).
# Streams every insert/update/delete on writable Postgres tables in schema `ops` back into
# Unity Catalog Delta tables `lb_<table>_history` (SCD-style change history with system-metadata
# columns _pg_change_type, _pg_lsn, _pg_xid, _timestamp, _sort_by), flushed ~every 15s.
#
# Ref: https://docs.databricks.com/aws/en/oltp/projects/lakebase-cdf
#
# NOTE ON "as code": Databricks Asset Bundles (CLI v1.14.1) and the Terraform provider do NOT yet
# expose a native resource for Lakebase CDF. The code-based, non-UI mechanism is the Postgres CDF
# API, driven here by the Databricks CLI `databricks postgres *-cdf-config` commands. This script is
# the version-controlled definition of the sync.
#
# Prerequisites (already satisfied):
#   - Postgres 17 (16/17/18 supported).
#   - REPLICA IDENTITY FULL on every participating table:  ALTER TABLE ops.work_orders REPLICA IDENTITY FULL;
#   - Destination catalog has EXTERNAL managed storage (serverless_stable_casaman_catalog -> s3://...), not default storage.
#   - Lakebase Change Data Feed PREVIEW enabled on the workspace (Settings -> Previews). One-time admin toggle.
set -euo pipefail

PROFILE="${DATABRICKS_PROFILE:-vending-aws-casaman}"
PARENT="projects/volta-plant-floor/branches/production/databases/databricks-postgres"
DEST_CATALOG="serverless_stable_casaman_catalog"
DEST_SCHEMA="dev_manffred_calvosanchez_volta_industrial"
SOURCE_PG_SCHEMA="ops"
CDF_ID="volta_ops_cdf"

# Define the reverse sync as code:
databricks postgres create-cdf-config \
  "$PARENT" "$DEST_CATALOG" "$DEST_SCHEMA" "$SOURCE_PG_SCHEMA" \
  --cdf-config-id "$CDF_ID" \
  --profile "$PROFILE"

# Inspect status:
databricks postgres get-cdf-status "$PARENT/cdf-configs/$CDF_ID" --profile "$PROFILE" || true
databricks postgres list-cdf-statuses "$PARENT" --profile "$PROFILE" || true
