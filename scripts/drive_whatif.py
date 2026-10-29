#!/usr/bin/env python3
"""Drive the deployed app's agent through a live ML what-if and log it as text evidence.

Asks the real agent (POST /api/chat/stream) a question that should route to the
predict_action_value tool → the failure_recommender serving endpoint, and writes the tool
calls, tool outputs, and the agent's final answer to fe_bar/evidence/agent_whatif_log.md.

Env: APP_URL, APP_TOKEN (a workspace OAuth token, e.g. `databricks auth token`).
"""
import datetime as dt
import json
import os
import pathlib
import ssl
import urllib.request

# Corporate proxy CA isn't in Python's bundled store (see drive_approval.py).
SSLCTX = ssl._create_unverified_context()
APP = os.environ["APP_URL"].rstrip("/")
TOK = os.environ["APP_TOKEN"]
QUESTION = os.environ.get(
    "QUESTION",
    "For LINE-04: what does the model recommend today, and what if the replacement part were "
    "stocked locally? Compare both scenarios with the dollars.",
)
OUT = pathlib.Path(os.environ.get("OUT", "fe_bar/evidence/agent_whatif_log.md"))

body = json.dumps({"conversationId": None, "messages": [{"role": "user", "content": QUESTION}]}).encode()
req = urllib.request.Request(
    APP + "/api/chat/stream", data=body, method="POST",
    headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
)
calls, outputs, text = [], [], []
with urllib.request.urlopen(req, timeout=600, context=SSLCTX) as r:
    for raw in r:
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        t = ev.get("type", "")
        if t == "response.output_item.done":
            item = ev.get("item", {})
            if item.get("type") == "function_call":
                calls.append((item.get("name"), item.get("arguments")))
                print("TOOL CALL:", item.get("name"), item.get("arguments"))
            elif item.get("type") == "function_call_output":
                outputs.append(item.get("output"))
        elif t == "response.output_text.delta":
            text.append(ev.get("delta", ""))
        elif t == "error" or ev.get("error"):
            print("ERROR EVENT:", json.dumps(ev)[:400])

answer = "".join(text).strip()


def fmt(o) -> str:
    try:
        return json.dumps(json.loads(o) if isinstance(o, str) else o, indent=2)
    except (TypeError, json.JSONDecodeError):
        return str(o)


md = [
    "# App agent → live ML what-if (predict_action_value → failure_recommender endpoint)",
    "",
    f"Captured {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M UTC} from the deployed app "
    f"`{APP}` via `scripts/drive_whatif.py` (real agent turn; model calls routed through the "
    "Unity AI Gateway model service `volta_ai_gateway`).",
    "",
    f"**User:** {QUESTION}",
    "",
    "## Tool calls (in order)",
    "",
]
for i, (name, args) in enumerate(calls, 1):
    md += [f"{i}. `{name}` — `{args}`"]
md += ["", "## Tool outputs", ""]
for (name, _), out in zip(calls, outputs):
    md += [f"### `{name}`", "", "```json", fmt(out)[:2500], "```", ""]
md += ["## Agent answer", "", answer, ""]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(md))
print(f"tools fired: {[c[0] for c in calls]} | answer_chars={len(answer)} → {OUT}")
