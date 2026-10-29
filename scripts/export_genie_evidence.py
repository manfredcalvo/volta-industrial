"""Ask the Volta Genie space real questions and commit the answers as text evidence.

For each question: the natural-language answer, the SQL Genie generated, and the first rows of
the result — written to fe_bar/evidence/genie_qa.md.

Usage: python scripts/export_genie_evidence.py --profile fevm-casaman-aws-stable --space <space_id>
"""

import argparse
import datetime as dt
import pathlib

from databricks.sdk import WorkspaceClient

QUESTIONS = [
    "What's our downtime exposure right now, and how many open work orders?",
    "Which plants is the failure risk concentrated in?",
    "Should we pull LINE-04 now or run it to the end of the shift?",
    "How many lines should we pull now vs expedite, and how much downtime cost does each avoid?",
    "Which model version scored the maintenance recommendations?",
]

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--space", required=True)
ap.add_argument("--out", default="fe_bar/evidence/genie_qa.md")
args = ap.parse_args()

w = WorkspaceClient(profile=args.profile)
lines = [
    "# Genie Agent — natural-language questions over the governed gold tables",
    "",
    f"Space `{args.space}` (\"Volta Plant Floor\") over `gold_line_status`, `gold_open_atrisk`, "
    "`gold_maintenance_recommendations` (ML-scored) and the `mv_line_risk` metric view. "
    f"Captured {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M UTC} via the Genie Conversation API "
    "(`scripts/export_genie_evidence.py`).",
    "",
]

for i, q in enumerate(QUESTIONS, 1):
    msg = w.genie.start_conversation_and_wait(args.space, q)
    answer, sql_text, table = "", None, ""
    for att in msg.attachments or []:
        if att.text and att.text.content:
            answer = att.text.content
        if att.query:
            sql_text = att.query.query
            answer = answer or (att.query.description or "")
            res = w.genie.get_message_attachment_query_result(
                args.space, msg.conversation_id, msg.message_id, att.attachment_id
            ).statement_response
            cols = [c.name for c in res.manifest.schema.columns]
            rows = (res.result.data_array or [])[:8] if res.result else []
            table = "\n".join(
                ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
                + ["| " + " | ".join("" if v is None else str(v) for v in r) + " |" for r in rows]
            )
    lines += [f"## Q{i}. {q}", "", f"**Genie:** {answer.strip()}", ""]
    if sql_text:
        lines += ["```sql", sql_text.strip(), "```", "", table, ""]
    print(f"[{i}/{len(QUESTIONS)}] {q} → {msg.status}")

out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(lines))
print(f"wrote {out} ({out.stat().st_size:,} chars)")
