#!/usr/bin/env python3
"""Export the app's AI Gateway inference table into submission3/app_inference_table.json.

Shows: the app's calls routed through the gateway, the budget block (429 once the
token threshold is crossed), and the guardrail blocking the runaway all-data read.

Queries the inference table via the Databricks SQL warehouse (aitools query CLI).
"""
import subprocess, json, os

PROFILE = "vending-aws-casaman"
T = "serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial.volta_gw_inference_payload"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "submission3", "app_inference_table.json")


def q(sql):
    env = {**os.environ, "DATABRICKS_AUTH_STORAGE": "plaintext"}
    r = subprocess.run(
        ["databricks", "experimental", "aitools", "tools", "query", sql, "--profile", PROFILE],
        capture_output=True, text=True, env=env,
    )
    try:
        return json.loads(r.stdout)
    except Exception:
        print("query failed:", r.stdout[:300], r.stderr[:300]); return []


COLS = ("event_time, api_type, destination_name, destination_model, status_code, "
        "requester, latency_ms, logging_error_codes, left(request, 400) AS request_preview, "
        "left(response, 500) AS response_preview")

summary = q(f"SELECT status_code, count(*) AS n FROM {T} GROUP BY status_code ORDER BY status_code")
routed = q(f"SELECT {COLS} FROM {T} WHERE status_code=200 AND lower(response) NOT LIKE '%service policy%' ORDER BY event_time DESC LIMIT 3")
guardrail = q(f"SELECT {COLS} FROM {T} WHERE lower(response) LIKE '%service policy%' OR lower(response) LIKE '%block-bulk%' ORDER BY event_time DESC LIMIT 2")
budget = q(f"SELECT {COLS} FROM {T} WHERE status_code=429 ORDER BY event_time DESC LIMIT 3")

out = {
    "description": "App AI Gateway inference table (payload logging). The Volta app's model calls route through the model service serverless_stable_casaman_catalog.dev_manffred_calvosanchez_volta_industrial.volta_ai_gateway (→ databricks-gpt-5-4). This export shows: (a) calls routed through the gateway, (b) the budget block (HTTP 429 once the token-per-minute cap is crossed), (c) the guardrail blocking the runaway all-data read (block-bulk-data-exfiltration service policy).",
    "table": T,
    "status_code_summary": summary,
    "calls_routed_through_gateway": routed,
    "budget_block_rejections_429": budget,
    "guardrail_blocked_all_data_read": guardrail,
}
json.dump(out, open(OUT, "w"), indent=2)
print(f"wrote {OUT}")
print("summary:", summary)
print("routed rows:", len(routed), "| budget(429) rows:", len(budget), "| guardrail rows:", len(guardrail))
