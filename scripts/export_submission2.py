#!/usr/bin/env python3
"""Export Build-2 (app) evidence from the Lakebase app.* schema into submission2/.

Connects to the Lakebase Postgres endpoint and writes:
  - view_result.json     rows from submission2/view_query.sql (top 50 by exposure)
  - state_table.json     workflow-state / observability (conversations + messages:
                         trigger events + recorded decisions + tool calls + timestamps,
                         plus work_orders_app.audit_trail decisions when present)
  - assist_log.jsonl     one line per assistant turn: request + model response (+tools)
  - writeback_table.json app.work_orders_app rows (proposed action / approval / approver
                         / created + committed timestamps)
  - drafted_sample.md    the agent's auto-drafted work-order memo (from the assistant turn)

Creds via env: PGHOST, PGTOKEN, PGUSER (defaults to the workspace user).
"""
import os, re, json, sys, datetime
import psycopg

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "submission2")
HERE = os.path.dirname(os.path.abspath(__file__))


def jdefault(o):
    if isinstance(o, (datetime.datetime, datetime.date)):
        return o.isoformat()
    return str(o)


def rows_as_dicts(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def main():
    conn = psycopg.connect(
        host=os.environ["PGHOST"],
        user=os.environ.get("PGUSER", "manffred.calvosanchez@databricks.com"),
        password=os.environ["PGTOKEN"],
        dbname="databricks_postgres",
        sslmode="require",
    )
    cur = conn.cursor()

    # ── view_result.json — the live line-queue view (top 50 by exposure) ──
    with open(os.path.join(OUT, "view_query.sql")) as f:
        view_sql = f.read()
    # Run the exact view query but cap the sample for the evidence file.
    sample_sql = view_sql.rstrip().rstrip(";") + "\nLIMIT 50"
    cur.execute(sample_sql)
    view_rows = rows_as_dicts(cur)
    cur.execute("SELECT count(*) FROM app.line_status")
    total_lines = cur.fetchone()[0]
    with open(os.path.join(OUT, "view_result.json"), "w") as f:
        json.dump(
            {
                "view": "operations_line_queue (GET /api/lines)",
                "query_file": "view_query.sql",
                "total_rows_in_live_view": total_lines,
                "sample_rows_shown": len(view_rows),
                "note": "Live view returns all lines worst-exposure-first; top 50 shown as the representative sample.",
                "rows": view_rows,
            },
            f,
            indent=2,
            default=jdefault,
        )
    print(f"view_result.json: {len(view_rows)}/{total_lines} rows")

    # ── writeback_table.json — the writable action table ──
    cur.execute(
        """
        SELECT id, line_id, action_type AS proposed_action, part_id,
               predicted_downtime_cost_avoided_usd, status AS approval_status,
               approved_by AS approver, drafted_wo, audit_trail,
               created_at, decided_at AS committed_at
        FROM app.work_orders_app
        ORDER BY created_at DESC
        """
    )
    wo = rows_as_dicts(cur)
    with open(os.path.join(OUT, "writeback_table.json"), "w") as f:
        json.dump(
            {
                "table": "app.work_orders_app",
                "description": "App-owned writable action table. The agent's execute_maintenance_action writes an approved work order here inside a transaction.",
                "columns": [
                    "id", "line_id", "proposed_action", "part_id",
                    "predicted_downtime_cost_avoided_usd", "approval_status",
                    "approver", "drafted_wo", "audit_trail",
                    "created_at (created)", "committed_at (decided_at)",
                ],
                "row_count": len(wo),
                "rows": wo,
            },
            f,
            indent=2,
            default=jdefault,
        )
    print(f"writeback_table.json: {len(wo)} rows")

    # ── state_table.json — workflow-state / observability ──
    cur.execute(
        """
        SELECT m.conversation_id, c.title AS conversation_title, c.kind,
               m.position, m.role, m.content, m.thinking, m.trace_id, m.error, m.created_at
        FROM app.messages m
        JOIN app.conversations c ON c.id = m.conversation_id
        ORDER BY m.conversation_id, m.position
        """
    )
    events = []
    for r in rows_as_dicts(cur):
        thinking = r.get("thinking") or []
        tool_calls = [
            {"name": e.get("name"), "args": e.get("args")}
            for e in thinking if e.get("kind") == "tool_call"
        ]
        events.append({
            "conversation_id": str(r["conversation_id"]),
            "conversation_title": r["conversation_title"],
            "conversation_kind": r["kind"],
            "position": r["position"],
            "event_type": "trigger_event" if r["role"] == "user" else "recorded_decision",
            "role": r["role"],
            "content_preview": (r["content"] or "")[:400],
            "tool_calls": tool_calls,
            "trace_id": r["trace_id"],
            "error": r["error"],
            "timestamp": r["created_at"],
        })
    # Committed decisions from the work-order audit trail (if any).
    audit_events = []
    for row in wo:
        for a in (row.get("audit_trail") or []):
            audit_events.append({
                "work_order_id": row["id"],
                "line_id": row["line_id"],
                "action": a.get("action"),
                "by": a.get("by"),
                "tool": a.get("tool"),
                "notes": a.get("notes"),
                "timestamp": a.get("at"),
            })
    with open(os.path.join(OUT, "state_table.json"), "w") as f:
        json.dump(
            {
                "description": "Lakebase workflow-state & observability. Trigger events (user turns) and recorded decisions (assistant turns + the tool calls the agent made) with timestamps, from app.conversations + app.messages; plus committed decisions from app.work_orders_app.audit_trail.",
                "source_tables": ["app.conversations", "app.messages", "app.work_orders_app.audit_trail"],
                "interaction_events": events,
                "committed_decision_audit": audit_events,
            },
            f,
            indent=2,
            default=jdefault,
        )
    print(f"state_table.json: {len(events)} interaction events, {len(audit_events)} audit decisions")

    # ── assist_log.jsonl — request + model response per assistant turn ──
    cur.execute(
        """
        SELECT conversation_id, position, role, content, thinking, trace_id, created_at
        FROM app.messages ORDER BY conversation_id, position
        """
    )
    msgs = rows_as_dicts(cur)
    # pair each assistant message with the immediately preceding user message
    by_conv = {}
    for m in msgs:
        by_conv.setdefault(str(m["conversation_id"]), []).append(m)
    log_lines = []
    for conv, ms in by_conv.items():
        for i, m in enumerate(ms):
            if m["role"] != "assistant":
                continue
            req = ""
            for j in range(i - 1, -1, -1):
                if ms[j]["role"] == "user":
                    req = ms[j]["content"]
                    break
            content = m["content"] or ""
            tools = [e.get("name") for e in (m["thinking"] or []) if e.get("kind") == "tool_call"]
            # Classify: a what-if actually DELIVERED a ranked net-value
            # comparison of the actions (the markdown table). An explanation
            # that merely mentions "net values" (e.g. says they're unavailable)
            # is NOT a what-if.
            has_ranked_table = bool(
                re.search(r"pull_now\s*\|", content)
                or "Est. Net Value" in content
                or "Predicted Cost Avoided" in content
            )
            kind = (
                "what_if"
                if ("rank_maintenance_actions" in tools and has_ranked_table)
                else "explanation"
            )
            log_lines.append({
                "kind": kind,
                "conversation_id": conv,
                "request": req,
                "response": content,
                "tools_used": tools,
                "trace_id": m["trace_id"],
                "timestamp": jdefault(m["created_at"]),
            })
    with open(os.path.join(OUT, "assist_log.jsonl"), "w") as f:
        for line in log_lines:
            f.write(json.dumps(line, default=jdefault) + "\n")
    kinds = {}
    for l in log_lines:
        kinds[l["kind"]] = kinds.get(l["kind"], 0) + 1
    print(f"assist_log.jsonl: {len(log_lines)} turns {kinds}")

    # ── drafted_sample.md — the agent's auto-drafted work-order memo ──
    # Prefer a committed work order's drafted_wo; else extract the ```markdown
    # work-order block the agent drafted in its response.
    drafted = None
    source = None
    if wo and wo[0].get("drafted_wo"):
        drafted = wo[0]["drafted_wo"]
        source = f"app.work_orders_app.drafted_wo (work order {wo[0]['id']}, line {wo[0]['line_id']})"
    else:
        for m in msgs:
            if m["role"] == "assistant" and m["content"]:
                blk = re.search(r"```(?:markdown)?\s*(.*?)```", m["content"], re.S)
                if blk and "Work Order" in blk.group(1):
                    drafted = blk.group(1).strip()
                    source = "assistant auto-draft (agent response, pre-approval)"
                    break
    if drafted:
        with open(os.path.join(OUT, "drafted_sample.md"), "w") as f:
            f.write(f"<!-- Auto-drafted by the Volta Plant Floor agent. Source: {source} -->\n\n")
            f.write(drafted + "\n")
        print(f"drafted_sample.md: written from {source}")
    else:
        print("drafted_sample.md: NO drafted memo found yet (run the arc to the draft/approve step)")

    conn.close()


if __name__ == "__main__":
    main()
