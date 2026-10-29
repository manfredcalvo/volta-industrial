"""Assemble fe_bar/ — the curated, self-contained folder submitted to the FE Bar evaluator.

The evaluator reads at most 30 files, 9,000 chars each, 90,000 chars total, so this copies the
sources that carry the build (pipeline SQL, ML notebooks, the agent's ML tool, bundle, gateway)
into fe_bar/build/, next to SUBMISSION.md and the exported run evidence in fe_bar/evidence/.
The canonical sources stay where they are in the repo; rerun this after changing them.
Fails if any budget is exceeded.

Usage: python scripts/build_fe_bar_folder.py
"""

import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "fe_bar"
BUILD = OUT / "build"
MAX_FILES, MAX_FILE, MAX_TOTAL = 30, 9000, 90000

COPY = [
    "transformation/silver_telemetry.sql",
    "transformation/silver_maintenance.sql",
    "transformation/note_risk_flags.sql",
    "transformation/gold_line_status.sql",
    "transformation/gold_open_atrisk.sql",
    "transformation/gold_maintenance_outcomes.sql",
    "transformation/gold_recommendations_heuristic.sql",
    "ml/train_register.py",
    "ml/score_serve.py",
    "app/server/agent/tools/recommender.ts",
    "app/app.yaml",
    "metric_view.yaml",
    "scripts/create_ai_gateway_model_service.sh",
]


def strip_yaml_comments(text: str) -> str:
    return "\n".join(l for l in text.splitlines() if not re.match(r"^\s*#", l)) + "\n"


def agent_tools_excerpt() -> str:
    src = (ROOT / "app/server/agent/plantfloor.ts").read_text().splitlines()
    start = next(i for i, l in enumerate(src) if l.startswith("function normalizeLineId"))
    pv = next(i for i, l in enumerate(src) if "const predictActionValue = tool({" in l)
    pv_end = next(i for i in range(pv, len(src)) if "// ── search_parts" in src[i])
    reg = next(i for i, l in enumerate(src) if "const tools: Tool[] = [" in l)
    reg_end = next(i for i in range(reg, len(src)) if src[i].startswith("  return tools"))
    head = [f"// EXCERPT of app/server/agent/plantfloor.ts (full file: {len(src)} lines). Shows the line-id",
            "// normalizer, the predict_action_value tool (live ML what-if → failure_recommender",
            "// serving endpoint) and how it is registered. Other tools are elided.", ""]
    return "\n".join(head + src[start:start + 4] + ["", "function makeTools(ctx: AgentContext): Tool[] {",
                                                     "  // … find_atrisk_line, rank_maintenance_actions …", ""]
                     + src[pv - 5:pv_end] + ["  // … search_parts, execute_maintenance_action …", ""]
                     + src[reg:reg_end + 2]) + "\n"


if BUILD.exists():
    shutil.rmtree(BUILD)
for rel in COPY:
    dst = BUILD / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / rel, dst)
(BUILD / "databricks.yml").write_text(strip_yaml_comments((ROOT / "databricks.yml").read_text()))
(BUILD / "app/server/agent/plantfloor_tools_excerpt.ts").write_text(agent_tools_excerpt())

files = sorted(p for p in OUT.rglob("*") if p.is_file())
total, bad = 0, []
for p in files:
    n = len(p.read_text())
    total += n
    flag = "  <-- OVER 9000" if n > MAX_FILE else ""
    bad += [p] if flag else []
    print(f"{n:>6}  {p.relative_to(OUT)}{flag}")
print(f"\n{len(files)} files, {total:,} chars (limits: {MAX_FILES} files, {MAX_TOTAL:,} chars)")
if bad or len(files) > MAX_FILES or total > MAX_TOTAL:
    sys.exit("FE Bar evaluator budget exceeded")
