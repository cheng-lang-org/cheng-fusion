#!/usr/bin/env bash
# chain_journal.sh -- pretty-print an ignition-chain journal.jsonl.
#
# Every chain session (chain19..chain30 this campaign) logs one JSON object
# per stage (drvBake/probes/gen2Bake/terminal/oracle/done) to a journal.jsonl.
# Reading it back for a status update meant writing the same ad-hoc
# `python3 -c "import json; ..."` one-liner from scratch 7 times this
# session (stage/rc/zc/passCount projections, terminal/oracle per-case
# breakdown, final verdict). This script is that snippet, sedimented once.
#
# Usage:
#   chain_journal.sh <journal.jsonl>
#
# Prints, in journal order, one block per stage with the fields that stage
# actually carries (a stage missing a field -- e.g. "probes" has no zcTotal
# -- simply omits that line, it is never fabricated as 0/null). Malformed
# JSON lines are reported and skipped, not silently dropped.
#
# Exit codes: 0 = journal read and printed (regardless of what the chain's
# own verdict says); 2 = usage/file error.
set -uo pipefail

if [ "$#" -ne 1 ]; then
    echo "usage: chain_journal.sh <journal.jsonl>" >&2
    exit 2
fi

JOURNAL="$1"
[ -f "$JOURNAL" ] || { echo "chain_journal_error=file_missing path=$JOURNAL" >&2; exit 2; }

python3 - "$JOURNAL" <<'PYEOF'
import json
import sys

path = sys.argv[1]

with open(path) as f:
    lines = f.readlines()

for lineno, raw in enumerate(lines, 1):
    raw = raw.strip()
    if not raw:
        continue
    try:
        rec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"--- line {lineno}: MALFORMED JSON ({e}) ---")
        print(f"    raw: {raw[:200]}")
        continue

    stage = rec.get("stage", "<no-stage-field>")
    print(f"--- stage={stage} (line {lineno}) ---")

    for key in ("ts", "rc", "wallMs", "ok", "timedOut", "zcTotal"):
        if key in rec:
            print(f"  {key}={rec[key]}")

    if "bails" in rec:
        bails = rec["bails"]
        print(f"  bails={bails if bails else '[]'}")

    if "stderrTail" in rec and rec["stderrTail"]:
        tail = rec["stderrTail"].replace("\n", " \\n ")
        print(f"  stderrTail={tail[:300]}")

    if "passCount" in rec or "total" in rec:
        pc = rec.get("passCount", "?")
        tot = rec.get("total", "?")
        print(f"  passCount={pc}/{tot}")

    for list_key in ("probes", "terminal", "oracle"):
        if list_key not in rec:
            continue
        entries = rec[list_key]
        print(f"  {list_key} ({len(entries)} entries):")
        for e in entries:
            name = e.get("name", "<unnamed>")
            status = "PASS" if e.get("pass") else "FAIL"
            rc_field = e.get("rc", e.get("compileRc", "?"))
            expect = e.get("expect", "?")
            note = e.get("note", "")
            extra = f" note={note}" if note else ""
            print(f"    {status} {name} rc={rc_field} expect={expect}{extra}")

    if "verdict" in rec:
        print(f"  verdict={rec['verdict']}")

    print()
PYEOF
