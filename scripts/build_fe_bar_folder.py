"""Check fe_bar/ (narrative + evidence) against the FE Bar evaluator's reading budget.

The evaluator reads at most 30 files, 9,000 chars each, 90,000 chars in total. The code itself is
read from its real location in the repo (transformation/, ml/, app/, scripts/), so fe_bar/ holds
only SUBMISSION.md, BUILD_NOTES.md and the exported evidence. Fails if any limit is exceeded.

Usage: python scripts/build_fe_bar_folder.py
"""

import pathlib
import sys

OUT = pathlib.Path(__file__).resolve().parents[1] / "fe_bar"
MAX_FILES, MAX_FILE, MAX_TOTAL = 30, 9000, 90000

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
