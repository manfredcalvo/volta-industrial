# Build 3 — Unity AI Gateway governance (submission3)

The Volta assistant's model calls run through a Unity AI Gateway **model service**
(`serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial.volta_ai_gateway`
→ `databricks-gpt-5-4`), governed by a spend cap (rate limits), a custom guardrail,
and inference logging.

## Evidence → file map

| # | Requirement | File | Status |
|---|-------------|------|--------|
| 1 | Gateway model-service + inference-table creation script | `gateway_service.txt` | ✅ the `databricks ai-gateway create-model-service` script + inference-table + rate-limit config + SP grant |
| 2 | App inference table — calls routed through the gateway, the budget block, and the guardrail blocking the all-data read | `app_inference_table.json` + **`build3_gateway_execution.ipynb`** (executed notebook, real outputs) | ✅ routed calls + **7× HTTP 429 budget blocks** (token cap crossed) from the inference table; guardrail block (`block-bulk-data-exfiltration` policy) as a live gateway call. **`build3_gateway_execution.ipynb` is the execution evidence** — queries the inference table (16 rows; 9× 200, 7× 429; the `REQUEST_LIMIT_EXCEEDED` rows; routed calls) + `system.ai_gateway.usage`, with cell outputs |
| — | Serving-endpoint spec enabling the inference table (auto-capture) | `build_as_code/serving_endpoint_ai_gateway.json` | ✅ build construct — a serving-endpoint spec with `ai_gateway.inference_table_config` (auto-capture) + usage tracking + rate limits + PII guardrails. The **deployed** gateway uses the AI Gateway *model service* form (same inference-table auto-capture, via `config.inference_table`); deploying this serving-endpoint variant needs the `{{secrets/volta_gateway/proxy_token}}` secret (follow-up) |
| 3 | Gateway usage dashboard — usage & budgets across the app, coding agent, and MCP | `gateway_usage.lvdash.json` | ✅ deployed + validated (dashboard_id 01f1a5aba7a712a6896ce750c401df53); datasets over `system.ai_gateway.usage` grouped by workload type (MODEL_SERVICE / MCP_SERVICE / MODEL_PROVIDER_SERVICE), status codes (429 budget blocks), top services, spend |
| 4 | Coding-agent thread — ucode call, MCP config, agent calling the Slack MCP | `agent_thread.txt` | ⏳ **follow-up** (deferred): needs a ucode coding agent + a governed Slack MCP through the gateway |
| 5 | [OPTIONAL] Coding agent's inference table, distinct from the app's | — | ⏳ follow-up (part of the item-4 workstream) |

## How it works
`app/server/agent/plantfloor.ts` posts to `${host}/ai-gateway/openai/v1` with the
model-service UC name; the gateway governs the call (spend cap + guardrail + inference
logging) and forwards to `databricks-gpt-5-4`. The gateway serves the Responses API,
so the agent's reasoning stream is preserved. The app SP has `EXECUTE` on the model service.

## Verified behaviour
- **Routed:** live agent turns answer via the gateway (LINE-04 investigation + `ask_data`), model reported as `gpt-5.4`.
- **Spend cap:** a burst > the token-per-minute cap returns HTTP 429 `REQUEST_LIMIT_EXCEEDED` ("Tokens-per-minute (TPM) rate limit exceeded") — captured in `app_inference_table.json`.
- **Guardrail:** an all-data / "dump everything" request is blocked by the `block-bulk-data-exfiltration` service policy; scoped questions pass — captured in `app_inference_table.json`.
- **Inference logging:** `config.inference_table` → Delta table `…volta_gw_inference_payload` (payloads) + `system.ai_gateway.usage` (usage) + `system.ai_gateway.external_model_spend` (spend).

## Notes
- The token cap was set to 100 TPM for the block test; bump to ~100K/user + 500K/service for real use (a heavy agent turn is ~30–50K tokens).
- Guardrails are a separate "service policy" securable in this Beta (not `config.guardrails`); created in the AI Gateway UI as `block-bulk-data-exfiltration`.
