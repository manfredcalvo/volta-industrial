#!/usr/bin/env python3
"""Drive the deployed app to run the search_parts tool, capturing evidence that
the agent retrieves from the Build-1 Lakebase Search index (parts_search).

Creates a fresh conversation, sends a parts-search prompt, and records the
search_parts tool call + output to submission2/search_execution.json.

Env: APP_URL, APP_TOKEN.
"""
import os, json, ssl, urllib.request

SSLCTX = ssl._create_unverified_context()
APP = os.environ["APP_URL"].rstrip("/")
TOK = os.environ["APP_TOKEN"]
PROMPT = os.environ.get(
    "PROMPT",
    "Search the parts catalog for a bearing seal / coupling for LINE-0928. "
    "List the top candidate parts with whether they're in local stock and the lead time.",
)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "submission2")


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        APP + path, data=data, method=method,
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60, context=SSLCTX) as r:
        return json.load(r)


conv = api("POST", "/api/conversations", {"title": "Parts search — Build-1 Lakebase Search index"})
cid = conv["id"]
print("conversation:", cid)

body = {"conversationId": cid, "messages": [{"role": "user", "content": PROMPT}]}
data = json.dumps(body).encode()
req = urllib.request.Request(
    APP + "/api/chat/stream", data=data, method="POST",
    headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
)
search_call = None
search_output = None
final = ""
with urllib.request.urlopen(req, timeout=300, context=SSLCTX) as r:
    pending_call = None
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
                pending_call = item
                if item.get("name") == "search_parts":
                    search_call = item
                print("TOOL CALL:", item.get("name"), str(item.get("arguments"))[:140])
            elif item.get("type") == "function_call_output":
                if pending_call and pending_call.get("name") == "search_parts":
                    search_output = item.get("output")
                print("TOOL OUTPUT:", str(item.get("output"))[:180])
        elif t == "response.output_text.delta":
            final += ev.get("delta", "")

result = {
    "prompt": PROMPT,
    "conversation_id": cid,
    "tool": "search_parts",
    "retrieves_from": "Build-1 Lakebase Search index: dev_manffred_calvosanchez_volta_industrial.parts_search (parts_search_bm25 lakebase_bm25 index) — NOT a separate app-owned store",
    "tool_call": search_call,
    "tool_output": search_output,
    "assistant_final_answer": final,
}
with open(os.path.join(OUT, "search_execution.json"), "w") as f:
    json.dump(result, f, indent=2)
print("search_call captured:", bool(search_call), "| output captured:", bool(search_output))
