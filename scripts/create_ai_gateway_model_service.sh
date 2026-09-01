#!/usr/bin/env bash
# Milestone 4 — Unity AI Gateway.
# Create a governed AI Gateway *model service* (Unity Catalog securable) that
# routes the Volta assistant's model calls to the pay-per-token foundation model
# databricks-gpt-5-4, with spend cap (rate limits), guardrails, and inference
# logging. Ref: https://docs.databricks.com/aws/en/ai-gateway/create-model-services
#
# No proxy token/secret is needed: a model service routes DIRECTLY to the
# system.ai foundation model via a pay-per-token destination.
#
# Usage: ./scripts/create_ai_gateway_model_service.sh [--profile <p>]
set -euo pipefail

PROFILE="${DATABRICKS_CONFIG_PROFILE:-vending-aws-casaman}"
[ "${1:-}" = "--profile" ] && PROFILE="$2"
DBX() { DATABRICKS_AUTH_STORAGE=plaintext databricks "$@" --profile "$PROFILE"; }

PARENT="schemas/serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial"
SERVICE_ID="volta_ai_gateway"
MODEL="models/system.ai.databricks-gpt-5-4"

echo "[gw] creating AI Gateway model service ${SERVICE_ID} in ${PARENT} → ${MODEL}"
DBX ai-gateway create-model-service "$PARENT" "$SERVICE_ID" \
  --comment "Volta Plant Floor — governed gateway to databricks-gpt-5-4 (spend cap + guardrails + inference logging), scoped to the plant." \
  --json '{
    "config": {
      "routing": {
        "destinations": [
          {
            "name": "primary",
            "destination_type": "DESTINATION_TYPE_PAY_PER_TOKEN_FOUNDATION_MODEL",
            "pay_per_token_config": { "model": "'"$MODEL"'" },
            "traffic_percentage": 100
          }
        ]
      }
    }
  }'

NAME="model-services/serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial.$SERVICE_ID"

# ── Inference logging: payloads → a governed UC Delta table ─────────────────
echo "[gw] enabling inference table (payload logging)"
DBX ai-gateway update-model-service "$NAME" config.inference_table --json '{
  "config": {
    "inference_table": {
      "parent": "'"$PARENT"'",
      "table_name_prefix": "volta_gw_inference"
    }
  }
}'

# ── Spend cap: rate limits (per-service + per-user, requests + tokens) ───────
# Enum values (discovered): key RATE_LIMIT_KEY_SERVICE / RATE_LIMIT_KEY_USER_DEFAULT,
# renewal_period RATE_LIMIT_RENEWAL_PERIOD_MINUTE. Values below are production-
# sane (a heavy agent turn is ~30-50K tokens, so per-user TPM stays well above
# one turn). For a hard demo test we temporarily set tokens=100 to force a 429.
echo "[gw] setting rate limits (spend cap)"
DBX ai-gateway update-model-service "$NAME" config.rate_limits --json '{
  "config": {
    "rate_limits": [
      {"key": "RATE_LIMIT_KEY_SERVICE",      "renewal_period": "RATE_LIMIT_RENEWAL_PERIOD_MINUTE", "requests": 200},
      {"key": "RATE_LIMIT_KEY_SERVICE",      "renewal_period": "RATE_LIMIT_RENEWAL_PERIOD_MINUTE", "tokens": 500000},
      {"key": "RATE_LIMIT_KEY_USER_DEFAULT", "renewal_period": "RATE_LIMIT_RENEWAL_PERIOD_MINUTE", "requests": 60},
      {"key": "RATE_LIMIT_KEY_USER_DEFAULT", "renewal_period": "RATE_LIMIT_RENEWAL_PERIOD_MINUTE", "tokens": 100000}
    ]
  }
}'

# ── Guardrail: blocks runaway "query all data" reads ────────────────────────
# In this Beta, model-service guardrails are a separate "service policy"
# securable (NOT config.guardrails). We created it in the AI Gateway UI as
# `block-bulk-data-exfiltration` (input policy). See gateway_service_README for
# the policy prompt. Verified: an all-data request is blocked, scoped queries pass.

echo "[gw] grant the app service principal EXECUTE on the model service"
DBX grants update model_service "serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial.$SERVICE_ID" \
  --json '{"changes":[{"principal":"e951229d-5569-44e0-a6ba-04da12135ecd","add":["EXECUTE"]}]}'

echo "[gw] final config:"
DBX ai-gateway get-model-service "$NAME" -o json
