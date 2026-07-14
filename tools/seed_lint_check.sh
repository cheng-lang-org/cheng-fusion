#!/usr/bin/env bash
# seed_lint_check.sh -- pre-land lint gate for Cheng compiler source changes.
#
# Lesson: the self-hosted DRV csg expr layer rejects FUNCTION-LOCAL
# "redundant explicit default init" (e.g. `    var x: int32 = 0`) that the
# stage3 seed frontend tolerates. This asymmetry killed two 30-minute chain
# ignitions 18s into their GEN2 self-bake (chain22 nonExactCount 2026-07-14,
# chain31 bareDerefPointeeSize 2026-07-15): invisible at DRV-bake and probe
# level, fatal at self-bake. Module-level globals with `= 0` are tolerated
# (t52a fixture proves it), so only INDENTED (function-local) declarations
# are flagged. Run on every diff/file touching src/**/*.cheng BEFORE landing.
#
# Usage:
#   seed_lint_check.sh <file.cheng> [...]        # scan source files
#   seed_lint_check.sh <fix.diff> [...]          # scan only added lines
# Exit 1 with offending lines; 0 clean.
set -uo pipefail
# indented local var/let with integer type explicitly initialized to 0
SRC_PAT='^[[:space:]]+(var|let)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*:[[:space:]]*(int8|int16|int32|int64|uint8|uint16|uint32|uint64)[[:space:]]*=[[:space:]]*0[[:space:]]*$'
DIFF_PAT='^\+[[:space:]]+(var|let)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*:[[:space:]]*(int8|int16|int32|int64|uint8|uint16|uint32|uint64)[[:space:]]*=[[:space:]]*0[[:space:]]*$'
rc=0
for f in "$@"; do
  case "$f" in
    *.diff|*.patch) hits=$(grep -nE "$DIFF_PAT" "$f" || true);;
    *)              hits=$(grep -nE "$SRC_PAT" "$f" || true);;
  esac
  if [ -n "$hits" ]; then
    echo "SEED_LINT_HIT $f:"
    echo "$hits"
    rc=1
  fi
done
[ $rc -eq 0 ] && echo "seed_lint_check=clean"
exit $rc
