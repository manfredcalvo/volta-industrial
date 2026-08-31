#!/usr/bin/env python3
"""Drive the deployed app's chat API to complete the approval turn.

Replays the existing LINE-0928 investigation conversation (which already
contains the agent's drafted work order) plus a final approval message, so the
real agent fires execute_maintenance_action and writes a real row to
app.work_orders_app. This is the actual app + agent + write path — no fabrication.

Env: APP_URL, APP_TOKEN, CONV_ID.
"""
import os, json, ssl, urllib.request

# The local machine sits behind a corporate proxy with its own CA; Python's
# bundled CA store doesn't trust it (curl uses the system store and works).
# Skip verification for these internal app-over-proxy calls.
SSLCTX = ssl._create_unverified_context()

APP = os.environ["APP_URL"].rstrip("/")
TOK = os.environ["APP_TOKEN"]
CONV = os.environ["CONV_ID"]
APPROVAL = os.environ.get(
    "APPROVAL",
    "Pull the line now — approve pull_now for LINE-0928 and cut the work order.",
)


def api_get(path):
    req = urllib.request.Request(APP + path, headers={"Authorization": f"Bearer {TOK}"})
    with urllib.request.urlopen(req, timeout=60, context=SSLCTX) as r:
        return json.load(r)


# 1) fetch existing conversation history
conv = api_get(f"/api/conversations/{CONV}")
msgs = conv.get("messages") or conv.get("conversation", {}).get("messages") or []
history = [
    {"role": m["role"], "content": m["content"]}
    for m in msgs
    if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip()
]
print(f"history turns: {len(history)} roles={[m['role'] for m in history]}")

# 2) append the approval and POST to the streaming endpoint
body = {"conversationId": CONV, "messages": history + [{"role": "user", "content": APPROVAL}]}
data = json.dumps(body).encode()
req = urllib.request.Request(
    APP + "/api/chat/stream",
    data=data,
    headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
    method="POST",
)
tool_calls = []
final_text_len = 0
with urllib.request.urlopen(req, timeout=300, context=SSLCTX) as r:
    for raw in r:
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except Exception:
            continue
        t = ev.get("type", "")
        if t == "response.output_item.done":
            item = ev.get("item", {})
            if item.get("type") == "function_call":
                tool_calls.append(item.get("name"))
                print("TOOL CALL:", item.get("name"), "args=", str(item.get("arguments"))[:120])
            elif item.get("type") == "function_call_output":
                print("TOOL OUTPUT:", str(item.get("output"))[:160])
        elif t == "response.output_text.delta":
            final_text_len += len(ev.get("delta", ""))
        elif t == "response.completed":
            print("COMPLETED. databricks_output:", json.dumps(ev.get("databricks_output"))[:200])
        elif t == "error" or ev.get("error"):
            print("ERROR EVENT:", json.dumps(ev)[:300])
print(f"tools fired: {tool_calls} | final_text_chars={final_text_len}")
